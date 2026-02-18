import * as vscode from 'vscode';
import * as path from 'path';
import { MultiFileEdit, SingleFileEdit } from '../types';
import { MultiFileEditor } from '../files/MultiFileEditor';

/**
 * Webview panel that shows all proposed changes across files,
 * with side-by-side diff, per-file accept/reject, and batch apply.
 */
export class ChangePreviewPanel {
  private static currentPanel: ChangePreviewPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private editor: MultiFileEditor,
    private workspaceRoot: string
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg), null, this.disposables);
  }

  static show(
    edit: MultiFileEdit,
    editor: MultiFileEditor,
    workspaceRoot: string
  ): ChangePreviewPanel {
    if (ChangePreviewPanel.currentPanel) {
      ChangePreviewPanel.currentPanel.panel.reveal();
      ChangePreviewPanel.currentPanel.renderEdit(edit);
      return ChangePreviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'testfireChanges', 'TestFire: Change Preview',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new ChangePreviewPanel(panel, editor, workspaceRoot);
    ChangePreviewPanel.currentPanel = instance;
    instance.renderEdit(edit);
    return instance;
  }

  private currentEdit: MultiFileEdit | null = null;

  renderEdit(edit: MultiFileEdit): void {
    this.currentEdit = edit;
    this.panel.webview.html = this.getHtml(edit);
  }

  private async handleMessage(msg: any): Promise<void> {
    if (!this.currentEdit) { return; }

    switch (msg.type) {
      case 'accept':
        this.editor.setFileAccepted(this.currentEdit.id, msg.index, true);
        break;
      case 'reject':
        this.editor.setFileAccepted(this.currentEdit.id, msg.index, false);
        break;
      case 'applyAll':
        await this.editor.applyEdit(this.currentEdit.id);
        vscode.window.showInformationMessage('All accepted changes applied!');
        this.panel.dispose();
        break;
      case 'cancel':
        this.editor.revertEdit(this.currentEdit.id);
        this.panel.dispose();
        break;
      case 'viewDiff':
        await this.editor.showDiffPreview(this.currentEdit.id, msg.index);
        break;
    }
  }

  private getHtml(edit: MultiFileEdit): string {
    const nonce = getNonce();
    const fileItems = edit.edits.map((e, i) => this.renderFileItem(e, i)).join('');

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h2 { font-size: 15px; margin-bottom: 12px; }
  .summary { color: var(--vscode-descriptionForeground); margin-bottom: 16px; font-size: 12px; }
  .file-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
  .file-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--vscode-sideBar-background); }
  .file-name { font-family: var(--vscode-editor-font-family); font-size: 12px; font-weight: 600; }
  .file-type { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .file-type.create { background: #4caf50; color: white; }
  .file-type.delete { background: #f44336; color: white; }
  .file-actions { display: flex; gap: 6px; }
  .btn { padding: 4px 10px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn.accept { background: #4caf50; color: white; border-color: #4caf50; }
  .btn.reject { background: transparent; color: #f44336; border-color: #f44336; }
  .btn.reject.active { background: #f44336; color: white; }
  .diff-block { padding: 8px 12px; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre; overflow-x: auto; background: var(--vscode-textCodeBlock-background); max-height: 200px; overflow-y: auto; }
  .diff-add { color: #4caf50; }
  .diff-remove { color: #f44336; opacity: 0.8; }
  .diff-header { color: var(--vscode-editorInfo-foreground); }
  .bottom-bar { display: flex; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border); }
  .btn-primary { padding: 8px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-cancel { padding: 8px 20px; background: transparent; color: var(--vscode-editor-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 6px; cursor: pointer; font-size: 13px; }
</style>
</head><body>
  <h2>Change Preview</h2>
  <div class="summary">${this.escapeHtml(edit.description)} &mdash; ${edit.edits.length} file(s)</div>
  ${fileItems}
  <div class="bottom-bar">
    <button class="btn-primary" onclick="send('applyAll')">Apply Accepted Changes</button>
    <button class="btn-cancel" onclick="send('cancel')">Cancel All</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function send(type, data) { vscode.postMessage({ type, ...data }); }
    function accept(i) { send('accept', { index: i }); document.getElementById('card-'+i).style.borderColor = '#4caf50'; }
    function reject(i) { send('reject', { index: i }); document.getElementById('card-'+i).style.borderColor = '#f44336'; document.getElementById('card-'+i).style.opacity = '0.5'; }
    function viewDiff(i) { send('viewDiff', { index: i }); }
  </script>
</body></html>`;
  }

  private renderFileItem(edit: SingleFileEdit, index: number): string {
    const typeClass = edit.type === 'create' ? 'create' : edit.type === 'delete' ? 'delete' : '';
    const typeLabel = edit.type.charAt(0).toUpperCase() + edit.type.slice(1);

    // Colorize diff
    const colorizedDiff = edit.diff.split('\n').map(line => {
      if (line.startsWith('+')) { return `<span class="diff-add">${this.escapeHtml(line)}</span>`; }
      if (line.startsWith('-')) { return `<span class="diff-remove">${this.escapeHtml(line)}</span>`; }
      if (line.startsWith('@')) { return `<span class="diff-header">${this.escapeHtml(line)}</span>`; }
      return this.escapeHtml(line);
    }).join('\n');

    return `
    <div class="file-card" id="card-${index}">
      <div class="file-header">
        <span class="file-name">${this.escapeHtml(edit.file)}</span>
        <span class="file-type ${typeClass}">${typeLabel}</span>
        <div class="file-actions">
          <button class="btn" onclick="viewDiff(${index})">View Diff</button>
          <button class="btn accept" onclick="accept(${index})">Accept</button>
          <button class="btn reject" onclick="reject(${index})">Reject</button>
        </div>
      </div>
      <div class="diff-block">${colorizedDiff || '(no diff available)'}</div>
    </div>`;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private dispose(): void {
    ChangePreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) { text += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return text;
}
