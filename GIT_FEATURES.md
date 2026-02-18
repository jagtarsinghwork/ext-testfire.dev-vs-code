# Git Management System

A comprehensive Git management system for VS Code with AI-powered commit messages, high-level workflows, and GitHub integration.

## 🚀 Features

### Core Git Operations

- ✅ **Stage/Unstage Files** - Selective file staging with interactive selection
- ✅ **Commit Management** - Create commits with options (amend, no-verify, etc.)
- ✅ **Branch Operations** - Create, switch, delete, merge, and rebase branches
- ✅ **Remote Operations** - Push, pull, fetch with conflict detection
- ✅ **Change Management** - Discard changes with safety confirmations
- ✅ **Conflict Detection** - Identify and list conflicted files
- ✅ **Diff Operations** - Get diffs for files, commits, and branches

### AI-Powered Commit Messages

- 🤖 **Intelligent Generation** - Analyzes git diff to create meaningful messages
- 📝 **Conventional Commits** - Follows industry-standard format (feat, fix, docs, etc.)
- 🎯 **Type Detection** - Automatically determines commit type from changes
- 🔍 **Scope Detection** - Identifies scope from file paths
- ⚠️ **Breaking Change Detection** - Recognizes breaking changes in diffs
- ✅ **Message Validation** - Validates commit message format
- 🎨 **Custom Templates** - Support for custom commit message formats
- 🔄 **Fallback Mode** - Works without AI using rule-based generation

### High-Level Workflows

- 🌿 **Feature Branch Workflow** - Start and finish features with automation
- 🔥 **Hotfix Workflow** - Create and deploy hotfixes to multiple branches
- 🎉 **Release Workflow** - Automated release creation with versioning and tagging
- 🔀 **Pull Request Creation** - GitHub integration via CLI or API

### Safety Features

- 🛡️ **Interactive Mode** - User confirmation for important operations
- 🧪 **Dry Run Mode** - Test operations without making changes
- ⚠️ **Destructive Warnings** - Always warn for destructive operations
- 📊 **Pre-flight Checks** - Verify repository state before operations
- 🔒 **Error Handling** - Comprehensive error detection and user-friendly messages

## 📦 Installation

The Git management system is built into the Testfire extension. No additional installation required.

## 🎯 Usage

### Basic Git Operations

#### Stage Files

