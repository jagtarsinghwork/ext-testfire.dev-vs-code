import * as vscode from 'vscode';
import {
  ChatMessage,
  ChatSession,
  AIAction,
  WebviewMessage,
  ExtensionMessage,
  AIStreamCallback,
  AIProvider,
} from '../types';
import { ContextManager } from '../core/contextManager';
import { FileOperations } from '../core/fileOperations';
import { AgentExecutor } from '../core/agentExecutor';
import { ProjectIndexer } from '../core/projectIndexer';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private panel: vscode.WebviewPanel;
  private session: ChatSession;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private provider: AIProvider,
    private contextManager: ContextManager,
    private fileOps: FileOperations,
    private agentExecutor: AgentExecutor,
    private indexer: ProjectIndexer,
  ) {
    this.panel = panel;
    this.session = this.createSession();
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    provider: AIProvider,
    contextManager: ContextManager,
    fileOps: FileOperations,
    agentExecutor: AgentExecutor,
    indexer: ProjectIndexer,
  ): ChatPanel {
    const column = vscode.ViewColumn.Beside;
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      return ChatPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      'testfireChat',
      'TestFire AI',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    ChatPanel.currentPanel = new ChatPanel(
      panel,
      extensionUri,
      provider,
      contextManager,
      fileOps,
      agentExecutor,
      indexer,
    );
    return ChatPanel.currentPanel;
  }

  updateProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  private createSession(): ChatSession {
    return {
      id: `session_${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private postMessage(msg: ExtensionMessage): void {
    this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postMessage({
          type: 'chatHistory',
          messages: this.session.messages,
        });
        this.checkProviderStatus();
        break;
      case 'sendMessage':
        await this.handleUserMessage(msg.content, msg.contextFiles);
        break;
      case 'cancelRequest':
        this.provider.abort();
        break;
      case 'applyAction':
        await this.handleApplyAction(msg.messageId, msg.actionIndex);
        break;
      case 'applyAllActions':
        await this.handleApplyAllActions(msg.messageId);
        break;
      case 'undoAction':
        await this.handleUndo(msg.operationId);
        break;
      case 'newSession':
        this.session = this.createSession();
        this.postMessage({ type: 'chatHistory', messages: [] });
        break;
      case 'getFileTree':
        const tree = this.indexer.getFileTree();
        if (tree) {
          this.postMessage({ type: 'fileTree', tree });
        }
        break;
      case 'addContextFile':
        this.contextManager.addContextFile(msg.filePath);
        this.postMessage({
          type: 'contextUpdate',
          files: this.contextManager.getContextFiles(),
        });
        break;
      case 'removeContextFile':
        this.contextManager.removeContextFile(msg.filePath);
        this.postMessage({
          type: 'contextUpdate',
          files: this.contextManager.getContextFiles(),
        });
        break;
      case 'executeAgent':
        await this.handleAgentExecution(msg.goal);
        break;
      case 'cancelAgent':
        this.agentExecutor.cancel();
        break;
      case 'acceptPlan':
        await this.handleAcceptPlan(msg.planId);
        break;
      case 'rejectPlan':
        break;
      case 'listModels':
        await this.handleListModels();
        break;
      case 'selectModel':
        await this.handleSelectModel(msg.model);
        break;
      case 'applyCodeBlock':
        await this.handleApplyCodeBlock(msg.filePath, msg.code);
        break;
    }
  }

  private async checkProviderStatus(): Promise<void> {
    const available = await this.provider.isAvailable();
    this.postMessage({
      type: 'providerStatus',
      available,
      provider: this.provider.name,
      model: this.provider.config.model,
    });
  }

  private async handleUserMessage(
    content: string,
    contextFiles?: string[],
  ): Promise<void> {
    if (contextFiles) {
      for (const f of contextFiles) {
        this.contextManager.addContextFile(f);
      }
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      contextFiles: this.contextManager.getContextFiles(),
    };
    this.session.messages.push(userMsg);

    const assistantMsg: ChatMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    this.session.messages.push(assistantMsg);

    const sendError = (err: Error) => {
      assistantMsg.isStreaming = false;
      this.postMessage({
        type: 'streamError',
        messageId: assistantMsg.id,
        error: err.message,
      });
    };

    try {
      const selectedCode = this.contextManager.getSelectedCode();
      const messages = await this.contextManager.buildMessages(
        content,
        selectedCode,
      );

      for (const msg of this.session.messages.slice(0, -2)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      const callback: AIStreamCallback = {
        onToken: (token) => {
          assistantMsg.content += token;
          this.postMessage({
            type: 'streamToken',
            messageId: assistantMsg.id,
            token,
          });
        },
        onComplete: (fullResponse) => {
          assistantMsg.content = fullResponse;
          assistantMsg.isStreaming = false;
          const actions = this.parseActionsFromResponse(fullResponse);
          if (actions.length > 0) {
            assistantMsg.actions = actions;
          }
          this.postMessage({
            type: 'streamComplete',
            messageId: assistantMsg.id,
            content: fullResponse,
            actions: actions.length > 0 ? actions : undefined,
          });
        },
        onError: sendError,
      };

      await this.provider.chat(messages, callback);
    } catch (error: any) {
      sendError(error);
    }
    this.session.updatedAt = Date.now();
  }

  private parseActionsFromResponse(response: string): AIAction[] {
    const actions: AIAction[] = [];
    const codeBlockRegex =
      /```(\w+)?\s*\n\/\/\s*filepath:\s*(.+?)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const filePath = match[2].trim();
      const content = match[3].trim();
      actions.push({
        type: 'edit',
        files: [
          {
            file: filePath,
            originalContent: '',
            newContent: content,
            type: 'edit',
          },
        ],
        description: `Update ${filePath}`,
      });
    }
    return actions;
  }

  private async handleApplyAction(
    messageId: string,
    actionIndex: number,
  ): Promise<void> {
    const msg = this.session.messages.find((m) => m.id === messageId);
    if (!msg?.actions?.[actionIndex]) {
      return;
    }
    const action = msg.actions[actionIndex];
    try {
      const entry = await this.fileOps.applyChanges(
        action.files,
        action.description,
      );
      this.postMessage({
        type: 'actionApplied',
        operationId: entry.id,
        success: true,
      });
      vscode.window.showInformationMessage(`Applied: ${action.description}`);
    } catch (error: any) {
      this.postMessage({
        type: 'actionApplied',
        operationId: '',
        success: false,
        error: error.message,
      });
      vscode.window.showErrorMessage(`Failed: ${error.message}`);
    }
  }

  private async handleApplyAllActions(messageId: string): Promise<void> {
    const msg = this.session.messages.find((m) => m.id === messageId);
    if (!msg?.actions) {
      return;
    }
    for (let i = 0; i < msg.actions.length; i++) {
      await this.handleApplyAction(messageId, i);
    }
  }

  private async handleUndo(operationId: string): Promise<void> {
    const success = await this.fileOps.undoOperation(operationId);
    if (success) {
      vscode.window.showInformationMessage('Changes undone');
    } else {
      vscode.window.showErrorMessage('Undo failed');
    }
  }

  private async handleAgentExecution(goal: string): Promise<void> {
    const plan = await this.agentExecutor.createPlan(goal, (p) => {
      this.postMessage({ type: 'agentPlan', plan: p });
    });
    const planMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `**Agent Plan for:** ${goal}\n\n${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}`,
      timestamp: Date.now(),
      plan,
    };
    this.session.messages.push(planMsg);
    this.postMessage({ type: 'agentPlan', plan });
  }

  private async handleAcceptPlan(planId: string): Promise<void> {
    const planMsg = this.session.messages.find((m) => m.plan?.id === planId);
    if (!planMsg?.plan) {
      return;
    }
    const summary = await this.agentExecutor.executePlan(
      planMsg.plan,
      (pId, stepId, status, result) => {
        this.postMessage({
          type: 'agentStepUpdate',
          planId: pId,
          stepId,
          status,
          result,
        });
      },
    );
    this.postMessage({ type: 'agentComplete', planId, summary });
  }

  private async handleListModels(): Promise<void> {
    try {
      const models = await this.provider.listModels();
      this.postMessage({ type: 'modelList', models });
    } catch {
      this.postMessage({ type: 'modelList', models: [] });
    }
  }

  private async handleSelectModel(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('testfire');
    await config.update('model', model, vscode.ConfigurationTarget.Workspace);
    this.postMessage({ type: 'modelChanged', model });
  }

  private async handleApplyCodeBlock(
    filePath: string,
    code: string,
  ): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace open');
      }

      const fullPath = filePath.startsWith('/')
        ? filePath
        : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath).fsPath;
      const uri = vscode.Uri.file(fullPath);

      // Check if file exists
      let exists = false;
      try {
        await vscode.workspace.fs.stat(uri);
        exists = true;
      } catch {
        /* file doesn't exist */
      }

      if (exists) {
        // Open existing file and show diff before applying
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(
          doc,
          vscode.ViewColumn.One,
        );
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, code);
        });
      } else {
        // Create new file
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(code));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }

      this.postMessage({ type: 'codeApplied', filePath, success: true });
      vscode.window.showInformationMessage(`Applied changes to ${filePath}`);
    } catch (error: any) {
      this.postMessage({
        type: 'codeApplied',
        filePath,
        success: false,
        error: error.message,
      });
      vscode.window.showErrorMessage(`Failed to apply: ${error.message}`);
    }
  }

  // ─── Webview HTML ──────────────────────────────────────────────────────────

  private getHtmlContent(): string {
    const nonce = getNonce();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>TestFire AI</title>
<style>
/* ══════════════════════════════════════════════════════════════════
   DESIGN SYSTEM - VS Code native theme tokens
   ══════════════════════════════════════════════════════════════════ */
:root {
  --bg-primary:    var(--vscode-editor-background);
  --bg-secondary:  var(--vscode-sideBar-background, var(--vscode-editor-background));
  --bg-elevated:   var(--vscode-editorWidget-background, #252526);
  --bg-input:      var(--vscode-input-background);
  --bg-hover:      var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
  --bg-active:     var(--vscode-list-activeSelectionBackground, #094771);
  --bg-code:       var(--vscode-textCodeBlock-background, rgba(0,0,0,0.25));
  --bg-badge:      var(--vscode-badge-background);

  --fg-primary:    var(--vscode-editor-foreground);
  --fg-secondary:  var(--vscode-descriptionForeground, rgba(204,204,204,0.7));
  --fg-muted:      var(--vscode-disabledForeground, rgba(204,204,204,0.4));
  --fg-input:      var(--vscode-input-foreground);
  --fg-badge:      var(--vscode-badge-foreground);
  --fg-link:       var(--vscode-textLink-foreground, #3794ff);

  --border:        var(--vscode-panel-border, rgba(128,128,128,0.2));
  --border-input:  var(--vscode-input-border, rgba(128,128,128,0.3));
  --border-focus:  var(--vscode-focusBorder, #007acc);

  --btn-bg:        var(--vscode-button-background);
  --btn-fg:        var(--vscode-button-foreground);
  --btn-hover:     var(--vscode-button-hoverBackground);
  --btn-sec-bg:    var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
  --btn-sec-fg:    var(--vscode-button-secondaryForeground, var(--fg-primary));
  --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15));

  --success:       var(--vscode-testing-iconPassed, #4caf50);
  --error:         var(--vscode-errorForeground, #f44336);
  --warning:       var(--vscode-editorWarning-foreground, #ff9800);
  --info:          var(--vscode-editorInfo-foreground, #3794ff);

  --font-family:   var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  --font-mono:     var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', 'Cascadia Code', monospace);
  --font-size:     var(--vscode-font-size, 13px);
  --font-size-sm:  11px;
  --font-size-xs:  10px;

  --radius-sm:     4px;
  --radius-md:     8px;
  --radius-lg:     12px;

  --shadow:        0 2px 8px rgba(0,0,0,0.15);
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-family);
  font-size: var(--font-size);
  color: var(--fg-primary);
  background: var(--bg-primary);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ══════════════════════════════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════════════════════════════ */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
  min-height: 44px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}
.header-logo {
  width: 24px; height: 24px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
  font-weight: 700;
}
.header-title {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.2px;
}
.header-model {
  font-size: var(--font-size-sm);
  color: var(--fg-muted);
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-hover);
  cursor: pointer;
  position: relative;
}
.header-model:hover { background: var(--bg-active); color: var(--fg-primary); }
.model-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  min-width: 200px;
  max-height: 260px;
  overflow-y: auto;
  z-index: 50;
  padding: 4px;
}
.model-dropdown-item {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--fg-secondary);
  white-space: nowrap;
}
.model-dropdown-item:hover { background: var(--bg-hover); color: var(--fg-primary); }
.model-dropdown-item.active { color: var(--success); font-weight: 600; }
.header-actions { display: flex; gap: 2px; }
.icon-btn {
  background: none;
  border: none;
  color: var(--fg-secondary);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.icon-btn:hover { background: var(--bg-hover); color: var(--fg-primary); }

/* ══════════════════════════════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════════════════════════════ */
.status-bar {
  padding: 6px 16px;
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online  { background: var(--success); box-shadow: 0 0 4px var(--success); }
.status-dot.offline { background: var(--error); }

/* ══════════════════════════════════════════════════════════════════
   CONTEXT CHIPS
   ══════════════════════════════════════════════════════════════════ */
.context-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
.context-bar:empty { display: none; padding: 0; border: none; }
.context-bar-label {
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 4px;
}
.context-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--bg-badge);
  color: var(--fg-badge);
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  line-height: 1;
}
.context-chip .chip-icon { font-size: 10px; opacity: 0.6; }
.chip-remove {
  cursor: pointer;
  opacity: 0.5;
  font-size: 10px;
  padding: 0 2px;
  transition: opacity 0.15s;
}
.chip-remove:hover { opacity: 1; }

/* ══════════════════════════════════════════════════════════════════
   MESSAGES AREA
   ══════════════════════════════════════════════════════════════════ */
.messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scroll-behavior: smooth;
}

.message {
  border-radius: var(--radius-md);
  padding: 12px 16px;
  max-width: 100%;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.message.user {
  background: var(--bg-hover);
  border-left: 3px solid var(--border-focus);
  margin-top: 8px;
}
.message.assistant {
  background: transparent;
  padding-left: 16px;
}
.message.system-msg {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

/* Message header */
.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.msg-avatar {
  width: 22px; height: 22px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.msg-avatar.user-avatar   { background: var(--border-focus); color: white; }
.msg-avatar.ai-avatar     { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
.msg-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fg-secondary);
}
.msg-time {
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
  margin-left: auto;
}

/* Message content (rendered markdown) */
.msg-body {
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.msg-body p { margin-bottom: 8px; }
.msg-body p:last-child { margin-bottom: 0; }
.msg-body strong { font-weight: 600; }
.msg-body em { font-style: italic; }
.msg-body a { color: var(--fg-link); text-decoration: none; }
.msg-body a:hover { text-decoration: underline; }
.msg-body ul, .msg-body ol {
  margin: 6px 0;
  padding-left: 20px;
}
.msg-body li { margin: 2px 0; }
.msg-body h1, .msg-body h2, .msg-body h3 {
  margin: 12px 0 6px 0;
  font-weight: 600;
}
.msg-body h1 { font-size: 16px; }
.msg-body h2 { font-size: 14px; }
.msg-body h3 { font-size: 13px; }
.msg-body hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}
.msg-body blockquote {
  border-left: 3px solid var(--border);
  padding: 4px 12px;
  margin: 8px 0;
  color: var(--fg-secondary);
}

/* Inline code */
.msg-body code {
  background: var(--bg-code);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
}

/* Code blocks */
.code-block-wrapper {
  position: relative;
  margin: 10px 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
}
.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
}
.code-block-lang {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.code-block-filepath {
  font-family: var(--font-mono);
  color: var(--fg-link);
  font-size: var(--font-size-sm);
}
.code-copy-btn {
  background: none;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: var(--font-size-xs);
  transition: all 0.15s;
}
.code-copy-btn:hover { background: var(--bg-hover); color: var(--fg-primary); }
.code-apply-btn {
  background: none;
  border: none;
  color: var(--success);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  transition: all 0.15s;
}
.code-apply-btn:hover { background: var(--success); color: white; }
.code-block-wrapper pre {
  margin: 0;
  padding: 12px 16px;
  background: var(--bg-code);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  tab-size: 2;
}
.code-block-wrapper pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

/* Diff styles inside code blocks */
.diff-add { color: var(--success); }
.diff-remove { color: var(--error); opacity: 0.7; }
.diff-header { color: var(--info); }

/* ══════════════════════════════════════════════════════════════════
   ACTION BUTTONS (Apply / Undo)
   ══════════════════════════════════════════════════════════════════ */
.actions-bar {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-btn {
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--btn-sec-bg);
  color: var(--btn-sec-fg);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.action-btn:hover { background: var(--btn-sec-hover); }
.action-btn.primary {
  background: var(--btn-bg);
  color: var(--btn-fg);
  border-color: var(--btn-bg);
}
.action-btn.primary:hover { background: var(--btn-hover); }
.action-btn.success {
  background: var(--success);
  color: white;
  border-color: var(--success);
}
.action-btn.danger {
  border-color: var(--error);
  color: var(--error);
}
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.action-btn .btn-icon { font-size: 12px; }

/* ══════════════════════════════════════════════════════════════════
   AGENT PLAN
   ══════════════════════════════════════════════════════════════════ */
.agent-plan {
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-md);
  padding: 14px;
  margin-top: 8px;
  background: var(--bg-elevated);
}
.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 13px;
}
.plan-header-icon {
  width: 22px; height: 22px;
  border-radius: var(--radius-sm);
  background: var(--border-focus);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.plan-steps { list-style: none; }
.plan-step {
  padding: 8px 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  border-bottom: 1px solid rgba(128,128,128,0.1);
}
.plan-step:last-child { border-bottom: none; }
.step-indicator {
  width: 20px; height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 1px;
  transition: all 0.3s ease;
}
.step-indicator.pending  { border: 2px solid var(--border); color: var(--fg-muted); }
.step-indicator.running  { border: 2px solid var(--border-focus); color: var(--border-focus); animation: spin 1.5s linear infinite; }
.step-indicator.completed { background: var(--success); color: white; border: none; }
.step-indicator.failed   { background: var(--error); color: white; border: none; }
.step-indicator.skipped  { background: var(--fg-muted); color: white; border: none; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.step-text { flex: 1; line-height: 1.4; }
.step-result {
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
  margin-top: 2px;
}
.plan-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}

/* ══════════════════════════════════════════════════════════════════
   TYPING INDICATOR
   ══════════════════════════════════════════════════════════════════ */
.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}
.typing-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--fg-muted);
  animation: typingBounce 1.4s ease-in-out infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-4px); opacity: 1; }
}

