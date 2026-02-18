# Git Management System - Usage Guide

This guide demonstrates how to use the enhanced Git management system with write operations, AI-powered commit messages, and workflow automation.

## Table of Contents

1. [Basic Git Operations](#basic-git-operations)
2. [AI-Powered Commit Messages](#ai-powered-commit-messages)
3. [Git Workflows](#git-workflows)
4. [Error Handling](#error-handling)
5. [Interactive Mode](#interactive-mode)
6. [Dry Run Mode](#dry-run-mode)

---

## Basic Git Operations

### Stage and Unstage Files

\`\`\`typescript
import { GitManager } from './core/gitManager';

const gitManager = new GitManager(workspaceRoot);

// Stage specific files
const stageResult = await gitManager.stageFiles([
'src/app.ts',
'src/utils/helper.ts'
]);

if (stageResult.success) {
console.log(stageResult.message); // "Successfully staged 2 file(s)"
}

// Stage all changes
await gitManager.stageAll();

// Unstage files
await gitManager.unstageFiles(['src/app.ts']);

// Get staged files
const stagedFiles = await gitManager.getStagedFiles();
console.log('Staged:', stagedFiles);
\`\`\`

### Commit Changes

\`\`\`typescript
// Simple commit
await gitManager.createCommit('feat: add new feature');

// Commit specific files
await gitManager.createCommit(
'fix: resolve authentication bug',
['src/auth.ts', 'src/middleware/auth.ts']
);

// Commit with options
await gitManager.createCommit(
'docs: update README',
undefined,
{
amend: false,
allowEmpty: false,
noVerify: false,
interactive: true // Ask for confirmation
}
);
\`\`\`

### Branch Operations

\`\`\`typescript
// Create a new branch
await gitManager.createBranch('feature/new-ui');

// Create branch from specific base
await gitManager.createBranch('feature/api-v2', 'develop');

// Switch branches
await gitManager.switchBranch('main');

// List all branches
const branches = await gitManager.listBranches();
console.log('Branches:', branches);

// List including remote branches
const allBranches = await gitManager.listBranches(true);

// Delete branch
await gitManager.deleteBranch('feature/old-feature');

// Force delete unmerged branch
await gitManager.deleteBranch('feature/abandoned', { force: true });
\`\`\`

### Push and Pull

\`\`\`typescript
// Push to remote
await gitManager.push('origin', 'main');

// Push with upstream
await gitManager.push('origin', 'feature/new', {
setUpstream: true
});

// Force push (use with caution!)
await gitManager.push('origin', 'main', {
force: true,
interactive: true // Will ask for confirmation
});

// Push tags
await gitManager.push('origin', 'main', { tags: true });

// Pull from remote
await gitManager.pull('origin', 'main');

// Pull with rebase
await gitManager.pull('origin', 'develop', {
rebase: true
});

// Fetch from remote
await gitManager.fetch('origin');
\`\`\`

### Merge and Rebase

\`\`\`typescript
// Merge branch
await gitManager.merge('feature/new-feature');

// Merge with no fast-forward
await gitManager.merge('feature/new-feature', {
noFastForward: true
});

// Squash merge
await gitManager.merge('feature/small-fix', {
squash: true
});

// Rebase
await gitManager.rebase('develop');

// Interactive rebase
await gitManager.rebase('main', { interactive: true });

// Check for conflicts
const hasConflicts = await gitManager.hasConflicts();
if (hasConflicts) {
const conflicted = await gitManager.getConflictedFiles();
console.log('Resolve these files:', conflicted);
}
\`\`\`

### Discard Changes

\`\`\`typescript
// Discard changes to specific files (always requires confirmation)
await gitManager.discardChanges([
'src/temp.ts',
'src/test-file.ts'
]);
\`\`\`

---

## AI-Powered Commit Messages

### Basic Usage

\`\`\`typescript
import { CommitMessageGenerator } from './core/CommitMessageGenerator';
import { OllamaProvider } from './providers/ollamaProvider';

// Initialize with AI provider
const aiProvider = new OllamaProvider(config);
const generator = new CommitMessageGenerator(aiProvider);

// Get diff and staged files
const diff = await gitManager.getStagedDiff();
const stagedFiles = await gitManager.getStagedFiles();

// Generate commit message
const message = await generator.generateFromDiff(diff, stagedFiles);

console.log(message.full);
// Output:
// feat(auth): add OAuth2 login support
//
// Implement OAuth2 authentication flow with Google and GitHub providers.
// Users can now sign in using their social accounts.
//
// BREAKING CHANGE: Local auth API endpoints changed from /auth/_ to /auth/local/_
\`\`\`

### Customization Options

\`\`\`typescript
// Generate with specific type
const message = await generator.generateFromDiff(diff, stagedFiles, {
type: 'fix',
scope: 'api',
includeBody: true,
includeFooter: true,
maxLength: 50
});

// Generate with breaking change
const message = await generator.generateFromDiff(diff, stagedFiles, {
breaking: true,
includeFooter: true
});

// Use custom template
const message = await generator.generateFromDiff(diff, stagedFiles, {
customTemplate: '{type}({scope}): {subject}\n\n{body}\n\n{footer}'
});
\`\`\`

### Conventional Commit Types

\`\`\`typescript
// Available types:
const types = [
'feat', // New feature
'fix', // Bug fix
'docs', // Documentation
'style', // Code style (formatting)
'refactor', // Code refactoring
'perf', // Performance improvement
'test', // Tests
'build', // Build system
'ci', // CI configuration
'chore', // Other changes
'revert' // Revert commit
];
\`\`\`

### Validation

\`\`\`typescript
// Validate commit message format
const validation = generator.validateFormat(
'feat(auth): add OAuth2 support'
);

if (!validation.valid) {
console.error('Errors:', validation.errors);
}
\`\`\`

### Without AI (Rule-based Fallback)

\`\`\`typescript
// Generator works without AI provider (rule-based)
const generator = new CommitMessageGenerator();

const message = await generator.generateFromDiff(diff, stagedFiles, {
type: 'feat',
scope: 'ui',
includeBody: true
});
// Still generates meaningful messages based on file analysis
\`\`\`

---

## Git Workflows

### Feature Branch Workflow

\`\`\`typescript
import { GitWorkflowManager } from './core/GitWorkflowManager';

const workflowManager = new GitWorkflowManager(gitManager, aiProvider);

// Start a new feature
await workflowManager.startFeature('user-authentication', {
baseBranch: 'develop',
remote: 'origin'
});

// ... make changes ...

// Finish the feature (commits, merges, and cleans up)
await workflowManager.finishFeature('Add user authentication', {
autoCommit: true,
autoPush: true,
baseBranch: 'develop'
});
\`\`\`

### Hotfix Workflow

\`\`\`typescript
// Start a hotfix
await workflowManager.startHotfix('critical-security-patch', {
baseBranch: 'main'
});

// ... fix the issue ...

// Finish hotfix (merges to main and develop)
await workflowManager.finishHotfix(
'fix(security): patch XSS vulnerability',
{
targetBranches: ['main', 'develop'],
autoPush: true
}
);
\`\`\`

### Release Workflow

\`\`\`typescript
// Create a release
await workflowManager.createRelease({
version: '1.2.0',
createTag: true,
tagMessage: 'Release v1.2.0 - New features and bug fixes',
autoPush: true,
baseBranch: 'develop'
});

// This will:
// 1. Create release/1.2.0 branch
// 2. Update version in package.json
// 3. Commit version bump
// 4. Merge to main
// 5. Create git tag v1.2.0
// 6. Back-merge to develop
// 7. Delete release branch
// 8. Push all changes and tags
\`\`\`

### Pull Request Creation

\`\`\`typescript
// Create PR with GitHub CLI (if installed)
await workflowManager.createPullRequest({
title: 'feat: Add new dashboard',
body: 'This PR adds a new dashboard with analytics...',
baseBranch: 'main',
draft: false,
labels: ['enhancement', 'frontend'],
reviewers: ['john-doe', 'jane-smith'],
assignees: ['myself']
});

// Create PR with GitHub API
await workflowManager.createPullRequest(
{
title: 'fix: Resolve login issue',
body: 'Fixes #123',
baseBranch: 'main'
},
{
token: 'ghp_your_token_here',
owner: 'your-username',
repo: 'your-repo'
}
);

// If neither CLI nor API token, opens browser to create PR manually
\`\`\`

---

## Error Handling

### Comprehensive Error Handling

\`\`\`typescript
const result = await gitManager.createCommit('feat: new feature');

if (!result.success) {
console.error('Operation failed:', result.message);
console.error('Error details:', result.error);

// Handle specific errors
if (result.message.includes('conflict')) {
// Handle merge conflict
vscode.window.showErrorMessage(
'Merge conflict detected. Please resolve conflicts.'
);
} else if (result.message.includes('Permission denied')) {
// Handle permission issues
vscode.window.showErrorMessage(
'Permission denied. Check your Git credentials.'
);
}
} else {
console.log('Success:', result.message);
console.log('Output:', result.stdout);
}
\`\`\`

### Common Error Patterns

\`\`\`typescript
// Not a git repository
const isRepo = await gitManager.isGitRepo();
if (!isRepo) {
console.error('Not a Git repository!');
return;
}

// Check for uncommitted changes before operations
const hasChanges = await gitManager.hasUncommittedChanges();
if (hasChanges) {
console.warn('You have uncommitted changes!');
}

// Check for conflicts before merging
const hasConflicts = await gitManager.hasConflicts();
if (hasConflicts) {
const files = await gitManager.getConflictedFiles();
console.error('Conflicts in:', files);
}
\`\`\`

---

## Interactive Mode

### User Confirmations

\`\`\`typescript
// Operations in interactive mode will prompt user for confirmation

// Staging (shows files to be staged)
await gitManager.stageFiles(['src/app.ts'], {
interactive: true
});

// Committing (shows commit message and files)
await gitManager.createCommit('feat: new feature', undefined, {
interactive: true
});

// Pushing (shows remote and branch)
await gitManager.push('origin', 'main', {
interactive: true
});

// Destructive operations (always show warning)
await gitManager.discardChanges(['src/temp.ts']);
// Always shows: "⚠️ Discard changes to 1 file(s)? This cannot be undone!"

await gitManager.deleteBranch('old-branch', { force: true });
// Shows: "⚠️ Force delete (unmerged changes will be lost)"
\`\`\`

---

## Dry Run Mode

### Test Operations Safely

\`\`\`typescript
// All operations support dry-run mode
// No actual changes are made - just shows what would happen

// Stage files (dry run)
const result = await gitManager.stageFiles(['src/app.ts'], {
dryRun: true
});
console.log(result.message);
// "[DRY RUN] Would stage: src/app.ts"

// Commit (dry run)
await gitManager.createCommit('feat: new feature', undefined, {
dryRun: true
});
// "[DRY RUN] Would create commit with message: "feat: new feature""

// Push (dry run)
await gitManager.push('origin', 'main', {
dryRun: true
});
// "[DRY RUN] Would push to origin/main"

// Feature workflow (dry run)
await workflowManager.startFeature('test-feature', {
dryRun: true
});
// Shows all steps without executing them
\`\`\`

---

## Complete Examples

### Example 1: Simple Commit with AI Message

\`\`\`typescript
import { GitManager } from './core/gitManager';
import { CommitMessageGenerator } from './core/CommitMessageGenerator';

async function smartCommit(workspaceRoot: string, aiProvider: any) {
const gitManager = new GitManager(workspaceRoot);
const generator = new CommitMessageGenerator(aiProvider);

// Stage all changes
await gitManager.stageAll();

// Get diff
const diff = await gitManager.getStagedDiff();
const files = await gitManager.getStagedFiles();

// Generate message
const message = await generator.generateFromDiff(diff, files, {
includeBody: true,
includeFooter: true
});

// Validate
const validation = generator.validateFormat(message.full);
if (!validation.valid) {
console.error('Invalid message:', validation.errors);
return;
}

// Commit
const result = await gitManager.createCommit(message.full);

if (result.success) {
console.log('✓ Committed:', message.subject);
}
}
\`\`\`

### Example 2: Complete Feature Development

\`\`\`typescript
async function developFeature(
workspaceRoot: string,
featureName: string,
aiProvider: any
) {
const gitManager = new GitManager(workspaceRoot);
const workflowManager = new GitWorkflowManager(gitManager, aiProvider);

// 1. Start feature
console.log('Starting feature...');
await workflowManager.startFeature(featureName, {
baseBranch: 'develop'
});

// 2. Make changes...
console.log('Make your changes now...');

// 3. Finish feature
console.log('Finishing feature...');
await workflowManager.finishFeature(undefined, {
autoCommit: true,
autoPush: true,
baseBranch: 'develop'
});

// 4. Create PR
console.log('Creating PR...');
await workflowManager.createPullRequest({
title: \`feat: \${featureName}\`,
body: 'Implements new feature',
baseBranch: 'main',
labels: ['feature']
});

console.log('✓ Feature complete!');
}
\`\`\`

### Example 3: Safe Push with Checks

\`\`\`typescript
async function safePush(workspaceRoot: string) {
const gitManager = new GitManager(workspaceRoot);

// Check for uncommitted changes
if (await gitManager.hasUncommittedChanges()) {
console.error('You have uncommitted changes!');
return;
}

// Check for conflicts
if (await gitManager.hasConflicts()) {
console.error('You have unresolved conflicts!');
return;
}

// Pull latest
console.log('Pulling latest...');
const pullResult = await gitManager.pull('origin', 'main');

if (!pullResult.success) {
console.error('Pull failed:', pullResult.message);
return;
}

// Push
console.log('Pushing...');
const pushResult = await gitManager.push('origin', 'main', {
interactive: true
});

if (pushResult.success) {
console.log('✓ Pushed successfully!');
}
}
\`\`\`

---

## Integration with VSCode Extension

\`\`\`typescript
import \* as vscode from 'vscode';
import { GitManager } from './core/gitManager';
import { CommitMessageGenerator } from './core/CommitMessageGenerator';

export function activate(context: vscode.ExtensionContext) {
// Initialize managers
const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
const gitManager = new GitManager(workspaceRoot);
const generator = new CommitMessageGenerator(aiProvider);

// Register command: Smart Commit
context.subscriptions.push(
vscode.commands.registerCommand('testfire.smartCommit', async () => {
const diff = await gitManager.getStagedDiff();
const files = await gitManager.getStagedFiles();

      if (files.length === 0) {
        vscode.window.showErrorMessage('No staged files!');
        return;
      }

      const message = await generator.generateFromDiff(diff, files, {
        includeBody: true
      });

      const result = await gitManager.createCommit(message.full, undefined, {
        interactive: true
      });

      if (result.success) {
        vscode.window.showInformationMessage('✓ Committed successfully!');
      }
    })

);

// Register command: Start Feature
context.subscriptions.push(
vscode.commands.registerCommand('testfire.startFeature', async () => {
const featureName = await vscode.window.showInputBox({
prompt: 'Enter feature name',
placeHolder: 'user-authentication'
});

      if (!featureName) { return; }

      const workflowManager = new GitWorkflowManager(gitManager, aiProvider);
      const result = await workflowManager.startFeature(featureName);

      if (result.success) {
        vscode.window.showInformationMessage(\`Feature '\${featureName}' started!\`);
      }
    })

);
}
\`\`\`

---

## Best Practices

1. **Always use interactive mode for destructive operations**
   \`\`\`typescript
   await gitManager.discardChanges(files); // Always interactive
   await gitManager.deleteBranch(branch, { force: true }); // Always warns
   \`\`\`

2. **Use dry-run mode when testing**
   \`\`\`typescript
   await gitManager.createCommit(message, files, { dryRun: true });
   \`\`\`

3. **Handle errors gracefully**
   \`\`\`typescript
   const result = await gitManager.push('origin', 'main');
   if (!result.success) {
   vscode.window.showErrorMessage(result.message);
   }
   \`\`\`

4. **Check repository state before operations**
   \`\`\`typescript
   const isRepo = await gitManager.isGitRepo();
   const hasChanges = await gitManager.hasUncommittedChanges();
   const hasConflicts = await gitManager.hasConflicts();
   \`\`\`

5. **Use AI for commit messages**
   \`\`\`typescript
   const generator = new CommitMessageGenerator(aiProvider);
   const message = await generator.generateFromDiff(diff, files);
   \`\`\`

---

## API Reference

See the TypeScript definitions in the source files for complete API documentation:

- \`src/core/gitManager.ts\` - Core Git operations
- \`src/core/CommitMessageGenerator.ts\` - AI commit message generation
- \`src/core/GitWorkflowManager.ts\` - High-level workflows

---

## License

MIT