\`\`\`typescript
import { GitManager } from './core/gitManager';

const gitManager = new GitManager(workspaceRoot);

// Stage specific files
await gitManager.stageFiles(['src/app.ts', 'src/utils/helper.ts']);

// Stage all changes
await gitManager.stageAll();

// Unstage files
await gitManager.unstageFiles(['src/app.ts']);
\`\`\`

#### Commit Changes

\`\`\`typescript
// Simple commit
await gitManager.createCommit('feat: add new feature');

// Commit with files
await gitManager.createCommit(
'fix: resolve bug',
['src/auth.ts', 'src/middleware/auth.ts']
);

// Interactive commit (asks for confirmation)
await gitManager.createCommit('docs: update README', undefined, {
interactive: true
});
\`\`\`

#### Branch Operations

\`\`\`typescript
// Create and switch to new branch
await gitManager.createBranch('feature/new-ui');

// Create from specific base
await gitManager.createBranch('feature/api-v2', 'develop');

// Switch branches
await gitManager.switchBranch('main');

// Delete branch
await gitManager.deleteBranch('feature/old');
\`\`\`

### AI-Powered Commit Messages

\`\`\`typescript
import { CommitMessageGenerator } from './core/CommitMessageGenerator';

const generator = new CommitMessageGenerator(aiProvider);

// Get diff and files
const diff = await gitManager.getStagedDiff();
const files = await gitManager.getStagedFiles();

// Generate message
const message = await generator.generateFromDiff(diff, files, {
includeBody: true,
includeFooter: true
});

console.log(message.full);
// Output:
// feat(auth): add OAuth2 login support
//
// Implement OAuth2 authentication flow with Google and GitHub providers.
// Users can now sign in using their social accounts.
\`\`\`

### Git Workflows

#### Feature Branch Workflow

\`\`\`typescript
import { GitWorkflowManager } from './core/GitWorkflowManager';

const workflowManager = new GitWorkflowManager(gitManager, aiProvider);

// Start feature
await workflowManager.startFeature('user-authentication', {
baseBranch: 'develop'
});

// ... make changes ...

// Finish feature (commits, merges, pushes)
await workflowManager.finishFeature('Add user authentication', {
autoCommit: true,
autoPush: true
});
\`\`\`

#### Hotfix Workflow

\`\`\`typescript
// Start hotfix from production
await workflowManager.startHotfix('critical-bug');

// ... fix the issue ...

// Finish (merges to main and develop)
await workflowManager.finishHotfix('fix: critical security patch', {
targetBranches: ['main', 'develop'],
autoPush: true
});
\`\`\`

#### Release Workflow

\`\`\`typescript
// Create release
await workflowManager.createRelease({
version: '1.2.0',
createTag: true,
tagMessage: 'Release v1.2.0',
autoPush: true
});

// This automatically:
// 1. Creates release branch
// 2. Updates package.json version
// 3. Commits version bump
// 4. Merges to main
// 5. Creates git tag
// 6. Back-merges to develop
// 7. Cleans up
\`\`\`

#### Pull Request Creation

\`\`\`typescript
// Create PR (uses GitHub CLI if available)
await workflowManager.createPullRequest({
title: 'feat: Add new dashboard',
body: 'This PR adds a new dashboard...',
baseBranch: 'main',
labels: ['enhancement', 'frontend'],
reviewers: ['john-doe'],
draft: false
});
\`\`\`

## 🎨 VSCode Commands

The extension registers the following commands:

| Command                       | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `testfire.git.smartCommit`    | Stage files and commit with AI-generated message |
| `testfire.git.stageFiles`     | Interactively stage files                        |
| `testfire.git.unstageFiles`   | Interactively unstage files                      |
| `testfire.git.discardChanges` | Discard changes (with warning)                   |
| `testfire.git.createBranch`   | Create a new branch                              |
| `testfire.git.startFeature`   | Start feature branch workflow                    |
| `testfire.git.finishFeature`  | Finish feature branch workflow                   |
| `testfire.git.startHotfix`    | Start hotfix workflow                            |
| `testfire.git.finishHotfix`   | Finish hotfix workflow                           |
| `testfire.git.createRelease`  | Create release with tagging                      |
| `testfire.git.createPR`       | Create GitHub pull request                       |
| `testfire.git.safePush`       | Push with pre-flight checks                      |
| `testfire.git.safePull`       | Pull with conflict detection                     |
| `testfire.git.showStatus`     | Show comprehensive Git status                    |

## 📝 Conventional Commits

The AI commit message generator follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

\`\`\`
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
\`\`\`

### Types

| Type       | Description             | Example                            |
| ---------- | ----------------------- | ---------------------------------- |
| `feat`     | New feature             | `feat(auth): add OAuth2 support`   |
| `fix`      | Bug fix                 | `fix(api): handle null responses`  |
| `docs`     | Documentation           | `docs: update API reference`       |
| `style`    | Code style/formatting   | `style: apply prettier formatting` |
| `refactor` | Code refactoring        | `refactor(db): optimize queries`   |
| `perf`     | Performance improvement | `perf: reduce bundle size`         |
| `test`     | Add/update tests        | `test: add user service tests`     |
| `build`    | Build system changes    | `build: upgrade webpack to v5`     |
| `ci`       | CI configuration        | `ci: add GitHub Actions workflow`  |
| `chore`    | Other changes           | `chore: update dependencies`       |
| `revert`   | Revert previous commit  | `revert: undo feature X`           |

### Breaking Changes

Mark breaking changes with `!` or `BREAKING CHANGE:` in footer:

\`\`\`
feat(api)!: change authentication endpoint

BREAKING CHANGE: Auth endpoint moved from /auth to /api/v2/auth
\`\`\`

## 🛡️ Safety Features

### Interactive Mode

Operations in interactive mode prompt for user confirmation:

\`\`\`typescript
await gitManager.push('origin', 'main', {
interactive: true
});
// Shows: "Push changes? Remote: origin, Branch: main"
\`\`\`

### Dry Run Mode

Test operations without making changes:

\`\`\`typescript
await gitManager.createCommit('feat: new feature', undefined, {
dryRun: true
});
// Output: "[DRY RUN] Would create commit with message: 'feat: new feature'"
\`\`\`

### Destructive Operations

Always show warnings for destructive operations:

\`\`\`typescript
await gitManager.discardChanges(['src/temp.ts']);
// Always shows: "⚠️ Discard changes? This cannot be undone!"

await gitManager.deleteBranch('old-branch', { force: true });
// Shows: "⚠️ Force delete (unmerged changes will be lost)"
\`\`\`

## 🔍 Error Handling

All operations return a `GitOperationResult`:

\`\`\`typescript
interface GitOperationResult {
success: boolean;
message: string;
error?: string;
stdout?: string;
stderr?: string;
}
\`\`\`

Example error handling:

\`\`\`typescript
const result = await gitManager.push('origin', 'main');

if (!result.success) {
if (result.message.includes('conflict')) {
// Handle merge conflict
} else if (result.message.includes('Permission denied')) {
// Handle permission issues
} else {
// General error
console.error(result.error);
}
} else {
console.log('Success:', result.message);
}
\`\`\`

## 🧪 Pre-flight Checks

Check repository state before operations:

\`\`\`typescript
// Check if in git repo
const isRepo = await gitManager.isGitRepo();

// Check for uncommitted changes
const hasChanges = await gitManager.hasUncommittedChanges();

// Check for conflicts
const hasConflicts = await gitManager.hasConflicts();
const conflictedFiles = await gitManager.getConflictedFiles();

// Get staged files
const staged = await gitManager.getStagedFiles();
\`\`\`

## 🔌 GitHub Integration

### Pull Request Creation

Three methods available:

1. **GitHub CLI** (recommended)
   \`\`\`bash

   # Install GitHub CLI

   brew install gh
   gh auth login
   \`\`\`

2. **GitHub API**
   \`\`\`typescript
   await workflowManager.createPullRequest(options, {
   token: 'ghp_your_token',
   owner: 'username',
   repo: 'repository'
   });
   \`\`\`

3. **Browser** (fallback)
   - Opens GitHub compare page in browser

## 📚 API Reference

### GitManager

Core Git operations:

- `stageFiles(files[])` - Stage files
- `stageAll()` - Stage all changes
- `unstageFiles(files[])` - Unstage files
- `createCommit(message, files?, options?)` - Create commit
- `createBranch(name, from?)` - Create branch
- `switchBranch(name)` - Switch branch
- `deleteBranch(name, options?)` - Delete branch
- `push(remote, branch?, options?)` - Push changes
- `pull(remote, branch?, options?)` - Pull changes
- `fetch(remote)` - Fetch from remote
- `merge(branch, options?)` - Merge branch
- `rebase(branch, options?)` - Rebase onto branch
- `discardChanges(files[])` - Discard changes
- `getStagedFiles()` - Get staged files
- `getStagedDiff()` - Get staged diff
- `getConflictedFiles()` - Get conflicted files
- `hasConflicts()` - Check for conflicts
- `hasUncommittedChanges()` - Check for changes

### CommitMessageGenerator

AI-powered commit messages:

- `generateFromDiff(diff, files, options?)` - Generate message
- `validateFormat(message)` - Validate format
- `formatWithTemplate(message, template)` - Format with template

### GitWorkflowManager

High-level workflows:

- `startFeature(name, options?)` - Start feature
- `finishFeature(message?, options?)` - Finish feature
- `startHotfix(name, options?)` - Start hotfix
- `finishHotfix(message, options?)` - Finish hotfix
- `createRelease(options)` - Create release
- `createPullRequest(options, config?)` - Create PR

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT

## 🙏 Acknowledgments

- Conventional Commits specification
- GitHub API
- VS Code Extension API