/* ══════════════════════════════════════════════════════════════════
   FILE PICKER OVERLAY
   ══════════════════════════════════════════════════════════════════ */
.file-picker {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 60px;
}
.file-picker-dialog {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 500px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  animation: fadeIn 0.15s ease;
}
.file-picker-search {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.file-picker-search input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-input);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--fg-input);
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
}
.file-picker-search input:focus { border-color: var(--border-focus); }
.file-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.file-picker-item {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-secondary);
  transition: all 0.1s;
}
.file-picker-item:hover { background: var(--bg-hover); color: var(--fg-primary); }
.file-picker-item.selected { color: var(--success); }
.file-picker-item .fp-icon { font-size: 14px; width: 18px; text-align: center; }

/* ══════════════════════════════════════════════════════════════════
   INPUT AREA
   ══════════════════════════════════════════════════════════════════ */
.input-area {
  border-top: 1px solid var(--border);
  padding: 12px 16px;
  background: var(--bg-secondary);
  flex-shrink: 0;
}
.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  width: fit-content;
}
.mode-tab {
  padding: 4px 16px;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  transition: all 0.15s;
}
.mode-tab:not(:last-child) { border-right: 1px solid var(--border); }
.mode-tab.active {
  background: var(--btn-bg);
  color: var(--btn-fg);
}
.mode-tab:not(.active):hover { background: var(--bg-hover); }

