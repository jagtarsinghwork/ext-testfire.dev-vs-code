import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { GitInfo, GitChange, GitCommit } from '../types';
import { Logger } from '../utils/Logger';

export class GitTracker {
  private gitignorePatterns: string[] = [];
  private logger: Logger;

  constructor(private workspaceRoot: string) {
    this.logger = new Logger('GitTracker');
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.exec('git rev-parse --is-inside-work-tree');
      return true;
    } catch { return false; }
  }

  /**
   * Get full git info snapshot.
   */
  async getInfo(): Promise<GitInfo> {
    const [branch, remoteUrl, lastCommit, changes, commits] = await Promise.all([
      this.getBranch(),
      this.getRemoteUrl(),
      this.getLastCommit(),
      this.getUncommittedChanges(),
      this.getRecentCommits(15),
    ]);

    await this.parseGitignore();

    return {
      branch,
      remoteUrl,
      lastCommit,
      uncommittedChanges: changes,
      recentCommits: commits,
      gitignorePatterns: this.gitignorePatterns,
    };
  }

  async getBranch(): Promise<string> {
    try {
      return (await this.exec('git rev-parse --abbrev-ref HEAD')).trim();
    } catch { return 'unknown'; }
  }

  async getRemoteUrl(): Promise<string> {
    try {
      return (await this.exec('git remote get-url origin')).trim();
    } catch { return ''; }
  }

  async getLastCommit(): Promise<string> {
    try {
      return (await this.exec('git log -1 --oneline')).trim();
    } catch { return ''; }
  }

  async getUncommittedChanges(): Promise<GitChange[]> {
    try {
      const output = await this.exec('git status --porcelain');
      const changes: GitChange[] = [];

      for (const line of output.split('\n').filter(Boolean)) {
        const statusCode = line.substring(0, 2).trim();
        const file = line.substring(3).trim();

        let status: GitChange['status'];
        switch (statusCode) {
          case 'M': case 'MM': status = 'modified'; break;
          case 'A': case 'AM': status = 'added'; break;
          case 'D': status = 'deleted'; break;
          case 'R': status = 'renamed'; break;
          case '??': status = 'untracked'; break;
          default: status = 'modified';
        }

        changes.push({ file, status });
      }

      return changes;
    } catch { return []; }
  }

  async getRecentCommits(count: number): Promise<GitCommit[]> {
    try {
      const format = '%H|||%s|||%an|||%ai';
      const output = await this.exec(`git log -${count} --pretty=format:"${format}"`);
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

      // Get files for the latest 5 commits only (performance)
      for (const commit of commits.slice(0, 5)) {
        try {
          const filesOutput = await this.exec(`git diff-tree --no-commit-id --name-only -r ${commit.hash}`);
          commit.files = filesOutput.split('\n').filter(Boolean);
        } catch { /* ignore */ }
      }

      return commits;
    } catch { return []; }
  }

  async getFileDiff(filePath: string): Promise<string> {
    try {
      let diff = await this.exec(`git diff -- "${filePath}"`);
      if (!diff.trim()) {
        diff = await this.exec(`git diff --cached -- "${filePath}"`);
      }
      return diff;
    } catch { return ''; }
  }

  async getStagedDiff(): Promise<string> {
    try {
      return await this.exec('git diff --cached');
    } catch { return ''; }
  }

  async getCommitDiff(hash: string): Promise<string> {
    try {
      return await this.exec(`git show ${hash} --stat --patch`);
    } catch { return ''; }
  }

  async getFileHistory(filePath: string, count = 10): Promise<GitCommit[]> {
    try {
      const format = '%H|||%s|||%an|||%ai';
      const output = await this.exec(`git log -${count} --pretty=format:"${format}" -- "${filePath}"`);
      const commits: GitCommit[] = [];

      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.replace(/^"|"$/g, '').split('|||');
        if (parts.length >= 4) {
          commits.push({
            hash: parts[0],
            message: parts[1],
            author: parts[2],
            date: parts[3],
            files: [filePath],
          });
        }
      }

      return commits;
    } catch { return []; }
  }

  /**
   * Parse .gitignore patterns
   */
  async parseGitignore(): Promise<string[]> {
    try {
      const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
      const uri = vscode.Uri.file(gitignorePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf-8');

      this.gitignorePatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      return this.gitignorePatterns;
    } catch {
      this.gitignorePatterns = [];
      return [];
    }
  }

  getGitignorePatterns(): string[] {
    return this.gitignorePatterns;
  }

  /**
   * Check if a file path matches gitignore patterns.
   */
  isIgnored(relativePath: string): boolean {
    for (const pattern of this.gitignorePatterns) {
      // Simple pattern matching (not full gitignore spec, but covers common cases)
      const escaped = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      try {
        if (new RegExp(`^${escaped}$`).test(relativePath) ||
            new RegExp(`(^|/)${escaped}(/|$)`).test(relativePath)) {
          return true;
        }
      } catch { /* invalid regex, skip */ }
    }
    return false;
  }

  private exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(command, { cwd: this.workspaceRoot, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) { reject(new Error(stderr || error.message)); }
        else { resolve(stdout); }
      });
    });
  }
}
