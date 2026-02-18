import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Utility functions for file system operations.
 */
export class FileUtils {
  constructor(private workspaceRoot: string) {}

  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolve(filePath);
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
    return Buffer.from(bytes).toString('utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    await this.ensureDir(path.dirname(fullPath));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), Buffer.from(content, 'utf-8'));
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    await vscode.workspace.fs.delete(vscode.Uri.file(fullPath));
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(filePath);
      await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
      return true;
    } catch { return false; }
  }

  async ensureDir(dirPath: string): Promise<void> {
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(this.workspaceRoot, dirPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(fullPath));
  }

  /**
   * Create a backup of a file in a .testfire-backups directory.
   */
  async backupFile(filePath: string): Promise<string> {
    const fullPath = this.resolve(filePath);
    const relativePath = path.relative(this.workspaceRoot, fullPath);
    const timestamp = Date.now();
    const backupDir = path.join(this.workspaceRoot, '.testfire-backups', path.dirname(relativePath));
    const backupName = `${path.basename(relativePath)}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupName);

    try {
      await this.ensureDir(backupDir);
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
      await vscode.workspace.fs.writeFile(vscode.Uri.file(backupPath), content);
      return backupPath;
    } catch {
      return '';
    }
  }

  /**
   * Restore a file from a backup path.
   */
  async restoreFromBackup(originalPath: string, backupPath: string): Promise<boolean> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(backupPath));
      const fullPath = this.resolve(originalPath);
      await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), content);
      return true;
    } catch { return false; }
  }

  /**
   * Get file stat info (size, modified time).
   */
  async stat(filePath: string): Promise<{ size: number; mtime: number } | null> {
    try {
      const fullPath = this.resolve(filePath);
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
      return { size: stat.size, mtime: stat.mtime };
    } catch { return null; }
  }

  /**
   * Generate a simple unified diff between two strings.
   */
  static generateDiff(original: string, modified: string, filePath?: string): string {
    const oldLines = original.split('\n');
    const newLines = modified.split('\n');
    const diff: string[] = [];

    if (filePath) {
      diff.push(`--- a/${filePath}`);
      diff.push(`+++ b/${filePath}`);
    }

    const maxLen = Math.max(oldLines.length, newLines.length);
    let contextBefore: string[] = [];
    let changes: string[] = [];
    let hunkStartOld = 0;
    let hunkStartNew = 0;
    let inHunk = false;

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined;
      const newLine = i < newLines.length ? newLines[i] : undefined;

      if (oldLine === newLine) {
        if (inHunk) {
          changes.push(` ${oldLine ?? ''}`);
          // End hunk after 3 context lines
          if (changes.filter(c => c.startsWith(' ')).length > 3 &&
              changes[changes.length - 1].startsWith(' ') &&
              changes[changes.length - 2].startsWith(' ') &&
              changes[changes.length - 3].startsWith(' ')) {
            diff.push(`@@ -${hunkStartOld + 1} +${hunkStartNew + 1} @@`);
            diff.push(...changes);
            changes = [];
            inHunk = false;
          }
        } else {
          contextBefore.push(` ${oldLine ?? ''}`);
          if (contextBefore.length > 3) { contextBefore.shift(); }
        }
      } else {
        if (!inHunk) {
          inHunk = true;
          hunkStartOld = Math.max(0, i - contextBefore.length);
          hunkStartNew = Math.max(0, i - contextBefore.length);
          changes.push(...contextBefore);
          contextBefore = [];
        }
        if (oldLine !== undefined) { changes.push(`-${oldLine}`); }
        if (newLine !== undefined) { changes.push(`+${newLine}`); }
      }
    }

    if (inHunk && changes.length > 0) {
      diff.push(`@@ -${hunkStartOld + 1} +${hunkStartNew + 1} @@`);
      diff.push(...changes);
    }

    return diff.join('\n');
  }

  private resolve(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
  }
}