.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.input-wrapper {
  flex: 1;
  position: relative;
}
.input-wrapper textarea {
  width: 100%;
  min-height: 42px;
  max-height: 160px;
  padding: 10px 14px;
  border: 1px solid var(--border-input);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--fg-input);
  font-family: var(--font-family);
  font-size: 13px;
  resize: none;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}
.input-wrapper textarea:focus { border-color: var(--border-focus); }
.input-wrapper textarea::placeholder { color: var(--fg-muted); }

.send-btn {
  padding: 10px 20px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-family);
  white-space: nowrap;
  transition: all 0.15s;
  min-width: 70px;
}
.send-btn:hover { background: var(--btn-hover); }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.send-btn.cancel { background: var(--error); }

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.5); }

/* ── Welcome ── */
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
  padding: 40px 20px;
  text-align: center;
}
.welcome-logo {
  width: 48px; height: 48px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  font-weight: 700;
}
.welcome h2 {
  font-size: 16px;
  font-weight: 600;
}
.welcome p {
  color: var(--fg-secondary);
  font-size: 13px;
  max-width: 360px;
  line-height: 1.5;
}
.welcome-shortcuts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
  max-width: 400px;
}
.shortcut-card {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}
.shortcut-card:hover { border-color: var(--border-focus); background: var(--bg-hover); }
.shortcut-card-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
}
.shortcut-card-desc {
  font-size: var(--font-size-xs);
  color: var(--fg-muted);
}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-left">
    <div class="header-logo">T</div>
    <span class="header-title">TestFire AI</span>
    <span class="header-model" id="modelBadge" title="Click to change model">--</span>
    <div class="model-dropdown" id="modelDropdown" style="display:none"></div>
  </div>
  <div class="header-actions">
    <button class="icon-btn" id="btnAddFiles" title="Add context files">+ Files</button>
    <button class="icon-btn" id="btnNewSession" title="New chat session">New Chat</button>
  </div>
