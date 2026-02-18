import * as vscode from 'vscode';
import * as path from 'path';
import { FileChange, FileOperationEntry } from '../types';

export class FileOperations {
  private history: FileOperationEntry[] = [];
  private maxHistory = 50;

  constructor(private workspaceRoot: string) {}

  async applyChanges(
    changes: FileChange[],
    description: string,
  ): Promise<FileOperationEntry> {
    const entry: FileOperationEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      description,
      changes: [],
      backupPaths: new Map(),
    };

    for (const change of changes) {
      const fullPath = path.isAbsolute(change.file)
        ? change.file
        : path.join(this.workspaceRoot, change.file);
      const uri = vscode.Uri.file(fullPath);

      // Store original content for undo
      let originalContent = '';
      if (change.type !== 'create') {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          originalContent = Buffer.from(bytes).toString('utf-8');
        } catch {
          originalContent = '';
        }
      }

      switch (change.type) {
        case 'create':
        case 'edit': {
          // Ensure parent directory exists
          const dir = path.dirname(fullPath);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(change.newContent, 'utf-8'),
          );
          break;
        }
        case 'delete': {
          await vscode.workspace.fs.delete(uri);
          break;
        }
      }

      entry.changes.push({
        ...change,
        originalContent,
      });
    }

    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return entry;
  }

  async undoOperation(operationId: string): Promise<boolean> {
    const entryIndex = this.history.findIndex((e) => e.id === operationId);
    if (entryIndex === -1) {
      return false;
    }

    const entry = this.history[entryIndex];

    // Reverse changes in reverse order
    for (let i = entry.changes.length - 1; i >= 0; i--) {
      const change = entry.changes[i];
      const fullPath = path.isAbsolute(change.file)
        ? change.file
        : path.join(this.workspaceRoot, change.file);
      const uri = vscode.Uri.file(fullPath);

      switch (change.type) {
        case 'create': {
          // Undo create = delete
          try {
            await vscode.workspace.fs.delete(uri);
          } catch {
            /* ignore */
          }
          break;
        }
        case 'edit': {
          // Undo edit = restore original
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(change.originalContent, 'utf-8'),
          );
          break;
        }
        case 'delete': {
          // Undo delete = recreate with original content
          const dir = path.dirname(fullPath);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(change.originalContent, 'utf-8'),
          );
          break;
        }
      }
    }

    this.history.splice(entryIndex, 1);
    return true;
  }

  getHistory(): FileOperationEntry[] {
    return [...this.history];
  }

  generateDiff(originalContent: string, newContent: string): string {
    const oldLines = originalContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    // Simple line-by-line diff
    const maxLen = Math.max(oldLines.length, newLines.length);
    let inChange = false;
    let changeStart = 0;

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined;
      const newLine = i < newLines.length ? newLines[i] : undefined;

      if (oldLine !== newLine) {
        if (!inChange) {
          inChange = true;
          changeStart = i;
          // Add context lines before
          const ctxStart = Math.max(0, i - 3);
          if (ctxStart < i) {
            diff.push(
              `@@ -${ctxStart + 1},${i - ctxStart} +${ctxStart + 1},${i - ctxStart} @@`,
            );
            for (let j = ctxStart; j < i; j++) {
              diff.push(` ${oldLines[j] ?? ''}`);
            }
          } else {
            diff.push(`@@ -${i + 1} +${i + 1} @@`);
          }
        }
        if (oldLine !== undefined) {
          diff.push(`-${oldLine}`);
        }
        if (newLine !== undefined) {
          diff.push(`+${newLine}`);
        }
      } else if (inChange) {
        // Add context lines after change
        diff.push(` ${oldLine ?? ''}`);
        if (i - changeStart > 2) {
          inChange = false;
        }
      }
    }

    return diff.join('\n');
  }

  async showDiffPreview(
    filePath: string,
    newContent: string,
    title: string,
  ): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceRoot, filePath);

    const originalUri = vscode.Uri.file(fullPath);

    // Create a virtual document for the new content
    const newUri = vscode.Uri.parse(
      `testfire-preview:${filePath}?content=${encodeURIComponent(newContent)}`,
    );

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      newUri,
      title,
    );
  }

  private generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
