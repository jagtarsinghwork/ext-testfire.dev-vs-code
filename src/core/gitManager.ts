import * as cp from 'child_process';
import * as vscode from 'vscode';
import { GitInfo, GitChange, GitCommit } from '../types';

export interface GitOperationOptions {
  dryRun?: boolean;
  interactive?: boolean;
  force?: boolean;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  error?: string;
  stdout?: string;
  stderr?: string;
}

export interface PushOptions extends GitOperationOptions {
  setUpstream?: boolean;
  tags?: boolean;
  force?: boolean;
}

export interface PullOptions extends GitOperationOptions {
  rebase?: boolean;
  ff?: 'only' | 'no' | boolean;
}

export interface CommitOptions extends GitOperationOptions {
  amend?: boolean;
  allowEmpty?: boolean;
  noVerify?: boolean;
}

export class GitManager {
  constructor(private workspaceRoot: string) {}

  async getInfo(): Promise<GitInfo> {
    const [branch, remoteUrl, lastCommit, changes, commits, gitignorePatterns] =
      await Promise.all([
        this.getBranch(),
        this.getRemoteUrl(),
        this.getLastCommit(),
        this.getUncommittedChanges(),
        this.getRecentCommits(10),
        this.getGitignorePatterns(),
      ]);

    return {
      branch,
      remoteUrl,
      lastCommit,
      uncommittedChanges: changes,
      recentCommits: commits,
      gitignorePatterns,
    };
  }

