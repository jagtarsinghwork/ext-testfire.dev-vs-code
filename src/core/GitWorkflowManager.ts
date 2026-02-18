import * as vscode from 'vscode';
import {
  GitManager,
  GitOperationResult,
  GitOperationOptions,
} from './gitManager';
import {
  CommitMessageGenerator,
  GeneratedCommitMessage,
} from './CommitMessageGenerator';
import { AIProvider } from '../types';

export interface WorkflowOptions extends GitOperationOptions {
  autoCommit?: boolean;
  autoPush?: boolean;
  commitMessage?: string;
}

export interface FeatureBranchOptions extends WorkflowOptions {
  baseBranch?: string;
  remote?: string;
}

export interface HotfixOptions extends WorkflowOptions {
  baseBranch?: string;
  version?: string;
  targetBranches?: string[];
}

export interface ReleaseOptions extends WorkflowOptions {
  version: string;
  baseBranch?: string;
  tagMessage?: string;
  createTag?: boolean;
}

export interface PROptions {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

/**
 * High-level Git workflow manager
 * Implements common Git workflows: feature branches, hotfixes, releases, etc.
 */
export class GitWorkflowManager {
  private commitGenerator: CommitMessageGenerator;

  constructor(
    private gitManager: GitManager,
    private aiProvider?: AIProvider,
  ) {
    this.commitGenerator = new CommitMessageGenerator(aiProvider);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FEATURE BRANCH WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new feature branch
   * Creates a branch from base (default: main/master) and switches to it
   */
  async startFeature(
    featureName: string,
    options: FeatureBranchOptions = {},
  ): Promise<GitOperationResult> {
    try {
      const baseBranch = options.baseBranch || (await this.getDefaultBranch());

      // Ensure we're on base branch and up to date
      await this.gitManager.switchBranch(baseBranch, {
        dryRun: options.dryRun,
      });

      if (!options.dryRun) {
        const pullResult = await this.gitManager.pull(
          options.remote || 'origin',
          baseBranch,
          { dryRun: options.dryRun },
        );

        if (!pullResult.success && !pullResult.message.includes('up-to-date')) {
          return pullResult;
        }
      }

      // Create feature branch
      const branchName = this.formatBranchName('feature', featureName);
      const result = await this.gitManager.createBranch(
        branchName,
        baseBranch,
        { dryRun: options.dryRun, interactive: options.interactive },
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Feature branch '${branchName}' created! Start implementing your feature.`,
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to start feature',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Finish a feature branch
   * Commits changes, merges to base branch, and optionally pushes
   */
  async finishFeature(
    message?: string,
    options: FeatureBranchOptions = {},
  ): Promise<GitOperationResult> {
    try {
      const currentBranch = await this.gitManager.getBranch();

      if (!currentBranch.startsWith('feature/')) {
        return {
          success: false,
          message: 'Not on a feature branch',
          error: 'Current branch is not a feature branch',
        };
      }

      // Check for uncommitted changes
      const hasChanges = await this.gitManager.hasUncommittedChanges();

      if (hasChanges && options.autoCommit) {
        // Generate commit message if not provided
        let commitMessage = message;
        if (!commitMessage) {
          const diff = await this.gitManager.getStagedDiff();
          const files = await this.gitManager.getStagedFiles();

          if (files.length === 0) {
            return {
              success: false,
              message: 'No staged files to commit',
              error: 'Stage files first or use autoCommit with changes',
            };
          }

          const generated = await this.commitGenerator.generateFromDiff(
            diff,
            files,
            {
              includeBody: true,
            },
          );
          commitMessage = generated.full;
        }

        const commitResult = await this.gitManager.createCommit(
          commitMessage,
          undefined,
          { dryRun: options.dryRun },
        );

        if (!commitResult.success) {
          return commitResult;
        }
      }

      // Merge to base branch
      const baseBranch = options.baseBranch || (await this.getDefaultBranch());
      await this.gitManager.switchBranch(baseBranch, {
        dryRun: options.dryRun,
      });

      const mergeResult = await this.gitManager.merge(currentBranch, {
        dryRun: options.dryRun,
        noFastForward: true,
      });

      if (!mergeResult.success) {
        // Switch back to feature branch on merge failure
        await this.gitManager.switchBranch(currentBranch);
        return mergeResult;
      }

      // Push if requested
      if (options.autoPush && !options.dryRun) {
        const pushResult = await this.gitManager.push(
          options.remote || 'origin',
          baseBranch,
        );

        if (!pushResult.success) {
          return pushResult;
        }
      }

      // Delete feature branch
      const deleteResult = await this.gitManager.deleteBranch(currentBranch, {
        dryRun: options.dryRun,
      });

      if (deleteResult.success) {
        vscode.window.showInformationMessage(
          `Feature '${currentBranch}' completed and merged to '${baseBranch}'!`,
        );
      }

      return deleteResult;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to finish feature',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HOTFIX WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a hotfix branch
   * Creates a branch from production/main for urgent fixes
   */
  async startHotfix(
    hotfixName: string,
    options: HotfixOptions = {},
  ): Promise<GitOperationResult> {
    try {
      const baseBranch = options.baseBranch || 'main';
      const branchName = this.formatBranchName('hotfix', hotfixName);

      // Create from production branch
      const result = await this.gitManager.createBranch(
        branchName,
        baseBranch,
        { dryRun: options.dryRun, interactive: options.interactive },
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Hotfix branch '${branchName}' created! Fix the issue and commit.`,
          { modal: false },
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to start hotfix',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Finish a hotfix
   * Merges hotfix to multiple branches (e.g., main and develop)
   */
  async finishHotfix(
    message?: string,
    options: HotfixOptions = {},
  ): Promise<GitOperationResult> {
    try {
      const currentBranch = await this.gitManager.getBranch();

      if (!currentBranch.startsWith('hotfix/')) {
        return {
          success: false,
          message: 'Not on a hotfix branch',
          error: 'Current branch is not a hotfix branch',
        };
      }

      // Commit changes if needed
      if (await this.gitManager.hasUncommittedChanges()) {
        if (!message) {
          return {
            success: false,
            message: 'Commit message required for hotfix',
            error: 'Provide a commit message',
          };
        }

        const commitResult = await this.gitManager.createCommit(
          message,
          undefined,
          { dryRun: options.dryRun },
        );

        if (!commitResult.success) {
          return commitResult;
        }
      }

      // Merge to target branches
      const targetBranches = options.targetBranches || ['main', 'develop'];
      const results: string[] = [];

      for (const targetBranch of targetBranches) {
        // Check if branch exists
        const branches = await this.gitManager.listBranches();
        if (!branches.includes(targetBranch)) {
          results.push(`⚠️  Branch '${targetBranch}' not found, skipped`);
          continue;
        }

        // Switch to target branch
        await this.gitManager.switchBranch(targetBranch, {
          dryRun: options.dryRun,
        });

        // Merge hotfix
        const mergeResult = await this.gitManager.merge(currentBranch, {
          dryRun: options.dryRun,
          noFastForward: true,
        });

        if (mergeResult.success) {
          results.push(`✓ Merged to '${targetBranch}'`);

          // Push if requested
          if (options.autoPush && !options.dryRun) {
            await this.gitManager.push('origin', targetBranch);
          }
        } else {
          results.push(
            `✗ Failed to merge to '${targetBranch}': ${mergeResult.error}`,
          );
        }
      }

      // Delete hotfix branch
      await this.gitManager.deleteBranch(currentBranch, {
        dryRun: options.dryRun,
      });

      vscode.window.showInformationMessage(
        `Hotfix completed:\n${results.join('\n')}`,
      );

      return {
        success: true,
        message: 'Hotfix completed',
        stdout: results.join('\n'),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to finish hotfix',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RELEASE WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a release
   * Creates a release branch, tags it, and merges to production
   */
  async createRelease(options: ReleaseOptions): Promise<GitOperationResult> {
    try {
      const { version } = options;
      const branchName = `release/${version}`;

      // Create release branch from develop
      const baseBranch = options.baseBranch || 'develop';
      const createResult = await this.gitManager.createBranch(
        branchName,
        baseBranch,
        { dryRun: options.dryRun },
      );

      if (!createResult.success) {
        return createResult;
      }

      // Update version in package.json if exists
      if (!options.dryRun) {
        await this.updateVersion(version);
      }

      // Commit version bump
      const commitResult = await this.gitManager.createCommit(
        options.commitMessage || `chore(release): bump version to ${version}`,
        undefined,
        { dryRun: options.dryRun },
      );

      if (!commitResult.success) {
        return commitResult;
      }

      // Merge to main
      await this.gitManager.switchBranch('main', { dryRun: options.dryRun });
      const mergeResult = await this.gitManager.merge(branchName, {
        dryRun: options.dryRun,
        noFastForward: true,
      });

      if (!mergeResult.success) {
        return mergeResult;
      }

      // Create tag if requested
      if (options.createTag && !options.dryRun) {
        const tagResult = await this.createTag(
          `v${version}`,
          options.tagMessage || `Release ${version}`,
        );

        if (!tagResult.success) {
          return tagResult;
        }
      }

      // Back-merge to develop
      await this.gitManager.switchBranch('develop', { dryRun: options.dryRun });
      await this.gitManager.merge(branchName, { dryRun: options.dryRun });

      // Delete release branch
      await this.gitManager.deleteBranch(branchName, {
        dryRun: options.dryRun,
      });

      // Push if requested
      if (options.autoPush && !options.dryRun) {
        await this.gitManager.push('origin', 'main', { tags: true });
        await this.gitManager.push('origin', 'develop');
      }

      vscode.window.showInformationMessage(
        `Release ${version} created successfully!`,
      );

      return {
        success: true,
        message: `Release ${version} created`,
        stdout: `Tagged as v${version}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create release',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GITHUB INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a Pull Request on GitHub
   * Requires GitHub CLI (gh) or API token
   */
  async createPullRequest(
    options: PROptions,
    githubConfig?: GitHubConfig,
  ): Promise<GitOperationResult> {
    try {
      const currentBranch = await this.gitManager.getBranch();
      const baseBranch = options.baseBranch || (await this.getDefaultBranch());

      // First, push current branch
      const pushResult = await this.gitManager.push('origin', currentBranch, {
        setUpstream: true,
      });

      if (!pushResult.success) {
        return pushResult;
      }

      // Try using GitHub CLI first
      const hasGhCli = await this.hasGitHubCLI();

      if (hasGhCli) {
        return await this.createPRWithCLI(options, currentBranch, baseBranch);
      } else if (githubConfig) {
        return await this.createPRWithAPI(
          options,
          currentBranch,
          baseBranch,
          githubConfig,
        );
      } else {
        // Open browser to create PR manually
        const remoteUrl = await this.gitManager.getRemoteUrl();
        const prUrl = this.buildPRUrl(
          remoteUrl,
          currentBranch,
          baseBranch,
          options,
        );

        await vscode.env.openExternal(vscode.Uri.parse(prUrl));

        return {
          success: true,
          message: 'Opened browser to create PR',
          stdout: prUrl,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create pull request',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create PR using GitHub CLI
   */
  private async createPRWithCLI(
    options: PROptions,
    headBranch: string,
    baseBranch: string,
  ): Promise<GitOperationResult> {
    try {
      const cp = require('child_process');

      let command = `gh pr create --base "${baseBranch}" --head "${headBranch}" --title "${options.title}"`;

      if (options.body) {
        command += ` --body "${options.body}"`;
      }
      if (options.draft) {
        command += ' --draft';
      }
      if (options.labels && options.labels.length > 0) {
        command += ` --label "${options.labels.join(',')}"`;
      }
      if (options.reviewers && options.reviewers.length > 0) {
        command += ` --reviewer "${options.reviewers.join(',')}"`;
      }
      if (options.assignees && options.assignees.length > 0) {
        command += ` --assignee "${options.assignees.join(',')}"`;
      }

      const result = await new Promise<string>((resolve, reject) => {
        cp.exec(
          command,
          (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          },
        );
      });

      vscode.window.showInformationMessage(
        'Pull Request created successfully!',
      );

      return {
        success: true,
        message: 'Pull Request created',
        stdout: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create PR with GitHub CLI',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create PR using GitHub API
   */
  private async createPRWithAPI(
    options: PROptions,
    headBranch: string,
    baseBranch: string,
    config: GitHubConfig,
  ): Promise<GitOperationResult> {
    try {
      const https = require('https');

      const requestData = JSON.stringify({
        title: options.title,
        head: headBranch,
        base: baseBranch,
        body: options.body || '',
        draft: options.draft || false,
      });

      const apiOptions = {
        hostname: 'api.github.com',
        path: `/repos/${config.owner}/${config.repo}/pulls`,
        method: 'POST',
        headers: {
          Authorization: `token ${config.token}`,
          'User-Agent': 'VSCode-Testfire',
          'Content-Type': 'application/json',
          'Content-Length': requestData.length,
        },
      };

      const result = await new Promise<any>((resolve, reject) => {
        const req = https.request(apiOptions, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(
                new Error(`GitHub API error: ${res.statusCode} - ${data}`),
              );
            }
          });
        });

        req.on('error', reject);
        req.write(requestData);
        req.end();
      });

      // Add labels if specified
      if (options.labels && options.labels.length > 0) {
        await this.addPRLabels(result.number, options.labels, config);
      }

      // Add reviewers if specified
      if (options.reviewers && options.reviewers.length > 0) {
        await this.addPRReviewers(result.number, options.reviewers, config);
      }

      vscode.window.showInformationMessage(
        `Pull Request #${result.number} created successfully!`,
      );

      return {
        success: true,
        message: `Pull Request #${result.number} created`,
        stdout: result.html_url,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create PR with GitHub API',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the default branch (main or master)
   */
  private async getDefaultBranch(): Promise<string> {
    const branches = await this.gitManager.listBranches();

    if (branches.includes('main')) {
      return 'main';
    } else if (branches.includes('master')) {
      return 'master';
    } else if (branches.includes('develop')) {
      return 'develop';
    }

    return 'main'; // fallback
  }

  /**
   * Format branch name with prefix and sanitization
   */
  private formatBranchName(type: string, name: string): string {
    // Remove invalid characters and spaces
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');

    return `${type}/${sanitized}`;
  }

  /**
   * Create a Git tag
   */
  private async createTag(
    tagName: string,
    message: string,
  ): Promise<GitOperationResult> {
    try {
      const cp = require('child_process');

      await new Promise<void>((resolve, reject) => {
        cp.exec(
          `git tag -a "${tagName}" -m "${message}"`,
          (error: Error | null) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          },
        );
      });

      return {
        success: true,
        message: `Tag '${tagName}' created`,
        stdout: tagName,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create tag',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update version in package.json
   */
  private async updateVersion(version: string): Promise<void> {
    const fs = require('fs');
    const path = require('path');

    const packageJsonPath = path.join(
      vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
      'package.json',
    );

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      packageJson.version = version;
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n',
      );
    }
  }

  /**
   * Check if GitHub CLI is installed
   */
  private async hasGitHubCLI(): Promise<boolean> {
    try {
      const cp = require('child_process');
      await new Promise<void>((resolve, reject) => {
        cp.exec('gh --version', (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build PR URL for manual creation
   */
  private buildPRUrl(
    remoteUrl: string,
    headBranch: string,
    baseBranch: string,
    options: PROptions,
  ): string {
    // Parse GitHub URL
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
    if (!match) {
      return remoteUrl;
    }

    const [, owner, repo] = match;
    let url = `https://github.com/${owner}/${repo}/compare/${baseBranch}...${headBranch}`;

    url += `?title=${encodeURIComponent(options.title)}`;

    if (options.body) {
      url += `&body=${encodeURIComponent(options.body)}`;
    }
    if (options.labels && options.labels.length > 0) {
      url += `&labels=${encodeURIComponent(options.labels.join(','))}`;
    }

    return url;
  }

  /**
   * Add labels to PR
   */
  private async addPRLabels(
    prNumber: number,
    labels: string[],
    config: GitHubConfig,
  ): Promise<void> {
    const https = require('https');

    const requestData = JSON.stringify({ labels });

    const apiOptions = {
      hostname: 'api.github.com',
      path: `/repos/${config.owner}/${config.repo}/issues/${prNumber}/labels`,
      method: 'POST',
      headers: {
        Authorization: `token ${config.token}`,
        'User-Agent': 'VSCode-Testfire',
        'Content-Type': 'application/json',
        'Content-Length': requestData.length,
      },
    };

    await new Promise<void>((resolve, reject) => {
      const req = https.request(apiOptions, (res: any) => {
        res.on('end', () => resolve());
        res.on('error', reject);
      });
      req.on('error', reject);
      req.write(requestData);
      req.end();
    });
  }

  /**
   * Add reviewers to PR
   */
  private async addPRReviewers(
    prNumber: number,
    reviewers: string[],
    config: GitHubConfig,
  ): Promise<void> {
    const https = require('https');

    const requestData = JSON.stringify({ reviewers });

    const apiOptions = {
      hostname: 'api.github.com',
      path: `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/requested_reviewers`,
      method: 'POST',
      headers: {
        Authorization: `token ${config.token}`,
        'User-Agent': 'VSCode-Testfire',
        'Content-Type': 'application/json',
        'Content-Length': requestData.length,
      },
    };

    await new Promise<void>((resolve, reject) => {
      const req = https.request(apiOptions, (res: any) => {
        res.on('end', () => resolve());
        res.on('error', reject);
      });
      req.on('error', reject);
      req.write(requestData);
      req.end();
    });
  }
}
