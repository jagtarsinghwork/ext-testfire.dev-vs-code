import { MultiFileEdit, SingleFileEdit, FileChange } from '../types';

/**
 * Generate unified diff between two strings
 */
export function generateDiff(
  original: string,
  modified: string,
  filePath?: string,
): string {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  let diff = '';
  if (filePath) {
    diff += `--- a/${filePath}\n`;
    diff += `+++ b/${filePath}\n`;
  }

  const changes = computeChanges(originalLines, modifiedLines);
  diff += formatChanges(changes, originalLines, modifiedLines);

  return diff;
}

/**
 * Simple line-by-line diff algorithm
 */
function computeChanges(
  originalLines: string[],
  modifiedLines: string[],
): Array<{ type: 'add' | 'remove' | 'same'; lineNum: number; line: string }> {
  const changes: Array<{
    type: 'add' | 'remove' | 'same';
    lineNum: number;
    line: string;
  }> = [];

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i >= originalLines.length) {
      changes.push({ type: 'add', lineNum: j, line: modifiedLines[j] });
      j++;
    } else if (j >= modifiedLines.length) {
      changes.push({ type: 'remove', lineNum: i, line: originalLines[i] });
      i++;
    } else if (originalLines[i] === modifiedLines[j]) {
      changes.push({ type: 'same', lineNum: i, line: originalLines[i] });
      i++;
      j++;
    } else {
      // Look ahead to find matching line
      const findInModified = modifiedLines
        .slice(j, j + 5)
        .indexOf(originalLines[i]);
      const findInOriginal = originalLines
        .slice(i, i + 5)
        .indexOf(modifiedLines[j]);

      if (findInModified !== -1 && findInModified < findInOriginal) {
        // Lines added
        for (let k = 0; k < findInModified; k++) {
          changes.push({
            type: 'add',
            lineNum: j + k,
            line: modifiedLines[j + k],
          });
        }
        j += findInModified;
      } else if (findInOriginal !== -1) {
        // Lines removed
        for (let k = 0; k < findInOriginal; k++) {
          changes.push({
            type: 'remove',
            lineNum: i + k,
            line: originalLines[i + k],
          });
        }
        i += findInOriginal;
      } else {
        // Modified line
        changes.push({ type: 'remove', lineNum: i, line: originalLines[i] });
        changes.push({ type: 'add', lineNum: j, line: modifiedLines[j] });
        i++;
        j++;
      }
    }
  }

  return changes;
}

/**
 * Format changes into unified diff format
 */
function formatChanges(
  changes: Array<{
    type: 'add' | 'remove' | 'same';
    lineNum: number;
    line: string;
  }>,
  originalLines: string[],
  modifiedLines: string[],
): string {
  let diff = '';
  let i = 0;

  while (i < changes.length) {
    // Find next change
    while (i < changes.length && changes[i].type === 'same') {
      i++;
    }

    if (i >= changes.length) break;

    // Include 3 lines of context before
    const contextStart = Math.max(0, i - 3);
    const hunkStart = i;

    // Find end of change block
    let hunkEnd = i;
    while (hunkEnd < changes.length && changes[hunkEnd].type !== 'same') {
      hunkEnd++;
    }

    // Include 3 lines of context after
    const contextEnd = Math.min(changes.length, hunkEnd + 3);

    // Calculate line numbers
    const origStart = changes[contextStart]?.lineNum || 0;
    const modStart = changes[contextStart]?.lineNum || 0;
    const origCount = contextEnd - contextStart;
    const modCount = contextEnd - contextStart;

    diff += `@@ -${origStart + 1},${origCount} +${modStart + 1},${modCount} @@\n`;

    // Add hunk content
    for (let j = contextStart; j < contextEnd; j++) {
      const change = changes[j];
      const prefix =
        change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' ';
      diff += `${prefix}${change.line}\n`;
    }

    i = contextEnd;
  }

  return diff;
}

/**
 * Generate syntax-highlighted diff for display
 */
export function generateHighlightedDiff(
  original: string,
  modified: string,
): Array<{ type: 'add' | 'remove' | 'same'; content: string }> {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const changes = computeChanges(originalLines, modifiedLines);

  return changes.map((change) => ({
    type: change.type,
    content: change.line,
  }));
}

/**
 * Create preview for file changes
 */
export function createFileChangePreview(
  fileChanges: FileChange[],
  editId: string,
  description: string,
): MultiFileEdit {
  const edits: SingleFileEdit[] = fileChanges.map((change) => ({
    file: change.file,
    type: change.type,
    originalContent: change.originalContent,
    newContent: change.newContent,
    diff: generateDiff(change.originalContent, change.newContent, change.file),
    accepted: false,
  }));

  return {
    id: editId,
    description,
    edits,
    status: 'previewing',
  };
}

/**
 * Get summary stats for a diff
 */
export function getDiffStats(diff: string): {
  additions: number;
  deletions: number;
  files: number;
} {
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;
  let files = 0;

  for (const line of lines) {
    if (line.startsWith('+++')) {
      files++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions, files };
}

/**
 * Format diff stats for display
 */
export function formatDiffStats(stats: {
  additions: number;
  deletions: number;
  files: number;
}): string {
  const parts = [];
  if (stats.files > 0) {
    parts.push(`${stats.files} file${stats.files === 1 ? '' : 's'}`);
  }
  if (stats.additions > 0) {
    parts.push(`+${stats.additions}`);
  }
  if (stats.deletions > 0) {
    parts.push(`-${stats.deletions}`);
  }
  return parts.join(', ');
}