</div>

<!-- STATUS -->
<div class="status-bar">
  <span class="status-dot" id="statusDot"></span>
  <span id="statusText">Connecting...</span>
</div>

<!-- CONTEXT CHIPS -->
<div class="context-bar" id="contextBar"></div>

<!-- MESSAGES -->
<div class="messages" id="messages">
  <div class="welcome" id="welcome">
    <div class="welcome-logo">T</div>
    <h2>TestFire AI Assistant</h2>
    <p>Your intelligent coding companion. Ask questions, get code suggestions, or let the agent handle complex tasks autonomously.</p>
    <div class="welcome-shortcuts">
      <div class="shortcut-card" data-action="Explain the selected code in detail">
        <div class="shortcut-card-title">Explain Code</div>
        <div class="shortcut-card-desc">Select code, then click</div>
      </div>
      <div class="shortcut-card" data-action="Find bugs and potential issues in this code">
        <div class="shortcut-card-title">Find Bugs</div>
        <div class="shortcut-card-desc">Detect issues & edge cases</div>
      </div>
      <div class="shortcut-card" data-action="Refactor this code for better readability">
        <div class="shortcut-card-title">Refactor</div>
        <div class="shortcut-card-desc">Improve code quality</div>
      </div>
      <div class="shortcut-card" data-action="Write unit tests for this code">
        <div class="shortcut-card-title">Add Tests</div>
        <div class="shortcut-card-desc">Generate test cases</div>
      </div>
    </div>
  </div>
</div>

<!-- INPUT -->
<div class="input-area">
  <div class="mode-tabs">
    <button class="mode-tab active" id="tabChat">Chat</button>
    <button class="mode-tab" id="tabAgent">Agent</button>
  </div>
  <div class="input-row">
    <div class="input-wrapper">
      <textarea id="userInput" placeholder="Ask anything about your code..." rows="1"></textarea>
    </div>
    <button class="send-btn" id="sendBtn">Send</button>
  </div>
  <div class="input-footer">
    <span>Enter to send &middot; Shift+Enter for newline</span>
    <span id="modeLabel">Chat mode</span>
  </div>
