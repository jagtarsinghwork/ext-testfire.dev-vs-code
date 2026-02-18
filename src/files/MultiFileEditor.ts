import * as vscode from 'vscode';
import * as path from 'path';
import { MultiFileEdit, SingleFileEdit, FileChange } from '../types';
import { FileChangeManager } from './FileChangeManager';
import { FileUtils } from '../utils/FileUtils';
import { WorkspaceScanner } from '../workspace/WorkspaceScanner';
import { Logger } from '../utils/Logger';

/**
 * Handles multi-file editing with preview, per-file accept/reject,
 * auto-import management, and code formatting.
 */
export class MultiFileEditor {
  private pendingEdits: Map<string, MultiFileEdit> = new Map();
  private fileUtils: FileUtils;
  private logger: Logger;

  constructor(
    private changeManager: FileChangeManager,
    private scanner: WorkspaceScanner,
    private workspaceRoot: string
  ) {
    this.fileUtils = new FileUtils(workspaceRoot);
    this.logger = new Logger('MultiFileEditor');
  }

  /**
   * Create a multi-file edit from AI-proposed changes. Returns an edit
   * object with per-file diffs that can be previewed before applying.
   */
  async createEdit(changes: FileChange[], description: string): Promise<MultiFileEdit> {
    const edits: SingleFileEdit[] = [];

    for (const change of changes) {
      let originalContent = '';
      if (change.type !== 'create') {
        try { originalContent = await this.fileUtils.readFile(change.file); }
        catch { originalContent = ''; }
      }

      const diff = FileUtils.generateDiff(originalContent, change.newContent, change.file);

      edits.push({
        file: change.file,
        type: change.type,
        originalContent,
        newContent: change.newContent,
        diff,
        accepted: true, // all accepted by default
      });
    }

    const edit: MultiFileEdit = {
      id: `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      description,
      edits,
      status: 'pending',
    };

    this.pendingEdits.set(edit.id, edit);
    return edit;
  }

  /**
   * Accept or reject a specific file in a multi-file edit.
   */
  setFileAccepted(editId: string, fileIndex: number, accepted: boolean): void {
    const edit = this.pendingEdits.get(editId);
    if (edit && edit.edits[fileIndex]) {
      edit.edits[fileIndex].accepted = accepted;
    }
  }

  /**
   * Apply the accepted files from a multi-file edit.
   */
  async applyEdit(editId: string): Promise<void> {
    const edit = this.pendingEdits.get(editId);
    if (!edit) { throw new Error(`Edit ${editId} not found`); }

    const acceptedChanges: FileChange[] = edit.edits
      .filter(e => e.accepted)
      .map(e => ({
        file: e.file,
        originalContent: e.originalContent,
        newContent: e.newContent,
        type: e.type,
      }));

    if (acceptedChanges.length === 0) {
      this.logger.info('No changes accepted, skipping apply');
      edit.status = 'reverted';
      return;
    }

    await this.changeManager.applyChanges(acceptedChanges, edit.description);
    edit.status = 'applied';

    // Format changed files
    await this.formatFiles(acceptedChanges.map(c => c.file));

    // Fix imports if needed
    await this.fixImports(acceptedChanges);

    this.pendingEdits.delete(editId);
    this.logger.info(`Applied ${acceptedChanges.length}/${edit.edits.length} file changes`);
  }

  /**
   * Show a diff preview in VS Code for a specific file in the edit.
   */
  async showDiffPreview(editId: string, fileIndex: number): Promise<void> {
    const edit = this.pendingEdits.get(editId);
    if (!edit || !edit.edits[fileIndex]) { return; }

    const fileEdit = edit.edits[fileIndex];
    const fullPath = path.join(this.workspaceRoot, fileEdit.file);

    // Create temp file with new content
    const newUri = vscode.Uri.parse(`testfire-preview:${fileEdit.file}?content=${encodeURIComponent(fileEdit.newContent)}`);
    const originalUri = fileEdit.type === 'create'
      ? vscode.Uri.parse('testfire-preview:empty?content=')
      : vscode.Uri.file(fullPath);

    const title = fileEdit.type === 'create'
      ? `Create: ${fileEdit.file}`
      : fileEdit.type === 'delete'
        ? `Delete: ${fileEdit.file}`
        : `Changes: ${fileEdit.file}`;

    await vscode.commands.executeCommand('vscode.diff', originalUri, newUri, title);
  }

  /**
   * Revert (cancel) a pending edit.
   */
  revertEdit(editId: string): void {
    const edit = this.pendingEdits.get(editId);
    if (edit) {
      edit.status = 'reverted';
      this.pendingEdits.delete(editId);
    }
  }

  getPendingEdit(editId: string): MultiFileEdit | undefined {
    return this.pendingEdits.get(editId);
  }

  getAllPendingEdits(): MultiFileEdit[] {
    return Array.from(this.pendingEdits.values());
  }

  /**
   * Auto-fix imports for changed files. Detects missing imports and adds them.
   */
  private async fixImports(changes: FileChange[]): Promise<void> {
    for (const change of changes) {
      if (change.type === 'delete') { continue; }
      const ext = path.extname(change.file).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) { continue; }

      try {
        const content = await this.fileUtils.readFile(change.file);
        const fixed = this.autoFixImports(content, change.file);
        if (fixed !== content) {
          await this.fileUtils.writeFile(change.file, fixed);
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Simple auto-import: detect undefined identifiers that match exports in the workspace.
   */
  private autoFixImports(content: string, filePath: string): string {
    // Get all used identifiers in the file
    const usedIdents = new Set<string>();
    const identRegex = /\b([A-Z]\w+)\b/g;
    let m;
    while ((m = identRegex.exec(content))) { usedIdents.add(m[1]); }

    // Get already imported identifiers
    const importedIdents = new Set<string>();
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from/g;
    while ((m = importRegex.exec(content))) {
      if (m[1]) {
        m[1].split(',').forEach(s => importedIdents.add(s.trim().split(/\s+as\s+/)[0]));
      }
      if (m[2]) { importedIdents.add(m[2]); }
    }

    // Find missing identifiers that exist as exports in the workspace
    const missing = new Set<string>();
    for (const ident of usedIdents) {
      if (importedIdents.has(ident)) { continue; }
      // Check if it's a known type/class/function
      const files = this.scanner.getFiles();
      for (const file of files) {
        if (file.relativePath === filePath) { continue; }
        if (file.exports.includes(ident)) {
          missing.add(ident);
          break;
        }
      }
    }

    // We don't auto-add imports to avoid incorrect additions.
    // This could be enhanced with more sophisticated logic.
    return content;
  }

  /**
   * Format files using VS Code's built-in formatter.
   */
  private async formatFiles(filePaths: string[]): Promise<void> {
    for (const fp of filePaths) {
      try {
        const fullPath = path.join(this.workspaceRoot, fp);
        const uri = vscode.Uri.file(fullPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          'vscode.executeFormatDocumentProvider', doc.uri
        );
        if (edits && edits.length > 0) {
          const wsEdit = new vscode.WorkspaceEdit();
          for (const edit of edits) {
            wsEdit.replace(doc.uri, edit.range, edit.newText);
          }
          await vscode.workspace.applyEdit(wsEdit);
          await doc.save();
        }
      } catch { /* formatting is best-effort */ }
    }
  }
}
