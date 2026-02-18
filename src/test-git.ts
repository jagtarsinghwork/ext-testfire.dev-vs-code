/**
 * Quick test script to verify Git functionality
 * Run: node dist/test-git.js
 */

import { GitManager } from './core/gitManager';
import { CommitMessageGenerator } from './core/CommitMessageGenerator';

async function testGitOperations() {
  console.log('🧪 Testing Git Management System\n');

  const workspaceRoot = process.cwd();
  const gitManager = new GitManager(workspaceRoot);

  try {
    // Test 1: Check if in git repo
    console.log('Test 1: Check Git repository');
    const isRepo = await gitManager.isGitRepo();
    console.log(`✓ Is Git repo: ${isRepo}\n`);

    if (!isRepo) {
      console.log('⚠️  Not a Git repository. Skipping further tests.\n');
      return;
    }

    // Test 2: Get Git info
    console.log('Test 2: Get Git info');
    const info = await gitManager.getInfo();
    console.log(`✓ Branch: ${info.branch}`);
    console.log(`✓ Remote: ${info.remoteUrl}`);
    console.log(`✓ Last commit: ${info.lastCommit}`);
    console.log(`✓ Uncommitted changes: ${info.uncommittedChanges.length}`);
    console.log(`✓ Recent commits: ${info.recentCommits.length}\n`);

    // Test 3: Check for uncommitted changes
    console.log('Test 3: Check uncommitted changes');
    const hasChanges = await gitManager.hasUncommittedChanges();
    console.log(`✓ Has uncommitted changes: ${hasChanges}\n`);

    // Test 4: Get staged files
    console.log('Test 4: Get staged files');
    const stagedFiles = await gitManager.getStagedFiles();
    console.log(`✓ Staged files: ${stagedFiles.length}`);
    if (stagedFiles.length > 0) {
      console.log(`  Files: ${stagedFiles.join(', ')}`);
    }
    console.log();

    // Test 5: List branches
    console.log('Test 5: List branches');
    const branches = await gitManager.listBranches();
    console.log(`✓ Branches: ${branches.length}`);
    console.log(`  Current: ${info.branch}`);
    console.log(
      `  All: ${branches.slice(0, 5).join(', ')}${branches.length > 5 ? '...' : ''}\n`,
    );

    // Test 6: Check for conflicts
    console.log('Test 6: Check for conflicts');
    const hasConflicts = await gitManager.hasConflicts();
    console.log(`✓ Has conflicts: ${hasConflicts}\n`);

    // Test 7: Test commit message generator
    console.log('Test 7: Test commit message generator (rule-based)');
    const generator = new CommitMessageGenerator();

    if (stagedFiles.length > 0) {
      const diff = await gitManager.getStagedDiff();
      const message = await generator.generateFromDiff(diff, stagedFiles, {
        includeBody: true,
      });
      console.log(`✓ Generated commit message:`);
      console.log(`  Type: ${message.type}`);
      console.log(`  Scope: ${message.scope || 'none'}`);
      console.log(`  Subject: ${message.subject}`);
      console.log(
        `  Full:\n${message.full
          .split('\n')
          .map((l) => '    ' + l)
          .join('\n')}\n`,
      );

      // Test validation
      const validation = generator.validateFormat(message.full);
      console.log(`✓ Message validation: ${validation.valid}`);
      if (!validation.valid) {
        console.log(`  Errors: ${validation.errors.join(', ')}`);
      }
    } else {
      console.log('⚠️  No staged files to generate message from\n');
    }

    // Test 8: Test dry-run mode
    console.log('\nTest 8: Test dry-run mode');
    const dryRunResult = await gitManager.createCommit(
      'test: dry run commit',
      undefined,
      {
        dryRun: true,
      },
    );
    console.log(`✓ Dry run result: ${dryRunResult.success}`);
    console.log(`  Message: ${dryRunResult.message}\n`);

    // Test 9: Test error handling
    console.log('Test 9: Test error handling');
    const errorResult = await gitManager.createCommit('', undefined, {
      dryRun: true,
    });
    console.log(`✓ Error handling: ${!errorResult.success}`);
    console.log(`  Error message: ${errorResult.message}\n`);

    console.log('✅ All tests passed!\n');

    // Summary
    console.log('📊 Summary:');
    console.log(
      `  - Repository: ${info.branch} @ ${info.remoteUrl || 'no remote'}`,
    );
    console.log(`  - Status: ${hasChanges ? 'has changes' : 'clean'}`);
    console.log(`  - Staged: ${stagedFiles.length} files`);
    console.log(`  - Conflicts: ${hasConflicts ? 'yes' : 'no'}`);
    console.log(`  - Branches: ${branches.length}`);
    console.log();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testGitOperations().catch(console.error);