</div>

<!-- FILE PICKER OVERLAY (hidden by default) -->
<div class="file-picker" id="filePicker" style="display:none">
  <div class="file-picker-dialog" id="filePickerDialog">
    <div class="file-picker-search">
      <input type="text" id="fileSearchInput" placeholder="Search files...">
    </div>
    <div class="file-picker-list" id="filePickerList"></div>
  </div>
</div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();

  // ─── State ───
  let mode = 'chat';
  let streaming = false;
  let streamMsgId = null;
  let ctxFiles = [];
  let allFiles = [];

  // ─── DOM refs ───
  const $messages = document.getElementById('messages');
  const $welcome = document.getElementById('welcome');
  const $input = document.getElementById('userInput');
  const $sendBtn = document.getElementById('sendBtn');
  const $contextBar = document.getElementById('contextBar');
  const $filePicker = document.getElementById('filePicker');
  const $fileList = document.getElementById('filePickerList');
  const $fileSearch = document.getElementById('fileSearchInput');
  const $statusDot = document.getElementById('statusDot');
  const $statusText = document.getElementById('statusText');
  const $modelBadge = document.getElementById('modelBadge');

  var $modelDropdown = document.getElementById('modelDropdown');
  var currentModel = '';
  var modelDropdownOpen = false;

  // ─── Init ───
  vscodeApi.postMessage({ type: 'ready' });

  // ─── Button event listeners (CSP forbids inline onclick) ───
  document.getElementById('btnAddFiles').addEventListener('click', function() { handleAddFiles(); });
  document.getElementById('btnNewSession').addEventListener('click', function() { handleNewSession(); });
  document.getElementById('tabChat').addEventListener('click', function() { setMode('chat'); });
  document.getElementById('tabAgent').addEventListener('click', function() { setMode('agent'); });
  $sendBtn.addEventListener('click', function() { handleSend(); });
  $filePicker.addEventListener('click', function(e) { if (e.target === $filePicker) $filePicker.style.display = 'none'; });
  document.getElementById('filePickerDialog').addEventListener('click', function(e) { e.stopPropagation(); });
  $fileSearch.addEventListener('input', function() { filterFiles(this.value); });
  document.querySelectorAll('.shortcut-card[data-action]').forEach(function(card) {
    card.addEventListener('click', function() { quickAction(this.dataset.action); });
  });

  // Model selector
  $modelBadge.addEventListener('click', function(e) {
    e.stopPropagation();
    if (modelDropdownOpen) {
      $modelDropdown.style.display = 'none';
      modelDropdownOpen = false;
    } else {
      vscodeApi.postMessage({ type: 'listModels' });
      modelDropdownOpen = true;
    }
  });
  document.addEventListener('click', function() {
    if (modelDropdownOpen) {
      $modelDropdown.style.display = 'none';
      modelDropdownOpen = false;
    }
  });
  $modelDropdown.addEventListener('click', function(e) { e.stopPropagation(); });

  // Delegate clicks for dynamically created buttons
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.code-copy-btn');
    if (btn) { copyCode(btn); return; }
    var applyBtn = e.target.closest('.code-apply-btn');
    if (applyBtn) { applyCodeBlock(applyBtn); return; }
    var acceptBtn = e.target.closest('[data-accept-plan]');
    if (acceptBtn) { acceptPlan(acceptBtn.dataset.acceptPlan); return; }
    var rejectBtn = e.target.closest('[data-reject-plan]');
    if (rejectBtn) { rejectPlan(rejectBtn.dataset.rejectPlan); return; }
  });

  // ─── Input handling ───
  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  $input.addEventListener('input', () => {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 160) + 'px';
  });

  function handleSend() {
    const text = $input.value.trim();
    if (!text || streaming) return;

    // Hide welcome
    if ($welcome) $welcome.style.display = 'none';

    if (mode === 'agent') {
      vscodeApi.postMessage({ type: 'executeAgent', goal: text });
    } else {
      vscodeApi.postMessage({ type: 'sendMessage', content: text, contextFiles: ctxFiles });
    }

    appendMessage('user', text);
    $input.value = '';
    $input.style.height = 'auto';
    setStreaming(true);
  }

  function handleCancel() {
    vscodeApi.postMessage({ type: 'cancelRequest' });
    setStreaming(false);
  }

  function setStreaming(on) {
    streaming = on;
    $sendBtn.disabled = false;
    if (on) {
      $sendBtn.textContent = 'Stop';
      $sendBtn.className = 'send-btn cancel';
      $sendBtn.onclick = handleCancel;
    } else {
      $sendBtn.textContent = 'Send';
      $sendBtn.className = 'send-btn';
      $sendBtn.onclick = handleSend;
    }
  }

  function setMode(m) {
    mode = m;
    document.getElementById('tabChat').classList.toggle('active', m === 'chat');
    document.getElementById('tabAgent').classList.toggle('active', m === 'agent');
    document.getElementById('modeLabel').textContent = m === 'chat' ? 'Chat mode' : 'Agent mode';
    $input.placeholder = m === 'chat'
      ? 'Ask anything about your code...'
      : 'Describe a task for the agent...';
    $input.focus();
  }

  function handleNewSession() {
    vscodeApi.postMessage({ type: 'newSession' });
    $messages.innerHTML = '';
    if ($welcome) { $messages.appendChild($welcome); $welcome.style.display = ''; }
  }

  function quickAction(text) {
    $input.value = text;
    $input.focus();
  }

  // ─── Context files ───
  function handleAddFiles() {
    vscodeApi.postMessage({ type: 'getFileTree' });
  }

  function renderContextBar() {
    $contextBar.innerHTML = '';
    if (ctxFiles.length === 0) return;
    const label = document.createElement('span');
    label.className = 'context-bar-label';
    label.textContent = 'Context:';
    $contextBar.appendChild(label);

    ctxFiles.forEach(f => {
      const chip = document.createElement('span');
      chip.className = 'context-chip';
      const fname = f.split('/').pop();
      chip.innerHTML = '<span class="chip-icon">&#128196;</span>' + esc(fname)
        + '<span class="chip-remove" data-file="' + esc(f) + '">&#10005;</span>';
      chip.querySelector('.chip-remove').onclick = function() {
        vscodeApi.postMessage({ type: 'removeContextFile', filePath: this.dataset.file });
      };
      $contextBar.appendChild(chip);
    });
  }

  // ─── File picker ───
  function showFilePicker(tree) {
    allFiles = [];
    flattenTree(tree, '');
    renderFileList(allFiles);
    $filePicker.style.display = 'flex';
    $fileSearch.value = '';
    $fileSearch.focus();
  }

  function flattenTree(node, prefix) {
    if (node.type === 'file') {
      allFiles.push(prefix + node.name);
    } else if (node.children) {
      const p = prefix ? prefix + node.name + '/' : '';
      node.children.forEach(c => flattenTree(c, p));
    }
  }

  function renderFileList(files) {
    $fileList.innerHTML = '';
    files.slice(0, 100).forEach(f => {
      const div = document.createElement('div');
      div.className = 'file-picker-item' + (ctxFiles.includes(f) ? ' selected' : '');
      div.innerHTML = '<span class="fp-icon">' + (ctxFiles.includes(f) ? '&#10003;' : '&#128196;') + '</span>' + esc(f);
      div.onclick = () => {
        if (ctxFiles.includes(f)) {
          vscodeApi.postMessage({ type: 'removeContextFile', filePath: f });
        } else {
          vscodeApi.postMessage({ type: 'addContextFile', filePath: f });
        }
        div.classList.toggle('selected');
        div.querySelector('.fp-icon').innerHTML = div.classList.contains('selected') ? '&#10003;' : '&#128196;';
      };
      $fileList.appendChild(div);
    });
    if (files.length > 100) {
      const more = document.createElement('div');
      more.style.cssText = 'padding:8px 12px;color:var(--fg-muted);font-size:11px;';
      more.textContent = '...and ' + (files.length - 100) + ' more files';
      $fileList.appendChild(more);
    }
  }

  function filterFiles(query) {
    const q = query.toLowerCase();
    const filtered = q ? allFiles.filter(f => f.toLowerCase().includes(q)) : allFiles;
    renderFileList(filtered);
  }

  // ─── Message rendering ───
  function appendMessage(role, content, id) {
    if ($welcome) $welcome.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'message ' + role;
    if (id) div.id = 'msg-' + id;

    const header = document.createElement('div');
    header.className = 'msg-header';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar ' + (role === 'user' ? 'user-avatar' : 'ai-avatar');
    avatar.textContent = role === 'user' ? 'U' : 'T';

    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = role === 'user' ? 'You' : 'TestFire AI';

    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    header.appendChild(avatar);
    header.appendChild(name);
    header.appendChild(time);

    const body = document.createElement('div');
    body.className = 'msg-body';
    if (content) body.innerHTML = renderMd(content);

    div.appendChild(header);
    div.appendChild(body);
    $messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function scrollToBottom() {
    $messages.scrollTop = $messages.scrollHeight;
  }

  // ─── Markdown renderer ───
  // NOTE: All regex patterns use new RegExp() because regex literals
  // with \\w, \\n, \\s etc. break inside template literals (the template
  // literal interprets the backslash escapes before JavaScript sees them).
  var RE_CODEBLOCK = new RegExp('\x60\x60\x60(\\\\w*)\\n([\\\\s\\\\S]*?)\x60\x60\x60', 'g');
  var RE_TRAILING_NL = new RegExp('\\n$');
  var RE_FILEPATH = new RegExp('^\\\\/\\\\/\\\\s*filepath:\\\\s*(.+)\\n');
  var RE_FILEPATH_STRIP = new RegExp('^\\\\/\\\\/\\\\s*filepath:\\\\s*.+\\n');
  var RE_INLINE_CODE = new RegExp('\x60([^\x60]+)\x60', 'g');
  var RE_H3 = new RegExp('^### (.+)$', 'gm');
  var RE_H2 = new RegExp('^## (.+)$', 'gm');
  var RE_H1 = new RegExp('^# (.+)$', 'gm');
  var RE_BOLD = new RegExp('\\\\*\\\\*(.+?)\\\\*\\\\*', 'g');
  var RE_ITALIC = new RegExp('\\\\*(.+?)\\\\*', 'g');
  var RE_BLOCKQUOTE = new RegExp('^&gt; (.+)$', 'gm');
  var RE_HR = new RegExp('^---$', 'gm');
  var RE_UL_ITEM = new RegExp('^- (.+)$', 'gm');
  var RE_UL_WRAP = new RegExp('(<li>.*</li>\\n?)+', 'g');
  var RE_OL_ITEM = new RegExp('^\\\\d+\\\\. (.+)$', 'gm');
  var RE_LINK = new RegExp('\\\\[(.+?)\\\\]\\\\((.+?)\\\\)', 'g');
  var RE_DOUBLE_NL = new RegExp('\\n\\n', 'g');
  var RE_SINGLE_NL = new RegExp('\\n', 'g');
  var RE_EMPTY_P = new RegExp('<p></p>', 'g');
  var RE_P_OPEN_BLOCK = new RegExp('<p><(h[1-3]|ul|ol|pre|div|blockquote|hr)', 'g');
  var RE_P_CLOSE_BLOCK = new RegExp('</(h[1-3]|ul|ol|pre|div|blockquote)></p>', 'g');
  var RE_P_HR = new RegExp('<p><hr></p>', 'g');

  function renderMd(text) {
    if (!text) return '';

    // Extract code blocks and replace with placeholders
    var codeBlocks = [];
    RE_CODEBLOCK.lastIndex = 0;
    var processed = text.replace(RE_CODEBLOCK, function(match, lang, code) {
      var idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code: code });
      return '%%CODEBLOCK_' + idx + '%%';
    });

    // Escape HTML in the non-code parts
    processed = esc(processed);

    // Restore code blocks with proper formatting
    codeBlocks.forEach(function(block, idx) {
      var placeholder = '%%CODEBLOCK_' + idx + '%%';
      var escapedCode = esc(block.code).replace(RE_TRAILING_NL, '');

      var header = '';
      var displayCode = escapedCode;
      var fpMatch = escapedCode.match(RE_FILEPATH);
      if (fpMatch) {
        header = '<span class="code-block-filepath">' + fpMatch[1].trim() + '</span>';
        displayCode = escapedCode.replace(RE_FILEPATH_STRIP, '');
      } else if (block.lang) {
        header = '<span class="code-block-lang">' + block.lang + '</span>';
      }

      // Syntax-highlight diff
      if (block.lang === 'diff') {
        displayCode = displayCode.split('\\n').map(function(line) {
          if (line.startsWith('+')) return '<span class="diff-add">' + line + '</span>';
          if (line.startsWith('-')) return '<span class="diff-remove">' + line + '</span>';
          if (line.startsWith('@')) return '<span class="diff-header">' + line + '</span>';
          return line;
        }).join('\\n');
      }

      var applyBtn = '';
      if (fpMatch) {
        applyBtn = '<button class="code-apply-btn" data-filepath="' + fpMatch[1].trim() + '">Apply</button>';
      }

      var blockHtml = '<div class="code-block-wrapper">'
        + '<div class="code-block-header">'
        + (header || '<span></span>')
        + '<span>' + applyBtn + '<button class="code-copy-btn">Copy</button></span>'
        + '</div>'
        + '<pre><code>' + displayCode + '</code></pre>'
        + '</div>';

      processed = processed.replace(placeholder, blockHtml);
    });

    // Inline code
    RE_INLINE_CODE.lastIndex = 0;
    processed = processed.replace(RE_INLINE_CODE, '<code>$1</code>');

    // Headers
    processed = processed.replace(RE_H3, '<h3>$1</h3>');
    processed = processed.replace(RE_H2, '<h2>$1</h2>');
    processed = processed.replace(RE_H1, '<h1>$1</h1>');

    // Bold & italic
    RE_BOLD.lastIndex = 0;
    processed = processed.replace(RE_BOLD, '<strong>$1</strong>');
    RE_ITALIC.lastIndex = 0;
    processed = processed.replace(RE_ITALIC, '<em>$1</em>');

    // Blockquotes
    processed = processed.replace(RE_BLOCKQUOTE, '<blockquote>$1</blockquote>');

    // Horizontal rule
    processed = processed.replace(RE_HR, '<hr>');

    // Unordered lists
    processed = processed.replace(RE_UL_ITEM, '<li>$1</li>');
    RE_UL_WRAP.lastIndex = 0;
    processed = processed.replace(RE_UL_WRAP, '<ul>$&</ul>');

    // Ordered lists
    processed = processed.replace(RE_OL_ITEM, '<li>$1</li>');

    // Links
    RE_LINK.lastIndex = 0;
    processed = processed.replace(RE_LINK, '<a href="$2">$1</a>');

    // Paragraphs (double newline)
    processed = processed.replace(RE_DOUBLE_NL, '</p><p>');
    processed = '<p>' + processed + '</p>';
    processed = processed.replace(RE_EMPTY_P, '');

    // Single newlines to <br>
    processed = processed.replace(RE_SINGLE_NL, '<br>');

    // Clean up
    processed = processed.replace(RE_P_OPEN_BLOCK, '<$1');
    processed = processed.replace(RE_P_CLOSE_BLOCK, '</$1>');
    processed = processed.replace(RE_P_HR, '<hr>');

    return processed;
  }

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function copyCode(btn) {
    const code = btn.closest('.code-block-wrapper').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  }

  function applyCodeBlock(btn) {
    var fp = btn.dataset.filepath;
    var code = btn.closest('.code-block-wrapper').querySelector('code').textContent;
    if (!fp) return;
    btn.textContent = 'Applying...';
    btn.disabled = true;
    vscodeApi.postMessage({ type: 'applyCodeBlock', filePath: fp, code: code });
  }

  function renderModelDropdown(models) {
    $modelDropdown.innerHTML = '';
    if (models.length === 0) {
      $modelDropdown.innerHTML = '<div style="padding:8px 12px;color:var(--fg-muted);font-size:11px;">No models found</div>';
      $modelDropdown.style.display = 'block';
      return;
    }
    models.forEach(function(m) {
      var item = document.createElement('div');
      item.className = 'model-dropdown-item' + (m === currentModel ? ' active' : '');
      item.textContent = m;
      item.addEventListener('click', function() {
        vscodeApi.postMessage({ type: 'selectModel', model: m });
        $modelDropdown.style.display = 'none';
        modelDropdownOpen = false;
      });
      $modelDropdown.appendChild(item);
    });
    $modelDropdown.style.display = 'block';
  }

  // ─── Action handlers ───
  function applyAction(msgId, idx) {
    vscodeApi.postMessage({ type: 'applyAction', messageId: msgId, actionIndex: idx });
  }
  function applyAll(msgId) {
    vscodeApi.postMessage({ type: 'applyAllActions', messageId: msgId });
  }
  function undoOp(opId) {
    vscodeApi.postMessage({ type: 'undoAction', operationId: opId });
  }
  function acceptPlan(id) {
    vscodeApi.postMessage({ type: 'acceptPlan', planId: id });
  }
  function rejectPlan(id) {
    vscodeApi.postMessage({ type: 'rejectPlan', planId: id });
    setStreaming(false);
  }

  // ─── Extension message handler ───
  window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
      case 'streamToken': {
        streamMsgId = msg.messageId;
        let el = document.getElementById('msg-' + msg.messageId);
        if (!el) {
          el = appendMessage('assistant', '', msg.messageId);
          // Add typing indicator
          const indicator = document.createElement('div');
          indicator.className = 'typing-indicator';
          indicator.id = 'typing-' + msg.messageId;
          indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
          el.appendChild(indicator);
        }
        const body = el.querySelector('.msg-body');
        body.textContent += msg.token;
        scrollToBottom();
        break;
      }

      case 'streamComplete': {
        setStreaming(false);
        const el = document.getElementById('msg-' + msg.messageId);
        if (!el) break;

        // Remove typing indicator
        const typing = document.getElementById('typing-' + msg.messageId);
        if (typing) typing.remove();

        // Render full markdown
        const body = el.querySelector('.msg-body');
        body.innerHTML = renderMd(msg.content);

        // Add action buttons
        if (msg.actions && msg.actions.length > 0) {
          const bar = document.createElement('div');
          bar.className = 'actions-bar';

          msg.actions.forEach((action, idx) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = '<span class="btn-icon">&#9998;</span> Apply: ' + esc(action.description);
            btn.onclick = () => applyAction(msg.messageId, idx);
            bar.appendChild(btn);
          });

          if (msg.actions.length > 1) {
            const allBtn = document.createElement('button');
            allBtn.className = 'action-btn primary';
            allBtn.innerHTML = '<span class="btn-icon">&#10003;</span> Apply All';
            allBtn.onclick = () => applyAll(msg.messageId);
            bar.appendChild(allBtn);
          }

          el.appendChild(bar);
        }
        scrollToBottom();
        break;
      }

      case 'streamError': {
        setStreaming(false);
        const el = document.getElementById('msg-' + msg.messageId);
        if (el) {
          const typing = document.getElementById('typing-' + msg.messageId);
          if (typing) typing.remove();
          const body = el.querySelector('.msg-body');
          body.innerHTML = '<p style="color:var(--error)">Error: ' + esc(msg.error) + '</p>'
            + '<p style="color:var(--fg-muted);font-size:11px">Make sure your AI provider is running and configured correctly.</p>';
        }
        break;
      }

      case 'chatHistory': {
        $messages.innerHTML = '';
        if (msg.messages.length === 0 && $welcome) {
          $messages.appendChild($welcome);
          $welcome.style.display = '';
        } else {
          msg.messages.forEach(m => appendMessage(m.role, m.content, m.id));
        }
        break;
      }

      case 'providerStatus': {
        $statusDot.className = 'status-dot ' + (msg.available ? 'online' : 'offline');
        currentModel = msg.model || '';
        $statusText.textContent = msg.available
          ? msg.provider + ' connected'
          : msg.provider + ' unavailable';
        $modelBadge.textContent = currentModel || msg.provider;
        break;
      }

      case 'modelList': {
        renderModelDropdown(msg.models);
        break;
      }

      case 'modelChanged': {
        currentModel = msg.model;
        $modelBadge.textContent = msg.model;
        appendMessage('system-msg', 'Model changed to **' + msg.model + '**');
        break;
      }

      case 'codeApplied': {
        var btns = document.querySelectorAll('.code-apply-btn[data-filepath="' + msg.filePath + '"]');
        btns.forEach(function(b) {
          if (msg.success) {
            b.textContent = 'Applied!';
            b.style.color = 'var(--success)';
          } else {
            b.textContent = 'Failed';
            b.style.color = 'var(--error)';
          }
          setTimeout(function() { b.textContent = 'Apply'; b.disabled = false; b.style.color = ''; }, 2000);
        });
        break;
      }

      case 'contextUpdate': {
        ctxFiles = msg.files;
        renderContextBar();
        break;
      }

      case 'fileTree': {
        showFilePicker(msg.tree);
        break;
      }

      case 'agentPlan': {
        renderPlan(msg.plan);
        break;
      }

      case 'agentStepUpdate': {
        updateStep(msg.planId, msg.stepId, msg.status, msg.result);
        break;
      }

      case 'agentComplete': {
        setStreaming(false);
        appendMessage('assistant', 'Agent completed.\\n\\n' + msg.summary);
        break;
      }

      case 'actionApplied': {
        // Could show undo button; for now, VS Code notifications handle it
        break;
      }
    }
  });

  // ─── Agent plan rendering ───
  function renderPlan(plan) {
    setStreaming(true);

    let el = document.getElementById('plan-' + plan.id);
    if (!el) {
      if ($welcome) $welcome.style.display = 'none';
      el = document.createElement('div');
      el.className = 'message assistant';
      el.id = 'plan-' + plan.id;
      $messages.appendChild(el);
    }

    let html = '<div class="agent-plan">'
      + '<div class="plan-header">'
      + '<div class="plan-header-icon">A</div>'
      + '<span>Agent Plan</span>'
      + '</div>'
      + '<div style="margin-bottom:10px;color:var(--fg-secondary);font-size:12px">' + esc(plan.goal) + '</div>'
      + '<ul class="plan-steps">';

    plan.steps.forEach(step => {
      const icons = { pending: '&#9675;', running: '&#8635;', completed: '&#10003;', failed: '&#10007;', skipped: '&#8212;' };
      html += '<li class="plan-step" id="step-' + plan.id + '-' + step.id + '">'
        + '<span class="step-indicator ' + step.status + '">' + (icons[step.status] || '') + '</span>'
        + '<span class="step-text">' + esc(step.description) + '</span>'
        + '</li>';
    });

    html += '</ul>';

    if (plan.status === 'planning') {
      html += '<div class="plan-actions">'
        + '<button class="action-btn primary" data-accept-plan="' + plan.id + '">Execute Plan</button>'
        + '<button class="action-btn danger" data-reject-plan="' + plan.id + '">Cancel</button>'
        + '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
    scrollToBottom();
  }

  function updateStep(planId, stepId, status, result) {
    const el = document.getElementById('step-' + planId + '-' + stepId);
    if (!el) return;
    const ind = el.querySelector('.step-indicator');
    ind.className = 'step-indicator ' + status;
    const icons = { pending: '&#9675;', running: '&#8635;', completed: '&#10003;', failed: '&#10007;', skipped: '&#8212;' };
    ind.innerHTML = icons[status] || '';
    if (result) {
      let resultEl = el.querySelector('.step-result');
      if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.className = 'step-result';
        el.querySelector('.step-text').appendChild(resultEl);
      }
      resultEl.textContent = result;
    }
    scrollToBottom();
  }
</script>
</body>
</html>`;
  }

  private dispose(): void {
    ChatPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
