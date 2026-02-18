import * as vscode from 'vscode';
import { CodeMemory } from '../../features/memory/CodeMemory';

export class MemoryView {
  private panel: vscode.WebviewPanel | undefined;
  private codeMemory: CodeMemory;

  constructor(codeMemory: CodeMemory) {
    this.codeMemory = codeMemory;
  }

  public show() {
    if (this.panel) {
      this.panel.reveal();
      this.updateContent();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'memoryView',
      'Code Memory System',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'learnFile':
          await this.learnCurrentFile();
          break;
        case 'search':
          await this.searchMemory(message.query);
          break;
        case 'clear':
          await this.clearMemory();
          break;
      }
    });

    this.updateContent();
  }

  private async updateContent() {
    if (!this.panel) return;

    this.panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; background: #1e1e1e; color: #fff; }
        h1 { color: #007acc; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
        .stat-card { background: #2d2d2d; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2em; color: #4ec9b0; }
        .stat-label { color: #9cdcfe; }
        button { background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; }
        button:hover { background: #005a9e; }
        input { padding: 8px; width: 100%; margin: 10px 0; background: #3c3c3c; border: 1px solid #555; color: white; }
        .memory-item { background: #2d2d2d; padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #007acc; }
        .timestamp { color: #888; font-size: 0.8em; }
        pre { background: #1e1e1e; padding: 10px; border-radius: 4px; overflow: auto; color: #d4d4d4; }
    </style>
</head>
<body>
    <h1>🧠 Code Memory System</h1>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${this.codeMemory['vectorStore']['entries'].size}</div>
            <div class="stat-label">Memory Entries</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${Array.from(this.codeMemory['vectorStore']['entries'].values()).filter((e) => e.metadata.type === 'code').length}</div>
            <div class="stat-label">Code Patterns</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${Array.from(this.codeMemory['vectorStore']['entries'].values()).filter((e) => e.metadata.type === 'fix').length}</div>
            <div class="stat-label">Bug Fixes</div>
        </div>
    </div>
    
    <div>
        <button onclick="learnFile()">📖 Learn Current File</button>
        <button onclick="learnWorkspace()">📚 Learn Entire Workspace</button>
        <button onclick="clearMemory()">🗑️ Clear Memory</button>
    </div>
    
    <div>
        <input type="text" id="searchInput" placeholder="Search memory..." onkeyup="search(this.value)">
    </div>
    
    <div id="results"></div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function learnFile() {
            vscode.postMessage({ command: 'learnFile' });
        }
        
        function learnWorkspace() {
            vscode.postMessage({ command: 'learnWorkspace' });
        }
        
        function clearMemory() {
            if (confirm('Clear all memory entries?')) {
                vscode.postMessage({ command: 'clear' });
            }
        }
        
        function search(query) {
            if (query.length > 2) {
                vscode.postMessage({ command: 'search', query });
            }
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateResults':
                    displayResults(message.results);
                    break;
            }
        });
        
        function displayResults(results) {
            const div = document.getElementById('results');
            if (!results || results.length === 0) {
                div.innerHTML = '<p>No results found</p>';
                return;
            }
            
            div.innerHTML = results.map(r => \`
                <div class="memory-item">
                    <div><strong>\${r.type}</strong> <span class="timestamp">\${new Date(r.timestamp).toLocaleString()}</span></div>
                    <pre>\${r.text.substring(0, 200)}\${r.text.length > 200 ? '...' : ''}</pre>
                </div>
            \`).join('');
        }
    </script>
</body>
</html>
        `;
  }

  private async learnCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No file open');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    await this.codeMemory.learnFromFile(filePath);
    vscode.window.showInformationMessage(`Learned from ${filePath}`);
    this.updateContent();
  }

  private async searchMemory(query: string) {
    const embedding =
      await this.codeMemory['embeddingGenerator'].generateEmbedding(query);
    const results = this.codeMemory['vectorStore'].findSimilar(
      embedding,
      0.6,
      10,
    );

    this.panel?.webview.postMessage({
      command: 'updateResults',
      results: results.map((r) => ({
        type: r.metadata.type,
        text: r.text,
        timestamp: r.metadata.timestamp,
      })),
    });
  }

  private async clearMemory() {
    this.codeMemory['vectorStore'].clear();
    vscode.window.showInformationMessage('Memory cleared');
    this.updateContent();
  }
}