  private async getGitignorePatterns(): Promise<string[]> {
    const fs = require('fs');
    const path = require('path');
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        return content
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('#'));
      }
    } catch {}
    return [];
  }

  async getBranch(): Promise<string> {
    try {
      return (await this.exec('git rev-parse --abbrev-ref HEAD')).trim();
    } catch {
      return 'unknown';
    }
  }

  async getRemoteUrl(): Promise<string> {
    try {
      return (await this.exec('git remote get-url origin')).trim();
    } catch {
      return '';
    }
  }

  async getLastCommit(): Promise<string> {
    try {
      return (await this.exec('git log -1 --oneline')).trim();
    } catch {
      return '';
    }
  }

  async getUncommittedChanges(): Promise<GitChange[]> {
    try {
      const output = await this.exec('git status --porcelain');
      const changes: GitChange[] = [];

      for (const line of output.split('\n').filter(Boolean)) {
        const status = line.substring(0, 2).trim();
        const file = line.substring(3).trim();

        let changeStatus: GitChange['status'];
        switch (status) {
          case 'M':
            changeStatus = 'modified';
            break;
          case 'A':
            changeStatus = 'added';
            break;
          case 'D':
            changeStatus = 'deleted';
            break;
          case 'R':
            changeStatus = 'renamed';
            break;
          case '??':
            changeStatus = 'untracked';
            break;
          default:
            changeStatus = 'modified';
        }

        changes.push({ file, status: changeStatus });
      }

      return changes;
    } catch {
      return [];
    }
  }

  async getRecentCommits(count: number): Promise<GitCommit[]> {
    try {
      const format = '%H|||%s|||%an|||%ai';
      const output = await this.exec(
        `git log -${count} --pretty=format:"${format}"`,
      );
      const commits: GitCommit[] = [];

      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.replace(/^"|"$/g, '').split('|||');
        if (parts.length >= 4) {
          commits.push({
            hash: parts[0],
            message: parts[1],
            author: parts[2],
            date: parts[3],
            files: [],
          });
        }
      }

      return commits;
    } catch {
      return [];
    }
  }

  async getFileDiff(filePath: string): Promise<string> {
    try {
      const diff = await this.exec(`git diff -- "${filePath}"`);
      if (!diff.trim()) {
        return await this.exec(`git diff --cached -- "${filePath}"`);
      }
      return diff;
    } catch {
      return '';
    }
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.exec('git rev-parse --is-inside-work-tree');
      return true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Stage specific files for commit
   * @param files Array of file paths to stage (relative to workspace root)
   * @param options Operation options
   */
  async stageFiles(files: string[], options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (files.length === 0) {
        return {
          success: false,
          message: 'No files provided to stage',
          error: 'Empty file list'
        };
      }

      if (options.interactive) {
        const confirm = await this.showConfirmation(
          `Stage ${files.length} file(s)?`,
          files.join('\n')
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const fileArgs = files.map(f => `"${f}"`).join(' ');
      const command = `git add ${fileArgs}`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would stage: ${files.join(', ')}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully staged ${files.length} file(s)`,
        stdout
      };
    } catch (error) {
      return this.handleError('stage files', error);
    }
  }

  /**
   * Stage all changes
   */
  async stageAll(options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (options.interactive) {
        const changes = await this.getUncommittedChanges();
        const confirm = await this.showConfirmation(
          `Stage all ${changes.length} changes?`,
          changes.map(c => `${c.status}: ${c.file}`).join('\n')
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      if (options.dryRun) {
        return {
          success: true,
          message: '[DRY RUN] Would stage all changes',
          stdout: 'git add -A'
        };
      }

      const stdout = await this.exec('git add -A');
      return {
        success: true,
        message: 'Successfully staged all changes',
        stdout
      };
    } catch (error) {
      return this.handleError('stage all', error);
    }
  }

  /**
   * Unstage specific files
   * @param files Array of file paths to unstage (relative to workspace root)
   * @param options Operation options
   */
  async unstageFiles(files: string[], options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (files.length === 0) {
        return {
          success: false,
          message: 'No files provided to unstage',
          error: 'Empty file list'
        };
      }

      if (options.interactive) {
        const confirm = await this.showConfirmation(
          `Unstage ${files.length} file(s)?`,
          files.join('\n')
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const fileArgs = files.map(f => `"${f}"`).join(' ');
      const command = `git reset HEAD ${fileArgs}`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would unstage: ${files.join(', ')}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully unstaged ${files.length} file(s)`,
        stdout
      };
    } catch (error) {
      return this.handleError('unstage files', error);
    }
  }

  /**
   * Discard local changes to specific files
   * @param files Array of file paths to discard changes (relative to workspace root)
   * @param options Operation options
   */
  async discardChanges(files: string[], options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (files.length === 0) {
        return {
          success: false,
          message: 'No files provided to discard',
          error: 'Empty file list'
        };
      }

      // Always confirm for discard operations (destructive)
      const confirm = await this.showConfirmation(
        `⚠️  Discard changes to ${files.length} file(s)? This cannot be undone!`,
        files.join('\n'),
        'warning'
      );
      if (!confirm) {
        return { success: false, message: 'Operation cancelled by user' };
      }

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would discard changes to: ${files.join(', ')}`,
          stdout: `git checkout -- ${files.join(' ')}`
        };
      }

      const fileArgs = files.map(f => `"${f}"`).join(' ');
      const stdout = await this.exec(`git checkout -- ${fileArgs}`);
      return {
        success: true,
        message: `Successfully discarded changes to ${files.length} file(s)`,
        stdout
      };
    } catch (error) {
      return this.handleError('discard changes', error);
    }
  }

  /**
   * Create a commit with staged changes
   * @param message Commit message
   * @param files Optional array of files to stage and commit
   * @param options Commit options
   */
  async createCommit(
    message: string,
    files?: string[],
    options: CommitOptions = {}
  ): Promise<GitOperationResult> {
    try {
      if (!message || message.trim().length === 0) {
        return {
          success: false,
          message: 'Commit message cannot be empty',
          error: 'Invalid commit message'
        };
      }

      // Stage files if provided
      if (files && files.length > 0) {
        const stageResult = await this.stageFiles(files, { dryRun: options.dryRun });
        if (!stageResult.success) {
          return stageResult;
        }
      }

      if (options.interactive && !options.dryRun) {
        const confirm = await this.showConfirmation(
          'Create commit?',
          `Message: ${message}\n\nFiles: ${files ? files.join(', ') : 'staged changes'}`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const flags: string[] = [];
      if (options.amend) { flags.push('--amend'); }
      if (options.allowEmpty) { flags.push('--allow-empty'); }
      if (options.noVerify) { flags.push('--no-verify'); }

      const command = `git commit ${flags.join(' ')} -m "${message.replace(/"/g, '\\"')}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would create commit with message: "${message}"`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: 'Commit created successfully',
        stdout
      };
    } catch (error) {
      return this.handleError('create commit', error);
    }
  }

  /**
   * Create a new branch
   * @param branchName Name of the new branch
   * @param fromBranch Optional base branch (defaults to current branch)
   * @param options Operation options
   */
  async createBranch(
    branchName: string,
    fromBranch?: string,
    options: GitOperationOptions = {}
  ): Promise<GitOperationResult> {
    try {
      if (!branchName || branchName.trim().length === 0) {
        return {
          success: false,
          message: 'Branch name cannot be empty',
          error: 'Invalid branch name'
        };
      }

      // Validate branch name
      if (!/^[a-zA-Z0-9._\/-]+$/.test(branchName)) {
        return {
          success: false,
          message: 'Invalid branch name format',
          error: 'Branch name contains invalid characters'
        };
      }

      if (options.interactive) {
        const base = fromBranch || 'current branch';
        const confirm = await this.showConfirmation(
          'Create new branch?',
          `Name: ${branchName}\nFrom: ${base}`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const command = fromBranch 
        ? `git checkout -b "${branchName}" "${fromBranch}"`
        : `git checkout -b "${branchName}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would create branch: ${branchName}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Branch '${branchName}' created and checked out`,
        stdout
      };
    } catch (error) {
      return this.handleError('create branch', error);
    }
  }

  /**
   * Switch to an existing branch
   * @param branchName Name of the branch to switch to
   * @param options Operation options
   */
  async switchBranch(branchName: string, options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (!branchName || branchName.trim().length === 0) {
        return {
          success: false,
          message: 'Branch name cannot be empty',
          error: 'Invalid branch name'
        };
      }

      if (options.interactive) {
        const confirm = await this.showConfirmation(
          'Switch branch?',
          `Target: ${branchName}`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const command = `git checkout "${branchName}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would switch to branch: ${branchName}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Switched to branch '${branchName}'`,
        stdout
      };
    } catch (error) {
      return this.handleError('switch branch', error);
    }
  }

  /**
   * Delete a branch
   * @param branchName Name of the branch to delete
   * @param options Operation options (force to delete unmerged branch)
   */
  async deleteBranch(branchName: string, options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      if (!branchName || branchName.trim().length === 0) {
        return {
          success: false,
          message: 'Branch name cannot be empty',
          error: 'Invalid branch name'
        };
      }

      // Always confirm branch deletion
      const confirm = await this.showConfirmation(
        `Delete branch '${branchName}'?`,
        options.force ? '⚠️  Force delete (unmerged changes will be lost)' : 'Safe delete (will fail if unmerged)',
        options.force ? 'warning' : 'info'
      );
      if (!confirm) {
        return { success: false, message: 'Operation cancelled by user' };
      }

      const flag = options.force ? '-D' : '-d';
      const command = `git branch ${flag} "${branchName}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would delete branch: ${branchName}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Branch '${branchName}' deleted`,
        stdout
      };
    } catch (error) {
      return this.handleError('delete branch', error);
    }
  }

  /**
   * Push changes to remote
   * @param remote Remote name (default: 'origin')
   * @param branch Branch name (default: current branch)
   * @param options Push options
   */
  async push(
    remote: string = 'origin',
    branch?: string,
    options: PushOptions = {}
  ): Promise<GitOperationResult> {
    try {
      const currentBranch = branch || await this.getBranch();
      
      if (options.interactive) {
        const confirm = await this.showConfirmation(
          'Push changes?',
          `Remote: ${remote}\nBranch: ${currentBranch}${options.force ? '\n⚠️  Force push enabled' : ''}`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const flags: string[] = [];
      if (options.setUpstream) { flags.push('--set-upstream'); }
      if (options.tags) { flags.push('--tags'); }
      if (options.force) { flags.push('--force'); }

      const command = `git push ${flags.join(' ')} "${remote}" "${currentBranch}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would push to ${remote}/${currentBranch}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully pushed to ${remote}/${currentBranch}`,
        stdout
      };
    } catch (error) {
      return this.handleError('push', error);
    }
  }

  /**
   * Pull changes from remote
   * @param remote Remote name (default: 'origin')
   * @param branch Branch name (default: current branch)
   * @param options Pull options
   */
  async pull(
    remote: string = 'origin',
    branch?: string,
    options: PullOptions = {}
  ): Promise<GitOperationResult> {
    try {
      const currentBranch = branch || await this.getBranch();

      if (options.interactive) {
        const confirm = await this.showConfirmation(
          'Pull changes?',
          `Remote: ${remote}\nBranch: ${currentBranch}${options.rebase ? '\n(with rebase)' : ''}`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const flags: string[] = [];
      if (options.rebase) { flags.push('--rebase'); }
      if (options.ff === 'only') { flags.push('--ff-only'); }
      else if (options.ff === 'no') { flags.push('--no-ff'); }

      const command = `git pull ${flags.join(' ')} "${remote}" "${currentBranch}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would pull from ${remote}/${currentBranch}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully pulled from ${remote}/${currentBranch}`,
        stdout
      };
    } catch (error) {
      return this.handleError('pull', error);
    }
  }

  /**
   * Fetch from remote
   * @param remote Remote name (default: 'origin')
   * @param options Operation options
   */
  async fetch(remote: string = 'origin', options: GitOperationOptions = {}): Promise<GitOperationResult> {
    try {
      const command = `git fetch "${remote}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would fetch from ${remote}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully fetched from ${remote}`,
        stdout
      };
    } catch (error) {
      return this.handleError('fetch', error);
    }
  }

  /**
   * List all branches
   * @param includeRemote Include remote branches
   */
  async listBranches(includeRemote: boolean = false): Promise<string[]> {
    try {
      const flag = includeRemote ? '-a' : '';
      const output = await this.exec(`git branch ${flag}`);
      return output
        .split('\n')
        .map(line => line.replace(/^\*?\s+/, '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const changes = await this.getUncommittedChanges();
    return changes.length > 0;
  }

  /**
   * Get staged files
   */
  async getStagedFiles(): Promise<string[]> {
    try {
      const output = await this.exec('git diff --cached --name-only');
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get diff for staged changes
   */
  async getStagedDiff(): Promise<string> {
    try {
      return await this.exec('git diff --cached');
    } catch {
      return '';
    }
  }

  /**
   * Get diff between two commits/branches
   */
  async getDiff(from: string, to: string = 'HEAD'): Promise<string> {
    try {
      return await this.exec(`git diff "${from}" "${to}"`);
    } catch {
      return '';
    }
  }

  /**
   * Merge a branch into current branch
   */
  async merge(
    branch: string,
    options: GitOperationOptions & { noFastForward?: boolean; squash?: boolean } = {}
  ): Promise<GitOperationResult> {
    try {
      if (options.interactive) {
        const currentBranch = await this.getBranch();
        const confirm = await this.showConfirmation(
          'Merge branch?',
          `Merge '${branch}' into '${currentBranch}'`
        );
        if (!confirm) {
          return { success: false, message: 'Operation cancelled by user' };
        }
      }

      const flags: string[] = [];
      if (options.noFastForward) { flags.push('--no-ff'); }
      if (options.squash) { flags.push('--squash'); }

      const command = `git merge ${flags.join(' ')} "${branch}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would merge ${branch}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully merged '${branch}'`,
        stdout
      };
    } catch (error) {
      return this.handleError('merge', error);
    }
  }

  /**
   * Rebase current branch onto another branch
   */
  async rebase(
    branch: string,
    options: GitOperationOptions & { interactive?: boolean } = {}
  ): Promise<GitOperationResult> {
    try {
      // Always confirm rebase operations
      const currentBranch = await this.getBranch();
      const confirm = await this.showConfirmation(
        'Rebase branch?',
        `Rebase '${currentBranch}' onto '${branch}'`,
        'warning'
      );
      if (!confirm) {
        return { success: false, message: 'Operation cancelled by user' };
      }

      const flag = options.interactive ? '-i' : '';
      const command = `git rebase ${flag} "${branch}"`;

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would rebase onto ${branch}`,
          stdout: command
        };
      }

      const stdout = await this.exec(command);
      return {
        success: true,
        message: `Successfully rebased onto '${branch}'`,
        stdout
      };
    } catch (error) {
      return this.handleError('rebase', error);
    }
  }

  /**
   * Check if repository has conflicts
   */
  async hasConflicts(): Promise<boolean> {
    try {
      const output = await this.exec('git diff --name-only --diff-filter=U');
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get list of conflicted files
   */
  async getConflictedFiles(): Promise<string[]> {
    try {
      const output = await this.exec('git diff --name-only --diff-filter=U');
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private async showConfirmation(
    message: string,
    detail: string,
    severity: 'info' | 'warning' = 'info'
  ): Promise<boolean> {
    const modal = severity === 'warning';
    const result = await vscode.window.showInformationMessage(
      message,
      { modal, detail },
      'Confirm',
      'Cancel'
    );
    return result === 'Confirm';
  }

  private handleError(operation: string, error: unknown): GitOperationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Parse common Git errors
    let userMessage = `Failed to ${operation}`;
    
    if (errorMessage.includes('not a git repository')) {
      userMessage = 'Not a Git repository';
    } else if (errorMessage.includes('Permission denied')) {
      userMessage = 'Permission denied. Check your Git credentials';
    } else if (errorMessage.includes('conflict')) {
      userMessage = 'Merge conflict detected. Resolve conflicts before continuing';
    } else if (errorMessage.includes('already exists')) {
      userMessage = 'Branch or file already exists';
    } else if (errorMessage.includes('does not exist')) {
      userMessage = 'Branch or file does not exist';
    } else if (errorMessage.includes('up-to-date')) {
      userMessage = 'Already up-to-date';
    } else if (errorMessage.includes('rejected')) {
      userMessage = 'Push rejected. Pull changes first or use force push';
    }

    return {
      success: false,
      message: userMessage,
      error: errorMessage
    };
  }

  private exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(
        command,
        { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}
