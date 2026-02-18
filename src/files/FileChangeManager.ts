import { FileChange, FileOperationEntry } from '../types';
import { FileUtils } from '../utils/FileUtils';
import { Logger } from '../utils/Logger';

const MAX_HISTORY = 50;

/**
 * Manages file changes with backup, undo/redo, atomic apply, and diff generation.
 */
export class FileChangeManager {
  private undoStack: FileOperationEntry[] = [];
  private redoStack: FileOperationEntry[] = [];
  private fileUtils: FileUtils;
  private logger: Logger;

  constructor(private workspaceRoot: string) {
    this.fileUtils = new FileUtils(workspaceRoot);
    this.logger = new Logger('FileChangeManager');
  }

  /**
   * Apply a set of file changes atomically with backups.
   * If any change fails, all previous changes in this batch are rolled back.
   */
  async applyChanges(changes: FileChange[], description: string): Promise<FileOperationEntry> {
    const entry: FileOperationEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      description,
      changes: [],
      backupPaths: new Map(),
    };

    const appliedIndices: number[] = [];

    try {
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];

        // Read original content and create backup
        let originalContent = '';
        if (change.type !== 'create') {
          try {
            originalContent = await this.fileUtils.readFile(change.file);
            const backupPath = await this.fileUtils.backupFile(change.file);
            if (backupPath) {
              entry.backupPaths.set(change.file, backupPath);
            }
          } catch {
            originalContent = '';
          }
        }

        // Apply the change
        switch (change.type) {
          case 'create':
          case 'edit':
            await this.fileUtils.writeFile(change.file, change.newContent);
            break;
          case 'delete':
            const backupPath = await this.fileUtils.backupFile(change.file);
            if (backupPath) { entry.backupPaths.set(change.file, backupPath); }
            await this.fileUtils.deleteFile(change.file);
            break;
        }

        entry.changes.push({ ...change, originalContent });
        appliedIndices.push(i);
      }

      // Success - push to undo stack
      this.undoStack.push(entry);
      this.redoStack = []; // Clear redo on new change
      if (this.undoStack.length > MAX_HISTORY) { this.undoStack.shift(); }

      this.logger.info(`Applied ${changes.length} changes: ${description}`);
      return entry;

    } catch (error: any) {
      // Rollback on failure
      this.logger.error(`Change failed, rolling back: ${error.message}`);
      for (let i = appliedIndices.length - 1; i >= 0; i--) {
        const change = entry.changes[i];
        try {
          if (change.type === 'create') {
            await this.fileUtils.deleteFile(change.file);
          } else if (change.type === 'edit') {
            await this.fileUtils.writeFile(change.file, change.originalContent);
          } else if (change.type === 'delete') {
            const backup = entry.backupPaths.get(change.file);
            if (backup) { await this.fileUtils.restoreFromBackup(change.file, backup); }
          }
        } catch { /* best effort rollback */ }
      }
      throw error;
    }
  }

  /**
   * Undo the most recent operation (or a specific one by ID).
   */
  async undo(operationId?: string): Promise<boolean> {
    let entry: FileOperationEntry | undefined;

    if (operationId) {
      const idx = this.undoStack.findIndex(e => e.id === operationId);
      if (idx === -1) { return false; }
      entry = this.undoStack.splice(idx, 1)[0];
    } else {
      entry = this.undoStack.pop();
    }

    if (!entry) { return false; }

    // Reverse changes in reverse order
    for (let i = entry.changes.length - 1; i >= 0; i--) {
      const change = entry.changes[i];
      try {
        switch (change.type) {
          case 'create':
            await this.fileUtils.deleteFile(change.file);
            break;
          case 'edit':
            await this.fileUtils.writeFile(change.file, change.originalContent);
            break;
          case 'delete':
            const backup = entry.backupPaths.get(change.file);
            if (backup) {
              await this.fileUtils.restoreFromBackup(change.file, backup);
            } else {
              await this.fileUtils.writeFile(change.file, change.originalContent);
            }
            break;
        }
      } catch (err: any) {
        this.logger.error(`Undo failed for ${change.file}: ${err.message}`);
      }
    }

    this.redoStack.push(entry);
    this.logger.info(`Undone: ${entry.description}`);
    return true;
  }

  /**
   * Redo the most recently undone operation.
   */
  async redo(): Promise<boolean> {
    const entry = this.redoStack.pop();
    if (!entry) { return false; }

    try {
      await this.applyChanges(entry.changes, entry.description);
      return true;
    } catch {
      return false;
    }
  }

  getUndoStack(): FileOperationEntry[] {
    return [...this.undoStack];
  }

  getRedoStack(): FileOperationEntry[] {
    return [...this.redoStack];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Generate a unified diff string for a file change.
   */
  generateDiff(change: FileChange): string {
    return FileUtils.generateDiff(change.originalContent, change.newContent, change.file);
  }

  private generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
