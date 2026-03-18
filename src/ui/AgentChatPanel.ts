import * as vscode from 'vscode';
import {
  ChatMessage,
  ChatSession,
  AIAction,
  WebviewMessage,
  ExtensionMessage,
  AIStreamCallback,
  AIProvider,
  AIProviderType,
  MultiFileEdit,
  TaskList,
} from '../types';
import {
  AgentWebviewMessage,
  AgentExtensionMessage,
  AgentRole,
} from '../types/agents';
import { ContextBuilder } from '../context/ContextBuilder';
import { FileChangeManager } from '../files/FileChangeManager';
import { MultiFileEditor } from '../files/MultiFileEditor';
import { AgentController } from '../agent/AgentController';
import { WorkspaceScanner } from '../workspace/WorkspaceScanner';
import { ChangePreviewPanel } from './ChangePreviewPanel';
import { createFileChangePreview } from '../utils/diffGenerator';
import { taskManager } from '../utils/taskManager';
import { ExplanationGenerator } from '../utils/explanationGenerator';
import { ModelRouter } from '../routing/ModelRouter';
import { PerformanceTracker } from '../routing/PerformanceTracker';
import { AgentOrchestrator } from '../orchestrator/AgentOrchestrator';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { ToolRegistry } from '../tools/ToolRegistry';
import { Logger } from '../utils/Logger';

/**
 * Full chat interface with AI.
 * Features:
 * - Thorough: Examines relevant files before suggesting changes
 * - Cautious: Shows plans and previews before applying
 * - Educational: Explains reasoning and suggests improvements
 * - Consistent: Follows project patterns and style
 * - Smart Routing: Automatically selects best model for each task
 */
