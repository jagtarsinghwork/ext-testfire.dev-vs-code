import * as vscode from 'vscode';

/**
 * Virtual document provider for showing diff previews of AI-proposed changes.
 */
export class DiffPreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private contents = new Map<string, string>();

  setContent(uri: string, content: string): void {
    this.contents.set(uri, content);
    this._onDidChange.fire(vscode.Uri.parse(uri));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    // Content can come from query param or stored content
    const params = new URLSearchParams(uri.query);
    const fromQuery = params.get('content');
    if (fromQuery) {
      return decodeURIComponent(fromQuery);
    }
    return this.contents.get(uri.toString()) || '';
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.contents.clear();
  }
}
