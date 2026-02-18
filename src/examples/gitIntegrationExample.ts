/**
 * Example: Git Operations Integration
 *
 * This file demonstrates how to integrate the enhanced Git management system
 * into a VSCode extension with commands and UI interactions.
 */

import * as vscode from 'vscode';
import { GitManager, GitOperationResult } from '../core/gitManager';
import {
  CommitMessageGenerator,
  ConventionalCommitType,
} from '../core/CommitMessageGenerator';
import { GitWorkflowManager, PROptions } from '../core/GitWorkflowManager';
import { AIProvider } from '../types';

export class GitIntegration {
  private gitManager: GitManager;
  private commitGenerator: CommitMessageGenerator;
  private workflowManager: GitWorkflowManager;

  constructor(
    private context: vscode.ExtensionContext,
    private aiProvider?: AIProvider,
  ) {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    this.gitManager = new GitManager(workspaceRoot);
    this.commitGenerator = new CommitMessageGenerator(aiProvider);
    this.workflowManager = new GitWorkflowManager(this.gitManager, aiProvider);

    this.registerCommands();
  }

  /**
   * Register all Git-related commands
   */
  private registerCommands(): void {
    // Smart commit with AI-generated message
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.smartCommit', () =>
        this.smartCommit(),
      ),
    );

    // Stage files
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.stageFiles', () =>
        this.stageFiles(),
      ),
    );

    // Unstage files
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.unstageFiles', () =>
        this.unstageFiles(),
      ),
    );

    // Discard changes
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.discardChanges', () =>
        this.discardChanges(),
      ),
    );

    // Create branch
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.createBranch', () =>
        this.createBranch(),
      ),
    );

    // Start feature
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.startFeature', () =>
        this.startFeature(),
      ),
    );

    // Finish feature
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.finishFeature', () =>
        this.finishFeature(),
      ),
    );

    // Start hotfix
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.startHotfix', () =>
        this.startHotfix(),
      ),
    );

    // Finish hotfix
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.finishHotfix', () =>
        this.finishHotfix(),
      ),
    );

    // Create release
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.createRelease', () =>
        this.createRelease(),
      ),
    );

    // Create PR
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.createPR', () =>
        this.createPullRequest(),
      ),
    );

    // Push with checks
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.safePush', () =>
        this.safePush(),
      ),
    );

    // Pull with checks
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.safePull', () =>
        this.safePull(),
      ),
    );

    // Show Git status
    this.context.subscriptions.push(
      vscode.commands.registerCommand('testfire.git.showStatus', () =>
        this.showStatus(),
      ),
    );
  }

  /**
   * Smart commit: Stage files and generate AI-powered commit message
   */
  private async smartCommit(): Promise<void> {
    try {
      // Check if in git repo
      if (!(await this.gitManager.isGitRepo())) {
        vscode.window.showErrorMessage('Not a Git repository');
        return;
      }

      // Get uncommitted changes
      const changes = await this.gitManager.getUncommittedChanges();

      if (changes.length === 0) {
        vscode.window.showInformationMessage('No changes to commit');
        return;
      }

      // Let user select files to stage
      const selectedFiles = await vscode.window.showQuickPick(
        changes.map((c) => ({
          label: c.file,
          description: c.status,
          picked: true,
        })),
        {
          canPickMany: true,
          placeHolder: 'Select files to commit',
        },
      );

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      // Stage selected files
      const filePaths = selectedFiles.map((f) => f.label);
      await this.gitManager.stageFiles(filePaths);

      // Get diff and generate message
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating commit message...',
          cancellable: false,
        },
        async () => {
          const diff = await this.gitManager.getStagedDiff();
          const stagedFiles = await this.gitManager.getStagedFiles();

          const message = await this.commitGenerator.generateFromDiff(
            diff,
            stagedFiles,
            {
              includeBody: true,
              includeFooter: true,
            },
          );

          // Let user review/edit the message
          const editedMessage = await vscode.window.showInputBox({
            prompt: 'Review and edit commit message',
            value: message.full,
            valueSelection: [0, message.subject.length],
          });

          if (!editedMessage) {
            return;
          }

          // Validate
          const validation = this.commitGenerator.validateFormat(editedMessage);
          if (!validation.valid) {
            const proceed = await vscode.window.showWarningMessage(
              'Commit message has issues:\n' + validation.errors.join('\n'),
              'Commit Anyway',
              'Cancel',
            );

            if (proceed !== 'Commit Anyway') {
              return;
            }
          }

          // Commit
          const result = await this.gitManager.createCommit(editedMessage);

          if (result.success) {
            vscode.window.showInformationMessage('✓ Committed successfully!');
          } else {
            vscode.window.showErrorMessage(
              `Failed to commit: ${result.message}`,
            );
          }
        },
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  }

  /**
   * Stage files interactively
   */
  private async stageFiles(): Promise<void> {
    const changes = await this.gitManager.getUncommittedChanges();

    if (changes.length === 0) {
      vscode.window.showInformationMessage('No changes to stage');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      changes.map((c) => ({
        label: c.file,
        description: c.status,
      })),
      {
        canPickMany: true,
        placeHolder: 'Select files to stage',
      },
    );

    if (selected && selected.length > 0) {
      const files = selected.map((s) => s.label);
      const result = await this.gitManager.stageFiles(files);

      if (result.success) {
        vscode.window.showInformationMessage(`Staged ${files.length} file(s)`);
      }
    }
  }

  /**
   * Unstage files interactively
   */
  private async unstageFiles(): Promise<void> {
    const stagedFiles = await this.gitManager.getStagedFiles();

    if (stagedFiles.length === 0) {
      vscode.window.showInformationMessage('No staged files');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      stagedFiles.map((f) => ({ label: f })),
      {
        canPickMany: true,
        placeHolder: 'Select files to unstage',
      },
    );

    if (selected && selected.length > 0) {
      const files = selected.map((s) => s.label);
      const result = await this.gitManager.unstageFiles(files);

      if (result.success) {
        vscode.window.showInformationMessage(
          `Unstaged ${files.length} file(s)`,
        );
      }
    }
  }

  /**
   * Discard changes with warning
   */
  private async discardChanges(): Promise<void> {
    const changes = await this.gitManager.getUncommittedChanges();

    if (changes.length === 0) {
      vscode.window.showInformationMessage('No changes to discard');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      changes.map((c) => ({
        label: c.file,
        description: c.status,
      })),
      {
        canPickMany: true,
        placeHolder: '⚠️  Select files to DISCARD (cannot be undone!)',
      },
    );

    if (selected && selected.length > 0) {
      const files = selected.map((s) => s.label);
      await this.gitManager.discardChanges(files);
    }
  }

  /**
   * Create a new branch
   */
  private async createBranch(): Promise<void> {
    const branchName = await vscode.window.showInputBox({
      prompt: 'Enter branch name',
      placeHolder: 'feature/new-feature',
    });

    if (!branchName) {
      return;
    }

    const result = await this.gitManager.createBranch(branchName);

    if (result.success) {
      vscode.window.showInformationMessage(`Branch '${branchName}' created`);
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  /**
   * Start a feature branch
   */
  private async startFeature(): Promise<void> {
    const featureName = await vscode.window.showInputBox({
      prompt: 'Enter feature name',
      placeHolder: 'user-authentication',
    });

    if (!featureName) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Starting feature...',
        cancellable: false,
      },
      async () => {
        const result = await this.workflowManager.startFeature(featureName);

        if (result.success) {
          vscode.window.showInformationMessage(
            `Feature '${featureName}' started! Start implementing your feature.`,
          );
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );
  }

  /**
   * Finish a feature branch
   */
  private async finishFeature(): Promise<void> {
    const currentBranch = await this.gitManager.getBranch();

    if (!currentBranch.startsWith('feature/')) {
      vscode.window.showWarningMessage('Not on a feature branch');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Finish feature '${currentBranch}'?`,
      { modal: true },
      'Yes',
      'No',
    );

    if (confirm !== 'Yes') {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Finishing feature...',
        cancellable: false,
      },
      async () => {
        const result = await this.workflowManager.finishFeature(undefined, {
          autoCommit: true,
          autoPush: true,
        });

        if (result.success) {
          vscode.window.showInformationMessage('Feature completed!');
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );
  }

  /**
   * Start a hotfix
   */
  private async startHotfix(): Promise<void> {
    const hotfixName = await vscode.window.showInputBox({
      prompt: 'Enter hotfix name',
      placeHolder: 'critical-bug-fix',
    });

    if (!hotfixName) {
      return;
    }

    const result = await this.workflowManager.startHotfix(hotfixName);

    if (result.success) {
      vscode.window.showInformationMessage(`Hotfix '${hotfixName}' started!`);
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  /**
   * Finish a hotfix
   */
  private async finishHotfix(): Promise<void> {
    const currentBranch = await this.gitManager.getBranch();

    if (!currentBranch.startsWith('hotfix/')) {
      vscode.window.showWarningMessage('Not on a hotfix branch');
      return;
    }

    const message = await vscode.window.showInputBox({
      prompt: 'Enter commit message for hotfix',
      placeHolder: 'fix: resolve critical security issue',
    });

    if (!message) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Finishing hotfix...',
        cancellable: false,
      },
      async () => {
        const result = await this.workflowManager.finishHotfix(message, {
          autoPush: true,
        });

        if (result.success) {
          vscode.window.showInformationMessage('Hotfix completed!');
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );
  }

  /**
   * Create a release
   */
  private async createRelease(): Promise<void> {
    const version = await vscode.window.showInputBox({
      prompt: 'Enter version number',
      placeHolder: '1.2.0',
    });

    if (!version) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating release ${version}...`,
        cancellable: false,
      },
      async () => {
        const result = await this.workflowManager.createRelease({
          version,
          createTag: true,
          autoPush: true,
        });

        if (result.success) {
          vscode.window.showInformationMessage(`Release ${version} created!`);
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );
  }

  /**
   * Create a pull request
   */
  private async createPullRequest(): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Enter PR title',
      placeHolder: 'feat: Add new feature',
    });

    if (!title) {
      return;
    }

    const body = await vscode.window.showInputBox({
      prompt: 'Enter PR description (optional)',
      placeHolder: 'This PR adds...',
    });

    const draft = await vscode.window.showQuickPick(['No', 'Yes'], {
      placeHolder: 'Create as draft?',
    });

    const options: PROptions = {
      title,
      body,
      draft: draft === 'Yes',
    };

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Creating pull request...',
        cancellable: false,
      },
      async () => {
        const result = await this.workflowManager.createPullRequest(options);

        if (result.success) {
          vscode.window.showInformationMessage('Pull request created!');
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );
  }

  /**
   * Safe push with pre-flight checks
   */
  private async safePush(): Promise<void> {
    try {
      // Check for uncommitted changes
      if (await this.gitManager.hasUncommittedChanges()) {
        vscode.window.showWarningMessage('You have uncommitted changes!');
        return;
      }

      // Check for conflicts
      if (await this.gitManager.hasConflicts()) {
        vscode.window.showErrorMessage('You have unresolved conflicts!');
        return;
      }

      const currentBranch = await this.gitManager.getBranch();

      // Pull first
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pulling latest changes...',
          cancellable: false,
        },
        async () => {
          const pullResult = await this.gitManager.pull(
            'origin',
            currentBranch,
          );

          if (
            !pullResult.success &&
            !pullResult.message.includes('up-to-date')
          ) {
            throw new Error(pullResult.message);
          }
        },
      );

      // Push
      const pushResult = await this.gitManager.push('origin', currentBranch, {
        interactive: true,
      });

      if (pushResult.success) {
        vscode.window.showInformationMessage('✓ Pushed successfully!');
      } else {
        vscode.window.showErrorMessage(pushResult.message);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  }

  /**
   * Safe pull with conflict detection
   */
  private async safePull(): Promise<void> {
    const currentBranch = await this.gitManager.getBranch();

    const result = await this.gitManager.pull('origin', currentBranch);

    if (result.success) {
      vscode.window.showInformationMessage('✓ Pulled successfully!');
    } else {
      if (result.message.includes('conflict')) {
        const conflictedFiles = await this.gitManager.getConflictedFiles();
        vscode.window.showErrorMessage(
          `Merge conflicts in ${conflictedFiles.length} file(s). Resolve conflicts to continue.`,
        );
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }
  }

  /**
   * Show comprehensive Git status
   */
  private async showStatus(): Promise<void> {
    const info = await this.gitManager.getInfo();
    const stagedFiles = await this.gitManager.getStagedFiles();
    const hasConflicts = await this.gitManager.hasConflicts();

    const status = [
      `Branch: ${info.branch}`,
      `Remote: ${info.remoteUrl || 'none'}`,
      `Last commit: ${info.lastCommit}`,
      '',
      `Uncommitted changes: ${info.uncommittedChanges.length}`,
      `Staged files: ${stagedFiles.length}`,
      hasConflicts ? '⚠️  Has conflicts!' : '',
      '',
      'Recent commits:',
      ...info.recentCommits
        .slice(0, 5)
        .map((c) => `  ${c.hash.substring(0, 7)} ${c.message}`),
    ]
      .filter(Boolean)
      .join('\n');

    vscode.window.showInformationMessage(status, { modal: true });
  }
}

/**
 * Usage in extension activation:
 *
 * export function activate(context: vscode.ExtensionContext) {
 *   const aiProvider = new OllamaProvider(config);
 *   const gitIntegration = new GitIntegration(context, aiProvider);
 * }
 */