export class AgentChatPanel {
  public static currentPanel: AgentChatPanel | undefined;
  private static sharedOrchestrator: AgentOrchestrator | null = null;
  private static sharedKnowledgeBase: KnowledgeBase | null = null;
  private static sharedToolRegistry: ToolRegistry | null = null;
  private panel: vscode.WebviewPanel;
  private session: ChatSession;
  private disposables: vscode.Disposable[] = [];
  private explanationGenerator: ExplanationGenerator;
  private pendingApprovals: Map<string, MultiFileEdit> = new Map();
  private currentTaskList: TaskList | null = null;
  private logger: Logger;
  private modelRouter: ModelRouter;
  private performanceTracker: PerformanceTracker;
  private availableModels: string[] = [];
  private availableProviders: Map<AIProviderType, AIProvider> = new Map();
  private currentTaskId: string | null = null;
  private orchestrator: AgentOrchestrator | null = null;
  private knowledgeBase: KnowledgeBase | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private activeAgentId: string = 'auto';

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private provider: AIProvider,
    private context: vscode.ExtensionContext,
    private contextBuilder: ContextBuilder,
    private changeManager: FileChangeManager,
    private multiFileEditor: MultiFileEditor,
    private agentController: AgentController,
    private scanner: WorkspaceScanner,
  ) {
    this.panel = panel;
    this.session = this.createSession();
    this.logger = new Logger('AgentChatPanel');
    this.performanceTracker = new PerformanceTracker(context);
    this.modelRouter = new ModelRouter(context, this.performanceTracker);
    this.explanationGenerator = new ExplanationGenerator(provider);

    // Initialize available providers map
    this.availableProviders.set(provider.config.type, provider);

    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Initialize model list
    this.loadAvailableModels();
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    provider: AIProvider,
    context: vscode.ExtensionContext,
    contextBuilder: ContextBuilder,
    changeManager: FileChangeManager,
    multiFileEditor: MultiFileEditor,
    agentController: AgentController,
    scanner: WorkspaceScanner,
  ): AgentChatPanel {
    const column = vscode.ViewColumn.Beside;
    if (AgentChatPanel.currentPanel) {
      AgentChatPanel.currentPanel.panel.reveal(column);
      return AgentChatPanel.currentPanel;
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
    AgentChatPanel.currentPanel = new AgentChatPanel(
      panel,
      extensionUri,
      provider,
      context,
      contextBuilder,
      changeManager,
      multiFileEditor,
      agentController,
      scanner,
    );
    // Auto-connect orchestrator if previously registered
    if (
      AgentChatPanel.sharedOrchestrator &&
      AgentChatPanel.sharedKnowledgeBase &&
      AgentChatPanel.sharedToolRegistry
    ) {
      AgentChatPanel.currentPanel.connectOrchestrator(
        AgentChatPanel.sharedOrchestrator,
        AgentChatPanel.sharedKnowledgeBase,
        AgentChatPanel.sharedToolRegistry,
      );
    }
    return AgentChatPanel.currentPanel;
  }

  updateProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * Connect the multi-agent orchestrator, knowledge base, and tool registry.
   */
  connectOrchestrator(
    orchestrator: AgentOrchestrator,
    knowledgeBase: KnowledgeBase,
    toolRegistry: ToolRegistry,
  ): void {
    this.orchestrator = orchestrator;
    this.knowledgeBase = knowledgeBase;
    this.toolRegistry = toolRegistry;
    // Store statically so future createOrShow calls auto-connect
    AgentChatPanel.sharedOrchestrator = orchestrator;
    AgentChatPanel.sharedKnowledgeBase = knowledgeBase;
    AgentChatPanel.sharedToolRegistry = toolRegistry;
    this.logger.info('Orchestrator connected with agent system');
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

  private async handleMessage(
    msg: WebviewMessage | AgentWebviewMessage,
  ): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postMessage({
          type: 'chatHistory',
          messages: this.session.messages,
        });
        this.checkProviderStatus();
        // Send agent list if orchestrator is connected
        if (this.orchestrator) {
          this.panel.webview.postMessage({
            type: 'agentList',
            agents: this.orchestrator.getAgentConfigs(),
          });
        }
        if (this.toolRegistry) {
          this.panel.webview.postMessage({
            type: 'toolList',
            tools: this.toolRegistry.getDefinitions(),
          });
        }
        break;
      case 'sendMessage':
        await this.handleUserMessage(
          (msg as any).content,
          (msg as any).contextFiles,
        );
        break;
      case 'cancelRequest':
        this.provider.abort();
        if (this.orchestrator) {
          this.orchestrator.cancel();
        }
        break;
      case 'applyAction':
        await this.handleApplyAction(
          (msg as any).messageId,
          (msg as any).actionIndex,
        );
        break;
      case 'applyAllActions':
        await this.handleApplyAllActions((msg as any).messageId);
        break;
      case 'undoAction':
        await this.handleUndo((msg as any).operationId);
        break;
      case 'newSession':
        this.session = this.createSession();
        if (this.orchestrator) {
          this.orchestrator.clearAllHistory();
        }
        this.postMessage({ type: 'chatHistory', messages: [] });
        break;
      case 'getFileTree':
        const tree = this.scanner.getFileTree();
        if (tree) {
          this.postMessage({ type: 'fileTree', tree });
        }
        break;
      case 'addContextFile':
        this.contextBuilder.addContextFile((msg as any).filePath);
        this.postMessage({
          type: 'contextUpdate',
          files: this.contextBuilder.getContextFiles(),
        });
        break;
      case 'removeContextFile':
        this.contextBuilder.removeContextFile((msg as any).filePath);
        this.postMessage({
          type: 'contextUpdate',
          files: this.contextBuilder.getContextFiles(),
        });
        break;
      case 'executeAgent':
        await this.handleAgentExecution((msg as any).goal);
        break;
      case 'cancelAgent':
        this.agentController.cancel();
        if (this.orchestrator) {
          this.orchestrator.cancel();
        }
        break;
      case 'acceptPlan':
        await this.handleAcceptPlan((msg as any).planId);
        break;
      case 'rejectPlan':
        break;
      case 'switchAgent':
        this.activeAgentId = (msg as any).agentId;
        this.logger.info(`Switched to agent: ${this.activeAgentId}`);
        break;
      case 'runWorkflow':
        await this.handleWorkflow(
          (msg as any).workflowType,
          (msg as any).input,
        );
        break;
      case 'getAgents':
        if (this.orchestrator) {
          this.panel.webview.postMessage({
            type: 'agentList',
            agents: this.orchestrator.getAgentConfigs(),
          });
        }
        break;
      case 'getTools':
        if (this.toolRegistry) {
          this.panel.webview.postMessage({
            type: 'toolList',
            tools: this.toolRegistry.getDefinitions(),
          });
        }
        break;
      case 'acceptChange':
        this.multiFileEditor.setFileAccepted(msg.editId, msg.fileIndex, true);
        break;
      case 'rejectChange':
        this.multiFileEditor.setFileAccepted(msg.editId, msg.fileIndex, false);
        break;
      case 'applyEdit':
        await this.multiFileEditor.applyEdit(msg.editId);
        vscode.window.showInformationMessage('Changes applied!');
        break;
      case 'approveMessage':
        await this.handleApproveMessage(msg.messageId);
        break;
      case 'rejectMessage':
        await this.handleRejectMessage(msg.messageId);
        break;
      case 'requestExplanation':
        await this.handleRequestExplanation(msg.messageId);
        break;
      case 'updateTaskStatus':
        await this.handleTaskStatusUpdate(msg.taskId, msg.status);
        break;
      case 'listModels':
        await this.handleListModels();
        break;
      case 'selectModel':
        await this.handleSelectModel(msg.model);
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

  /**
   * Load available models from current provider
   */
  private async loadAvailableModels(): Promise<void> {
    try {
      this.availableModels = await this.provider.listModels();
      this.logger.debug('Loaded available models', {
        count: this.availableModels.length,
      });

      // Send to UI
      this.postMessage({
        type: 'modelList',
        models: this.availableModels,
      });
    } catch (error: any) {
      this.logger.error('Failed to load models', { error: error.message });
    }
  }

  /**
   * Handle request to list models
   */
  private async handleListModels(): Promise<void> {
    await this.loadAvailableModels();
  }

  /**
   * Handle model selection
   */
  private async handleSelectModel(model: string): Promise<void> {
    try {
      this.logger.info('Switching to model', { model });

      // Update provider config
      this.provider.config.model = model;

      // Persist to workspace state
      await this.context.workspaceState.update('testfire.selectedModel', model);

      // Update UI
      this.postMessage({
        type: 'modelChanged',
        model,
      });

      // Update status bar
      await this.checkProviderStatus();

      vscode.window.showInformationMessage(`Switched to model: ${model}`);
    } catch (error: any) {
      this.logger.error('Failed to switch model', { error: error.message });
      vscode.window.showErrorMessage(
        `Failed to switch model: ${error.message}`,
      );
    }
  }

  /**
   * Register an additional provider for routing
   */
  registerProvider(provider: AIProvider): void {
    this.availableProviders.set(provider.config.type, provider);
    this.logger.info('Registered provider for routing', {
      provider: provider.name,
    });
  }

  private async handleUserMessage(
    content: string,
    contextFiles?: string[],
  ): Promise<void> {
    if (contextFiles) {
      for (const f of contextFiles) {
        this.contextBuilder.addContextFile(f);
      }
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      contextFiles: this.contextBuilder.getContextFiles(),
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

      if (this.currentTaskId) {
        this.performanceTracker.completeTask(this.currentTaskId, false, {
          errorMessage: err.message,
        });
        this.currentTaskId = null;
      }
    };

    const streamCallback: AIStreamCallback = {
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
        this.postMessage({
          type: 'streamComplete',
          messageId: assistantMsg.id,
          content: fullResponse,
          actions: actions.length > 0 ? actions : undefined,
        });
      },
      onError: sendError,
    };

    try {
      const selectedCode = this.contextBuilder.getSelectedCode();
      let agentContext = '';
      if (selectedCode) {
        agentContext += `Selected code from ${selectedCode.filePath} (${selectedCode.language}):\n\`\`\`\n${selectedCode.text}\n\`\`\`\n`;
      }

      // Always auto-route through orchestrator when available
      if (this.orchestrator) {
        try {
          const result = await this.orchestrator.processRequest(
            content,
            agentContext,
            (event) => {
              this.panel.webview.postMessage({
                type: 'orchestratorEvent',
                event,
              } as any);
            },
            streamCallback,
          );

          // Send workflow metadata to UI
          if (result.responses.length > 0) {
            this.panel.webview.postMessage({
              type: 'workflowResult',
              result,
            } as any);
          }

          this.session.updatedAt = Date.now();
          return;
        } catch (err: any) {
          this.logger.warn(`Orchestrator failed, falling back: ${err.message}`);
        }
      }

      // Fallback: single-provider path
      const messages = await this.contextBuilder.buildMessages(
        content,
        selectedCode,
      );

      for (const m of this.session.messages.slice(0, -2)) {
        if (m.role === 'user' || m.role === 'assistant') {
          messages.push({ role: m.role, content: m.content });
        }
      }

      await this.provider.chat(messages, streamCallback);
    } catch (error: any) {
      sendError(error);
    }
    this.session.updatedAt = Date.now();
  }

  /**
   * Handle multi-agent workflow execution
   */
  private async handleWorkflow(
    workflowType: string,
    input: string,
  ): Promise<void> {
    if (!this.orchestrator) {
      vscode.window.showWarningMessage(
        'Multi-agent orchestrator not initialized',
      );
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: `[Workflow: ${workflowType}] ${input}`,
      timestamp: Date.now(),
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

    try {
      const selectedCode = this.contextBuilder.getSelectedCode();
      let context = '';
      if (selectedCode) {
        context += `\nSelected code from ${selectedCode.filePath} (${selectedCode.language}):\n\`\`\`\n${selectedCode.text}\n\`\`\`\n`;
      }

      const result = await this.orchestrator.processRequest(
        input,
        context,
        (event) => {
          // Send orchestrator events to the UI
          this.panel.webview.postMessage({ type: 'orchestratorEvent', event });
          if (event.type === 'agent_start' && event.agentId) {
            this.panel.webview.postMessage({
              type: 'agentThinking',
              agentId: event.agentId,
              role: (event.data as any)?.role || 'coder',
            });
          }
          if (event.type === 'agent_complete' && event.data) {
            this.panel.webview.postMessage({
              type: 'agentResponse',
              response: event.data,
            });
          }
        },
        {
          onToken: (token) => {
            assistantMsg.content += token;
            this.postMessage({
              type: 'streamToken',
              messageId: assistantMsg.id,
              token,
            });
          },
          onComplete: (fullResponse) => {
            // Will be handled below
          },
          onError: (err) => {
            this.postMessage({
              type: 'streamError',
              messageId: assistantMsg.id,
              error: err.message,
            });
          },
        },
      );

      assistantMsg.content = result.finalResponse;
      assistantMsg.isStreaming = false;

      this.postMessage({
        type: 'streamComplete',
        messageId: assistantMsg.id,
        content: result.finalResponse,
      });

      // Send workflow result
      this.panel.webview.postMessage({
        type: 'workflowResult',
        result,
      });
    } catch (error: any) {
      assistantMsg.isStreaming = false;
      this.postMessage({
        type: 'streamError',
        messageId: assistantMsg.id,
        error: error.message,
      });
    }
  }

  private parseActionsFromResponse(response: string): AIAction[] {
    const actions: AIAction[] = [];
    const regex = /```(\w+)?\s*\n\/\/\s*filepath:\s*(.+?)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(response)) !== null) {
      actions.push({
        type: 'edit',
        files: [
          {
            file: match[2].trim(),
            originalContent: '',
            newContent: match[3].trim(),
            type: 'edit',
          },
        ],
        description: `Update ${match[2].trim()}`,
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
    try {
      const edit = await this.multiFileEditor.createEdit(
        msg.actions[actionIndex].files,
        msg.actions[actionIndex].description,
      );
      ChangePreviewPanel.show(
        edit,
        this.multiFileEditor,
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      );
      this.postMessage({
        type: 'actionApplied',
        operationId: edit.id,
        success: true,
      });
    } catch (error: any) {
      this.postMessage({
        type: 'actionApplied',
        operationId: '',
        success: false,
        error: error.message,
      });
    }
  }

  private async handleApplyAllActions(messageId: string): Promise<void> {
    const msg = this.session.messages.find((m) => m.id === messageId);
    if (!msg?.actions) {
      return;
    }
    const allChanges = msg.actions.flatMap((a) => a.files);
    try {
      const entry = await this.changeManager.applyChanges(
        allChanges,
        'Apply all AI changes',
      );
      this.postMessage({
        type: 'actionApplied',
        operationId: entry.id,
        success: true,
      });
      vscode.window.showInformationMessage(
        `Applied ${allChanges.length} changes`,
      );
    } catch (error: any) {
      this.postMessage({
        type: 'actionApplied',
        operationId: '',
        success: false,
        error: error.message,
      });
    }
  }

  private async handleUndo(operationId: string): Promise<void> {
    const success = await this.changeManager.undo(operationId);
    vscode.window.showInformationMessage(
      success ? 'Changes undone' : 'Undo failed',
    );
  }

  private async handleAgentExecution(goal: string): Promise<void> {
    const plan = await this.agentController.createPlan(goal, (p) => {
      this.postMessage({ type: 'agentPlan', plan: p });
    });
    const planMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `**Agent Plan:** ${goal}\n\n${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}`,
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
    const summary = await this.agentController.executePlan(
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

  /**
   * Handle approval of a message with preview
   */
  private async handleApproveMessage(messageId: string): Promise<void> {
    const message = this.session.messages.find((m) => m.id === messageId);
    if (!message || !message.preview) {
      return;
    }

    message.approved = true;

    // Record user feedback
    if (this.currentTaskId) {
      this.performanceTracker.recordFeedback(this.currentTaskId, 'accepted');
      this.currentTaskId = null;
    }

    try {
      // Apply the changes
      await this.multiFileEditor.applyEdit(message.preview.id);
      vscode.window.showInformationMessage('Changes applied successfully!');

      // Remove from pending approvals
      this.pendingApprovals.delete(message.preview.id);
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to apply changes: ${error.message}`,
      );
    }
  }

  /**
   * Handle rejection of a message with preview
   */
  private async handleRejectMessage(messageId: string): Promise<void> {
    const message = this.session.messages.find((m) => m.id === messageId);
    if (!message || !message.preview) {
      return;
    }

    message.approved = false;
    this.pendingApprovals.delete(message.preview.id);

    // Record user feedback
    if (this.currentTaskId) {
      this.performanceTracker.recordFeedback(this.currentTaskId, 'rejected');
      this.currentTaskId = null;
    }

    vscode.window.showInformationMessage('Changes rejected');
  }

  /**
   * Request explanation for a message
   */
  private async handleRequestExplanation(messageId: string): Promise<void> {
    const message = this.session.messages.find((m) => m.id === messageId);
    if (!message || !message.actions || message.actions.length === 0) {
      return;
    }

    const action = message.actions[0];

    try {
      const explanation = await this.explanationGenerator.explainRefactoring(
        action.description,
        action.files.map((f) => f.file),
        action.reasoning,
      );

      message.explanation = explanation;

      this.postMessage({
        type: 'explanation',
        messageId,
        explanation,
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to generate explanation: ${error.message}`,
      );
    }
  }

  /**
   * Handle task status update
   */
  private async handleTaskStatusUpdate(
    taskId: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped',
  ): Promise<void> {
    if (!this.currentTaskList) {
      return;
    }

    const success = taskManager.updateTaskStatus(
      this.currentTaskList.id,
      taskId,
      status,
    );

    if (success) {
      this.postMessage({
        type: 'taskUpdate',
        taskId,
        status,
      });
    }
  }

  // The getHtmlContent() method reuses the same chat UI from views/chatPanel.ts.
  // It's kept in the original file to avoid duplication of the large HTML template.
  // This class acts as the bridge between the UI and new module architecture.

  private getHtmlContent(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box}
body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);height:100vh;display:flex;flex-direction:column;overflow:hidden;margin:0;padding:0}
.header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}
.header-left{display:flex;align-items:center;gap:10px}
.header-logo{width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:13px;color:white;font-weight:700}
.header-title{font-weight:600;font-size:13px}
.header-right{display:flex;gap:6px;align-items:center}
.icon-btn{background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;padding:5px 8px;border-radius:4px;font-size:12px;white-space:nowrap}
.icon-btn:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
.status-bar{padding:5px 16px;font-size:11px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:8px}
.status-model{margin-left:auto;font-family:var(--vscode-editor-font-family);font-size:10px;opacity:0.8}
.status-dot{width:7px;height:7px;border-radius:50%}
.status-dot.online{background:#4caf50;box-shadow:0 0 4px #4caf50}.status-dot.offline{background:#f44336}
.context-bar{padding:6px 16px;border-bottom:1px solid var(--vscode-panel-border);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.context-bar:empty{display:none}
.context-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:11px;font-family:var(--vscode-editor-font-family)}
.chip-remove{cursor:pointer;opacity:.5;font-size:10px}.chip-remove:hover{opacity:1}
.agent-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;line-height:1}
.agent-badge.coder{background:#264f78;color:#7cc6fe}.agent-badge.reviewer{background:#4a3728;color:#e8a56d}
.agent-badge.planner{background:#2d4a3e;color:#6dc9a0}.agent-badge.documenter{background:#3b2d4a;color:#c49de8}
.agent-badge.quick{background:#4a4a2d;color:#e8e06d}.agent-badge.auto{background:#3b3b3b;color:#ccc}
.orchestrator-status{padding:6px 16px;font-size:11px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border);display:none;align-items:center;gap:8px;background:var(--vscode-editorWidget-background)}
.orchestrator-status.visible{display:flex}
.orchestrator-status .agent-thinking{display:inline-flex;align-items:center;gap:6px}
.workflow-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.tool-panel{border-bottom:1px solid var(--vscode-panel-border);max-height:120px;overflow-y:auto;font-size:11px;display:none}
.tool-panel.visible{display:block}
.tool-panel-header{display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);font-weight:600;font-size:10px;cursor:pointer;user-select:none;color:var(--vscode-descriptionForeground)}
.tool-panel-header:hover{background:var(--vscode-list-hoverBackground)}
.tool-log{padding:2px 0}
.tool-entry{display:flex;align-items:center;gap:8px;padding:2px 12px;font-family:var(--vscode-editor-font-family);font-size:11px}
.tool-entry:hover{background:var(--vscode-list-hoverBackground)}
.tool-icon{font-size:10px;width:14px;text-align:center}
.tool-icon.success{color:#4caf50}.tool-icon.error{color:#f44336}.tool-icon.running{color:var(--vscode-focusBorder);animation:sp 1s linear infinite}
.tool-name{color:var(--vscode-textLink-foreground);font-weight:500}
.tool-duration{color:var(--vscode-disabledForeground);margin-left:auto;font-size:10px}
.messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:4px}
.message{border-radius:8px;padding:12px 16px;max-width:100%;animation:fi .2s ease}
@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.message.user{background:var(--vscode-list-hoverBackground);border-left:3px solid var(--vscode-focusBorder);margin-top:8px}
.message.assistant{background:transparent;padding-left:16px}
.msg-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.msg-avatar{width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.msg-avatar.user-avatar{background:var(--vscode-focusBorder);color:white}
.msg-avatar.ai-avatar{background:linear-gradient(135deg,#667eea,#764ba2);color:white}
.msg-name{font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground)}
.msg-time{font-size:10px;color:var(--vscode-disabledForeground);margin-left:auto}
.msg-body{line-height:1.6;word-wrap:break-word}
.msg-body code{background:var(--vscode-textCodeBlock-background);padding:2px 6px;border-radius:3px;font-family:var(--vscode-editor-font-family);font-size:12px}
.code-block-wrapper{position:relative;margin:10px 0;border-radius:8px;overflow:hidden;border:1px solid var(--vscode-panel-border)}
.code-block-header{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(0,0,0,.2);border-bottom:1px solid var(--vscode-panel-border);font-size:10px;color:var(--vscode-disabledForeground)}
.code-block-filepath{font-family:var(--vscode-editor-font-family);color:var(--vscode-textLink-foreground);font-size:11px}
.code-copy-btn,.code-apply-btn{background:none;border:none;cursor:pointer;padding:2px 8px;border-radius:3px;font-size:10px}
.code-copy-btn{color:var(--vscode-disabledForeground)}.code-copy-btn:hover{background:var(--vscode-list-hoverBackground)}
.code-apply-btn{color:#4caf50;font-weight:600}.code-apply-btn:hover{background:#4caf50;color:white}
.code-block-wrapper pre{margin:0;padding:12px 16px;background:var(--vscode-textCodeBlock-background);overflow-x:auto;font-family:var(--vscode-editor-font-family);font-size:12px;line-height:1.5}
.code-block-wrapper pre code{background:none;padding:0}
.diff-add{color:#4caf50}.diff-remove{color:#f44336;opacity:.7}
.actions-bar{margin-top:12px;padding-top:10px;border-top:1px solid var(--vscode-panel-border);display:flex;flex-wrap:wrap;gap:8px}
.action-btn{padding:5px 14px;border-radius:4px;border:1px solid var(--vscode-panel-border);background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:11px;font-family:var(--vscode-font-family);display:inline-flex;align-items:center;gap:6px}
.action-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.action-btn.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}
.action-btn.primary:hover{background:var(--vscode-button-hoverBackground)}
.action-btn.danger{border-color:#f44336;color:#f44336}
.agent-plan{border:1px solid var(--vscode-focusBorder);border-radius:8px;padding:14px;margin-top:8px;background:var(--vscode-editorWidget-background)}
.plan-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-weight:600;font-size:13px}
.plan-header-icon{width:22px;height:22px;border-radius:4px;background:var(--vscode-focusBorder);color:white;display:flex;align-items:center;justify-content:center;font-size:11px}
.plan-steps{list-style:none;padding:0;margin:0}
.plan-step{padding:8px 0;display:flex;align-items:flex-start;gap:10px;font-size:12px;border-bottom:1px solid rgba(128,128,128,.1)}
.plan-step:last-child{border-bottom:none}
.step-indicator{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.step-indicator.pending{border:2px solid var(--vscode-panel-border);color:var(--vscode-disabledForeground)}
.step-indicator.running{border:2px solid var(--vscode-focusBorder);color:var(--vscode-focusBorder);animation:sp 1.5s linear infinite}
.step-indicator.completed{background:#4caf50;color:white}.step-indicator.failed{background:#f44336;color:white}
@keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.step-text{flex:1;line-height:1.4}.step-result{font-size:10px;color:var(--vscode-disabledForeground);margin-top:2px}
.plan-actions{margin-top:12px;padding-top:10px;border-top:1px solid var(--vscode-panel-border);display:flex;gap:8px}
.typing-indicator{display:inline-flex;gap:4px;padding:4px 0}
.typing-dot{width:6px;height:6px;border-radius:50%;background:var(--vscode-disabledForeground);animation:tb 1.4s ease-in-out infinite}
.typing-dot:nth-child(2){animation-delay:.2s}.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes tb{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
.file-picker{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding-top:60px}
.file-picker-dialog{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:12px;width:90%;max-width:500px;max-height:400px;display:flex;flex-direction:column}
.file-picker-search{padding:12px;border-bottom:1px solid var(--vscode-panel-border)}
.file-picker-search input{width:100%;padding:8px 12px;border:1px solid var(--vscode-input-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:var(--vscode-editor-font-family);font-size:13px;outline:none;box-sizing:border-box}
.file-picker-search input:focus{border-color:var(--vscode-focusBorder)}
.file-picker-list{flex:1;overflow-y:auto;padding:4px}
.file-picker-item{padding:6px 12px;cursor:pointer;border-radius:4px;font-family:var(--vscode-editor-font-family);font-size:12px;color:var(--vscode-descriptionForeground)}
.file-picker-item:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
.file-picker-item.selected{color:#4caf50}
.input-area{border-top:1px solid var(--vscode-panel-border);padding:12px 16px;background:var(--vscode-sideBar-background)}
.input-row{display:flex;gap:8px;align-items:flex-end}
.input-wrapper{flex:1;position:relative}
.input-wrapper textarea{width:100%;min-height:44px;max-height:160px;padding:10px 14px;border:1px solid var(--vscode-input-border);border-radius:10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:var(--vscode-font-family);font-size:13px;resize:none;outline:none;line-height:1.5;box-sizing:border-box}
.input-wrapper textarea:focus{border-color:var(--vscode-focusBorder)}
.send-btn{padding:10px 20px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;min-width:70px}
.send-btn:hover{background:var(--vscode-button-hoverBackground)}.send-btn:disabled{opacity:.5}.send-btn.cancel{background:#f44336}
.input-footer{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10px;color:var(--vscode-disabledForeground)}
.input-footer-left{display:flex;align-items:center;gap:4px}
.auto-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;font-size:9px;background:linear-gradient(135deg,#667eea22,#764ba222);color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border)}
.auto-badge-dot{width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2)}
.model-link{color:var(--vscode-textLink-foreground);cursor:pointer;font-size:10px;text-decoration:none;opacity:0.7}
.model-link:hover{opacity:1;text-decoration:underline}
.model-picker{position:absolute;bottom:100%;left:0;right:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;margin-bottom:4px;max-height:200px;overflow-y:auto;display:none;z-index:50;box-shadow:0 -4px 12px rgba(0,0,0,.2)}
.model-picker.visible{display:block}
.model-picker-item{padding:6px 12px;cursor:pointer;font-size:12px;font-family:var(--vscode-editor-font-family);color:var(--vscode-descriptionForeground)}
.model-picker-item:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
.model-picker-item.active{color:var(--vscode-textLink-foreground);font-weight:600}
.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:16px;padding:40px 20px;text-align:center}
.welcome-logo{width:52px;height:52px;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:26px;color:white;font-weight:700}
.welcome h2{font-size:17px;font-weight:600;margin:0}.welcome p{color:var(--vscode-descriptionForeground);font-size:13px;max-width:380px;line-height:1.5;margin:0}
.welcome-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;width:100%;max-width:420px}
.shortcut-card{padding:12px 14px;border-radius:8px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);text-align:left;cursor:pointer;transition:border-color .15s}
.shortcut-card:hover{border-color:var(--vscode-focusBorder)}
.shortcut-card-icon{font-size:16px;margin-bottom:4px}
.shortcut-card-title{font-size:12px;font-weight:600;margin-bottom:2px}
.shortcut-card-desc{font-size:10px;color:var(--vscode-disabledForeground)}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:3px}
</style></head><body>
<div class="header">
  <div class="header-left"><div class="header-logo">T</div><span class="header-title">TestFire AI</span></div>
  <div class="header-right">
    <button class="icon-btn" id="btnAddFiles" title="Add context files">+ Files</button>
    <button class="icon-btn" id="btnNewSession" title="Start new chat">New Chat</button>
  </div>
</div>
<div class="status-bar"><span class="status-dot" id="statusDot"></span><span id="statusText">Connecting...</span><span class="status-model" id="statusModel"></span></div>
<div class="context-bar" id="contextBar"></div>
<div class="orchestrator-status" id="orchStatus"><span class="agent-thinking" id="orchText"></span></div>
<div class="tool-panel" id="toolPanel"><div class="tool-panel-header" id="toolPanelHeader">Tools <span id="toolCount">(0)</span></div><div class="tool-log" id="toolLog"></div></div>
<div class="messages" id="messages">
  <div class="welcome" id="welcome">
    <div class="welcome-logo">T</div>
    <h2>TestFire AI</h2>
    <p>Just type what you need. I auto-detect your intent and route to the best agent and workflow.</p>
    <div class="welcome-shortcuts">
      <div class="shortcut-card" data-action="Explain the selected code"><div class="shortcut-card-icon">&#128269;</div><div class="shortcut-card-title">Explain Code</div><div class="shortcut-card-desc">Understand selected code</div></div>
      <div class="shortcut-card" data-action="Find bugs and issues in this code"><div class="shortcut-card-icon">&#128027;</div><div class="shortcut-card-title">Find Bugs</div><div class="shortcut-card-desc">Detect issues &amp; problems</div></div>
      <div class="shortcut-card" data-action="Refactor this code for better quality"><div class="shortcut-card-icon">&#9881;</div><div class="shortcut-card-title">Refactor</div><div class="shortcut-card-desc">Improve code quality</div></div>
      <div class="shortcut-card" data-action="Write unit tests for this code"><div class="shortcut-card-icon">&#9989;</div><div class="shortcut-card-title">Add Tests</div><div class="shortcut-card-desc">Generate test coverage</div></div>
    </div>
  </div>
</div>
<div class="input-area">
  <div class="input-row"><div class="input-wrapper"><textarea id="userInput" placeholder="Ask anything... I'll auto-detect and route to the right agent" rows="1"></textarea><div class="model-picker" id="modelPicker"></div></div><button class="send-btn" id="sendBtn">Send</button></div>
  <div class="input-footer"><div class="input-footer-left"><span class="auto-badge"><span class="auto-badge-dot"></span> Auto</span><span>Enter to send</span></div><span class="model-link" id="modelLink" title="Click to change model">model: loading...</span></div>
</div>
<div class="file-picker" id="filePicker" style="display:none"><div class="file-picker-dialog"><div class="file-picker-search"><input type="text" id="fileSearchInput" placeholder="Search files..."></div><div class="file-picker-list" id="filePickerList"></div></div></div>
<script nonce="${nonce}">
var V=acquireVsCodeApi(),streaming=false,ctxFiles=[],allFiles=[],currentModel='',toolInvocations=[];
var $m=document.getElementById('messages'),$w=document.getElementById('welcome'),$i=document.getElementById('userInput'),$s=document.getElementById('sendBtn'),$cb=document.getElementById('contextBar'),$fp=document.getElementById('filePicker'),$fl=document.getElementById('filePickerList'),$fs=document.getElementById('fileSearchInput'),$sd=document.getElementById('statusDot'),$st=document.getElementById('statusText'),$sm=document.getElementById('statusModel'),$tp=document.getElementById('toolPanel'),$tl=document.getElementById('toolLog'),$tc=document.getElementById('toolCount'),$os=document.getElementById('orchStatus'),$ot=document.getElementById('orchText'),$mp=document.getElementById('modelPicker'),$ml=document.getElementById('modelLink');
V.postMessage({type:'ready'});
V.postMessage({type:'listModels'});
document.getElementById('btnAddFiles').addEventListener('click',function(){V.postMessage({type:'getFileTree'})});
document.getElementById('btnNewSession').addEventListener('click',function(){V.postMessage({type:'newSession'});$m.innerHTML='';if($w){$m.appendChild($w);$w.style.display=''}toolInvocations=[];$tl.innerHTML='';$tc.textContent='(0)';$os.classList.remove('visible')});
document.getElementById('toolPanelHeader').addEventListener('click',function(){$tl.style.display=$tl.style.display==='none'?'block':'none'});
$s.addEventListener('click',function(){handleSend()});
$ml.addEventListener('click',function(e){e.stopPropagation();$mp.classList.toggle('visible')});
document.addEventListener('click',function(e){if(!e.target.closest('.model-picker')&&!e.target.closest('.model-link'))$mp.classList.remove('visible')});
$fp.addEventListener('click',function(e){if(e.target===$fp)$fp.style.display='none'});
$fs.addEventListener('input',function(){filterFiles(this.value)});
document.querySelectorAll('.shortcut-card[data-action]').forEach(function(c){c.addEventListener('click',function(){$i.value=this.dataset.action;$i.focus()})});
document.addEventListener('click',function(e){var b=e.target.closest('.code-copy-btn');if(b){var c=b.closest('.code-block-wrapper').querySelector('code').textContent;navigator.clipboard.writeText(c).then(function(){b.textContent='Copied!';setTimeout(function(){b.textContent='Copy'},1500)});return}var a=e.target.closest('.code-apply-btn');if(a){a.textContent='Applying...';a.disabled=true;return}var ap=e.target.closest('[data-accept-plan]');if(ap){V.postMessage({type:'acceptPlan',planId:ap.dataset.acceptPlan});return}var rp=e.target.closest('[data-reject-plan]');if(rp){V.postMessage({type:'rejectPlan',planId:rp.dataset.rejectPlan});setStreaming(false)}});
$i.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}});
$i.addEventListener('input',function(){$i.style.height='auto';$i.style.height=Math.min($i.scrollHeight,160)+'px'});
function handleSend(){var t=$i.value.trim();if(!t||streaming)return;if($w)$w.style.display='none';V.postMessage({type:'sendMessage',content:t,contextFiles:ctxFiles});appendMessage('user',t);$i.value='';$i.style.height='auto';setStreaming(true)}
function setStreaming(on){streaming=on;$s.disabled=false;if(on){$s.textContent='Stop';$s.className='send-btn cancel';$s.onclick=function(){V.postMessage({type:'cancelRequest'});setStreaming(false)}}else{$s.textContent='Send';$s.className='send-btn';$s.onclick=handleSend}}
function appendMessage(role,content,id){if($w)$w.style.display='none';var d=document.createElement('div');d.className='message '+role;if(id)d.id='msg-'+id;var h=document.createElement('div');h.className='msg-header';var av=document.createElement('div');av.className='msg-avatar '+(role==='user'?'user-avatar':'ai-avatar');av.textContent=role==='user'?'U':'T';var n=document.createElement('span');n.className='msg-name';n.textContent=role==='user'?'You':'TestFire AI';var t=document.createElement('span');t.className='msg-time';t.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});h.appendChild(av);h.appendChild(n);h.appendChild(t);var b=document.createElement('div');b.className='msg-body';if(content)b.innerHTML=renderMd(content);d.appendChild(h);d.appendChild(b);$m.appendChild(d);$m.scrollTop=$m.scrollHeight;return d}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
function renderMd(t){if(!t)return'';var cb=[];t=t.replace(/\x60\x60\x60(\\w*)\\n([\\s\\S]*?)\x60\x60\x60/g,function(m,l,c){var i=cb.length;cb.push({l:l,c:c});return'%%CB'+i+'%%'});t=esc(t);cb.forEach(function(b,i){var ec=esc(b.c);var hdr='';var fp=ec.match(/^\\/\\/\\s*filepath:\\s*(.+)\\n/);if(fp)hdr='<span class="code-block-filepath">'+fp[1].trim()+'</span>';else if(b.l)hdr='<span style="font-family:var(--vscode-editor-font-family);text-transform:uppercase;letter-spacing:.5px">'+b.l+'</span>';var ab=fp?'<button class="code-apply-btn" data-filepath="'+fp[1].trim()+'">Apply</button>':'';t=t.replace('%%CB'+i+'%%','<div class="code-block-wrapper"><div class="code-block-header">'+(hdr||'<span></span>')+'<span>'+ab+'<button class="code-copy-btn">Copy</button></span></div><pre><code>'+ec+'</code></pre></div>')});t=t.replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');t=t.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');t=t.replace(/^- (.+)$/gm,'<li>$1</li>');t=t.replace(/\\n\\n/g,'</p><p>');t='<p>'+t+'</p>';t=t.replace(/\\n/g,'<br>');return t}
function renderContextBar(){$cb.innerHTML='';if(!ctxFiles.length)return;ctxFiles.forEach(function(f){var ch=document.createElement('span');ch.className='context-chip';ch.innerHTML=esc(f.split('/').pop())+'<span class="chip-remove" data-file="'+esc(f)+'">&#10005;</span>';ch.querySelector('.chip-remove').onclick=function(){V.postMessage({type:'removeContextFile',filePath:this.dataset.file})};$cb.appendChild(ch)})}
function showFilePicker(tree){allFiles=[];flattenTree(tree,'');renderFileList(allFiles);$fp.style.display='flex';$fs.value='';$fs.focus()}
function flattenTree(n,p){if(n.type==='file')allFiles.push(p+n.name);else if(n.children){var pp=p?p+n.name+'/':'';n.children.forEach(function(c){flattenTree(c,pp)})}}
function renderFileList(files){$fl.innerHTML='';files.slice(0,100).forEach(function(f){var d=document.createElement('div');d.className='file-picker-item'+(ctxFiles.includes(f)?' selected':'');d.textContent=f;d.onclick=function(){if(ctxFiles.includes(f))V.postMessage({type:'removeContextFile',filePath:f});else V.postMessage({type:'addContextFile',filePath:f});d.classList.toggle('selected')};$fl.appendChild(d)})}
function filterFiles(q){var l=q.toLowerCase();renderFileList(l?allFiles.filter(function(f){return f.toLowerCase().includes(l)}):allFiles)}
function renderModelPicker(models){$mp.innerHTML='';models.forEach(function(m){var d=document.createElement('div');d.className='model-picker-item'+(m===currentModel?' active':'');d.textContent=m;d.onclick=function(){if(m!==currentModel){V.postMessage({type:'selectModel',model:m})}$mp.classList.remove('visible')};$mp.appendChild(d)})}
function renderPlan(plan){setStreaming(true);var el=document.getElementById('plan-'+plan.id);if(!el){if($w)$w.style.display='none';el=document.createElement('div');el.className='message assistant';el.id='plan-'+plan.id;$m.appendChild(el)}var h='<div class="agent-plan"><div class="plan-header"><div class="plan-header-icon">A</div><span>Agent Plan</span></div><div style="margin-bottom:10px;color:var(--vscode-descriptionForeground);font-size:12px">'+esc(plan.goal)+'</div><ul class="plan-steps">';plan.steps.forEach(function(s){var ic={pending:'&#9675;',running:'&#8635;',completed:'&#10003;',failed:'&#10007;',skipped:'&#8212;'};h+='<li class="plan-step" id="step-'+plan.id+'-'+s.id+'"><span class="step-indicator '+s.status+'">'+(ic[s.status]||'')+'</span><span class="step-text">'+esc(s.description)+'</span></li>'});h+='</ul>';if(plan.status==='planning'||plan.status==='awaiting_approval')h+='<div class="plan-actions"><button class="action-btn primary" data-accept-plan="'+plan.id+'">Execute Plan</button><button class="action-btn danger" data-reject-plan="'+plan.id+'">Cancel</button></div>';h+='</div>';el.innerHTML=h;$m.scrollTop=$m.scrollHeight}
function updateStep(pid,sid,status,result){var el=document.getElementById('step-'+pid+'-'+sid);if(!el)return;var ind=el.querySelector('.step-indicator');ind.className='step-indicator '+status;var ic={pending:'&#9675;',running:'&#8635;',completed:'&#10003;',failed:'&#10007;',skipped:'&#8212;'};ind.innerHTML=ic[status]||'';if(result){var r=el.querySelector('.step-result');if(!r){r=document.createElement('div');r.className='step-result';el.querySelector('.step-text').appendChild(r)}r.textContent=result}$m.scrollTop=$m.scrollHeight}
window.addEventListener('message',function(e){var msg=e.data;switch(msg.type){case'streamToken':{var el=document.getElementById('msg-'+msg.messageId);if(!el){el=appendMessage('assistant','',msg.messageId);var ind=document.createElement('div');ind.className='typing-indicator';ind.id='typing-'+msg.messageId;ind.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';el.appendChild(ind)}el.querySelector('.msg-body').textContent+=msg.token;$m.scrollTop=$m.scrollHeight;break}case'streamComplete':{setStreaming(false);var el=document.getElementById('msg-'+msg.messageId);if(!el)break;var ty=document.getElementById('typing-'+msg.messageId);if(ty)ty.remove();el.querySelector('.msg-body').innerHTML=renderMd(msg.content);if(msg.actions&&msg.actions.length>0){var bar=document.createElement('div');bar.className='actions-bar';msg.actions.forEach(function(a,idx){var btn=document.createElement('button');btn.className='action-btn';btn.textContent='Apply: '+a.description;btn.onclick=function(){V.postMessage({type:'applyAction',messageId:msg.messageId,actionIndex:idx})};bar.appendChild(btn)});if(msg.actions.length>1){var ab=document.createElement('button');ab.className='action-btn primary';ab.textContent='Apply All';ab.onclick=function(){V.postMessage({type:'applyAllActions',messageId:msg.messageId})};bar.appendChild(ab)}el.appendChild(bar)}$m.scrollTop=$m.scrollHeight;break}case'streamError':{setStreaming(false);var el=document.getElementById('msg-'+msg.messageId);if(el){var ty=document.getElementById('typing-'+msg.messageId);if(ty)ty.remove();el.querySelector('.msg-body').innerHTML='<p style="color:#f44336">Error: '+esc(msg.error)+'</p>'}break}case'chatHistory':{$m.innerHTML='';if(!msg.messages.length&&$w){$m.appendChild($w);$w.style.display=''}else msg.messages.forEach(function(m){appendMessage(m.role,m.content,m.id)});break}case'providerStatus':{$sd.className='status-dot '+(msg.available?'online':'offline');$st.textContent=msg.available?msg.provider+' connected':msg.provider+' unavailable';if(msg.model){$sm.textContent=msg.model;currentModel=msg.model;$ml.textContent='model: '+msg.model}break}case'contextUpdate':{ctxFiles=msg.files;renderContextBar();break}case'fileTree':{showFilePicker(msg.tree);break}case'agentPlan':{renderPlan(msg.plan);break}case'agentStepUpdate':{updateStep(msg.planId,msg.stepId,msg.status,msg.result);break}case'agentComplete':{setStreaming(false);appendMessage('assistant','Agent completed.\\n\\n'+msg.summary);break}case'modelList':{renderModelPicker(msg.models);if(msg.models.length&&!currentModel){$ml.textContent='model: '+msg.models[0]}break}case'modelChanged':{currentModel=msg.model;$sm.textContent=msg.model;$ml.textContent='model: '+msg.model;renderModelPicker([]);V.postMessage({type:'listModels'});break}case'agentList':{break}case'toolList':{break}case'orchestratorEvent':{handleOrchestratorEvent(msg.event);break}case'agentThinking':{$os.classList.add('visible');$ot.innerHTML='<span class="agent-badge '+msg.role+'">'+esc(msg.role)+'</span> is thinking...';break}case'agentResponse':{$os.classList.remove('visible');break}case'workflowResult':{setStreaming(false);if(msg.result&&msg.result.toolInvocations){msg.result.toolInvocations.forEach(function(inv){addToolEntry(inv)})}break}}});
function handleOrchestratorEvent(ev){if(!ev)return;if(ev.type==='agent_start'&&ev.agentId){$os.classList.add('visible');var role=(ev.data&&ev.data.role)||ev.agentId;$ot.innerHTML='<span class="agent-badge '+esc(role)+'">'+esc(role)+'</span> is working...'}if(ev.type==='agent_complete'){$os.classList.remove('visible')}if(ev.type==='tool_invoke'&&ev.data){addToolEntry(ev.data)}if(ev.type==='tool_complete'&&ev.data){updateToolEntry(ev.data)}}
function addToolEntry(inv){toolInvocations.push(inv);$tc.textContent='('+toolInvocations.length+')';var e=document.createElement('div');e.className='tool-entry';e.id='tool-'+inv.timestamp;var icon=inv.result?((inv.result.success)?'&#10003;':'&#10007;'):'&#8635;';var cls=inv.result?((inv.result.success)?'success':'error'):'running';e.innerHTML='<span class="tool-icon '+cls+'">'+icon+'</span><span class="tool-name">'+esc(inv.toolName)+'</span>'+(inv.durationMs?'<span class="tool-duration">'+inv.durationMs+'ms</span>':'');$tl.insertBefore(e,$tl.firstChild);$tp.classList.add('visible')}
function updateToolEntry(inv){var e=document.getElementById('tool-'+inv.timestamp);if(e&&inv.result){var icon=inv.result.success?'&#10003;':'&#10007;';var cls=inv.result.success?'success':'error';e.querySelector('.tool-icon').className='tool-icon '+cls;e.querySelector('.tool-icon').innerHTML=icon;if(inv.durationMs){var dur=e.querySelector('.tool-duration');if(!dur){dur=document.createElement('span');dur.className='tool-duration';e.appendChild(dur)}dur.textContent=inv.durationMs+'ms'}}}
</script></body></html>`;
  }

  private dispose(): void {
    AgentChatPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
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
