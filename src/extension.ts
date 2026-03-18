import * as vscode from 'vscode';
import { AIProviderConfig } from './types';

// ─── New Module Architecture ─────────────────────────────────────────────────
import { WorkspaceScanner } from './workspace/WorkspaceScanner';
import { DependencyGraph } from './workspace/DependencyGraph';
import { GitTracker } from './workspace/GitTracker';
import { FrameworkDetector } from './workspace/FrameworkDetector';
import { SemanticSearch } from './context/SemanticSearch';
import { ContextBuilder } from './context/ContextBuilder';
import { FileChangeManager } from './files/FileChangeManager';
import { MultiFileEditor } from './files/MultiFileEditor';
import { AgentController } from './agent/AgentController';
import { TaskExecutor } from './agent/TaskExecutor';
import { AgentChatPanel } from './ui/AgentChatPanel';
import { FileTreeView } from './ui/FileTreeView';
import { ProgressIndicator } from './ui/ProgressIndicator';
import { QuickFixProvider } from './providers/QuickFixProvider';
import { TestFireHoverProvider } from './providers/HoverProvider';
import { TestFireCompletionProvider } from './providers/CompletionProvider';
import { Logger } from './utils/Logger';

// ─── Multi-Agent Architecture ────────────────────────────────────────────────
import { ToolRegistry } from './tools/ToolRegistry';
import { registerFileSystemTools } from './tools/FileSystemTools';
import { registerCodeAnalysisTools } from './tools/CodeAnalysisTools';
import { registerTerminalTools } from './tools/TerminalTools';
import { registerProjectTools } from './tools/ProjectTools';
import { AgentOrchestrator } from './orchestrator/AgentOrchestrator';
import { KnowledgeBase } from './knowledge/KnowledgeBase';

// ─── Existing Providers & Features ───────────────────────────────────────────
import { createProvider } from './providers/aiProvider';
import { ChatPanel } from './views/chatPanel';
import { DiffPreviewProvider } from './views/diffPreview';
import { CodeMemory } from './features/memory/CodeMemory';
import { MemoryView } from './ui/views/MemoryView';
import { PaiMCPClient } from './mcp/paiClient';

let outputChannel: vscode.OutputChannel;
const logger = new Logger('Extension');

function log(msg: string) {
  outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  console.log(`[TestFire] ${msg}`);
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('TestFire AI');
  context.subscriptions.push(outputChannel);
  log('TestFire AI Agent activating...');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage(
      'TestFire AI: Open a workspace folder to enable full features.',
    );
    return;
  }

  log(`Workspace: ${workspaceRoot}`);

  // ─── Read config ─────────────────────────────────────────────────────────
  function getProviderConfig(): AIProviderConfig {
    const config = vscode.workspace.getConfiguration('testfire');
    const providerConfig: AIProviderConfig = {
      type: config.get('provider', 'ollama') as AIProviderConfig['type'],
      baseUrl: config.get('providerUrl', 'http://127.0.0.1:11434'),
      model: config.get('model', 'deepseek-coder:6.7b'),
      apiKey: config.get('apiKey', ''),
      maxTokens: config.get('maxTokens', 4096),
      temperature: config.get('temperature', 0.7),
    };
    log(
      `Config: provider=${providerConfig.type}, model=${providerConfig.model}, url=${providerConfig.baseUrl}`,
    );
    return providerConfig;
  }

  // ─── Initialize AI Provider ────────────────────────────────────────────
  let provider = createProvider(getProviderConfig());
  log('AI provider initialized');

  // ─── Initialize New Module Architecture ────────────────────────────────

  // Workspace modules
  const scanner = new WorkspaceScanner(workspaceRoot);
  const depGraph = new DependencyGraph(workspaceRoot);
  const git = new GitTracker(workspaceRoot);
  const frameworkDetector = new FrameworkDetector();

  // Context modules
  const semanticSearch = new SemanticSearch(provider);
  const contextBuilder = new ContextBuilder(
    scanner,
    depGraph,
    git,
    frameworkDetector,
    semanticSearch,
    workspaceRoot,
  );

  // File operation modules
  const changeManager = new FileChangeManager(workspaceRoot);
  const multiFileEditor = new MultiFileEditor(
    changeManager,
    scanner,
    workspaceRoot,
  );

  // Agent modules
  const taskExecutor = new TaskExecutor(changeManager, workspaceRoot);
  const agentController = new AgentController(
    provider,
    contextBuilder,
    taskExecutor,
  );

  // ─── Multi-Agent System ────────────────────────────────────────────────

  // Tool registry
  const toolRegistry = new ToolRegistry();
  registerFileSystemTools(toolRegistry, workspaceRoot);
  registerCodeAnalysisTools(toolRegistry);
  registerTerminalTools(toolRegistry, workspaceRoot);
  registerProjectTools(
    toolRegistry,
    workspaceRoot,
    scanner,
    depGraph,
    frameworkDetector,
  );
  log(
    `Tool registry: ${toolRegistry.getDefinitions().length} tools registered`,
  );

  // Knowledge base
  const knowledgeBase = new KnowledgeBase(provider, workspaceRoot);
  knowledgeBase.registerTools(toolRegistry);

  // Agent orchestrator
  const orchestrator = new AgentOrchestrator(provider, toolRegistry);
  log('Multi-agent orchestrator initialized');

  // UI modules
  const progressIndicator = new ProgressIndicator();
  context.subscriptions.push({ dispose: () => progressIndicator.dispose() });

  log('New module architecture initialized');

  // ─── Status bar ─────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.text = '$(loading~spin) TestFire AI - Connecting...';
  statusBar.tooltip = 'Open TestFire AI Chat';
  statusBar.command = 'testfire-dev.openChat';
  statusBar.show();
  context.subscriptions.push(statusBar);

  function updateStatusBar(connected: boolean, modelName: string) {
    if (connected) {
      statusBar.text = `$(check) TestFire AI - ${modelName}`;
      statusBar.tooltip = `Connected to ${modelName} | Click to open chat`;
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = `$(error) TestFire AI - Disconnected`;
      statusBar.tooltip = `Cannot reach provider at ${provider.config.baseUrl} | Click to open chat`;
      statusBar.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground',
      );
    }
  }

  // ─── Check provider connectivity ──────────────────────────────────────
  function checkConnection() {
    log('checkConnection: starting');
    provider
      .isAvailable()
      .then((available) => {
        if (available) {
          log(`Connected to ${provider.name} (${provider.config.model})`);
          updateStatusBar(true, provider.config.model);
          vscode.window.showInformationMessage(
            `TestFire AI: Connected to ${provider.name} (${provider.config.model})`,
          );
        } else {
          log(
            `WARNING: ${provider.name} not available at ${provider.config.baseUrl}`,
          );
          updateStatusBar(false, provider.config.model);
          vscode.window.showWarningMessage(
            `TestFire AI: Cannot reach ${provider.name} at ${provider.config.baseUrl}. Is Ollama running? Try: ollama serve`,
          );
        }
      })
      .catch((err: any) => {
        log(`ERROR checking provider: ${err.message}`);
        updateStatusBar(false, provider.config.model);
      });
  }
  checkConnection();

  // ─── Diff preview provider (legacy) ───────────────────────────────────
  const diffProvider = new DiffPreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      'testfire-preview',
      diffProvider,
    ),
  );

  // ─── Index workspace in background ────────────────────────────────────
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'TestFire: Indexing workspace...',
    },
    async () => {
      try {
        await scanner.scan();
        const filesMap = scanner.getFilesMap();
        log(`Scanned ${filesMap.size} files`);

        // Build dependency graph
        depGraph.build(filesMap);
        log('Dependency graph built');

        // Detect framework
        const framework = frameworkDetector.detect(filesMap);
        if (framework) {
          log(
            `Framework detected: ${framework.name} (${framework.version || 'unknown version'})`,
          );
        }

        // Check git status
        const isGit = await git.isGitRepo();
        if (isGit) {
          const branch = await git.getBranch();
          log(`Git repo detected, branch: ${branch}`);
        }

        // Index knowledge base in background
        knowledgeBase
          .indexProject()
          .then(() => {
            log(`Knowledge base indexed: ${knowledgeBase.chunkCount} chunks`);
          })
          .catch((err: any) => {
            log(`Knowledge base indexing error: ${err.message}`);
          });
      } catch (err: any) {
        log(`Workspace scanning error: ${err.message}`);
      }
    },
  );

  // ─── File tree sidebar view ───────────────────────────────────────────
  const fileTreeView = new FileTreeView(scanner, git, workspaceRoot);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('testfireFileTree', fileTreeView),
  );

  // ─── Language providers ───────────────────────────────────────────────

  // Quick fixes (CodeAction provider)
  const quickFixProvider = new QuickFixProvider(provider);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      quickFixProvider,
      { providedCodeActionKinds: QuickFixProvider.providedCodeActionKinds },
    ),
  );

  // Hover provider
  const hoverProvider = new TestFireHoverProvider(provider);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
  );

  // Completion provider
  const completionProvider = new TestFireCompletionProvider(provider);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file' },
      completionProvider,
      '.',
    ),
  );

  log('Language providers registered');

  // ─── Re-create provider when settings change ─────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('testfire')) {
        provider = createProvider(getProviderConfig());

        // Update all modules that hold a provider reference
        if (AgentChatPanel.currentPanel) {
          AgentChatPanel.currentPanel.updateProvider(provider);
        }
        if (ChatPanel.currentPanel) {
          ChatPanel.currentPanel.updateProvider(provider);
        }

        log('Provider reconfigured');
        checkConnection();
      }
    }),
  );

  // ─── Commands ─────────────────────────────────────────────────────────

  // Open the main chat panel (new architecture)
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.openChat', () => {
      log('Opening agent chat panel');
      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      panel.connectOrchestrator(orchestrator, knowledgeBase, toolRegistry);
    }),
  );

  // Open legacy chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.openLegacyChat', () => {
      log('Opening legacy chat panel');
      const indexer = scanner as any;
      // Legacy chat uses the old core modules; keep for backward compat
      const { ContextManager } = require('./core/contextManager');
      const { FileOperations } = require('./core/fileOperations');
      const { AgentExecutor } = require('./core/agentExecutor');
      const { ProjectIndexer } = require('./core/projectIndexer');
      const { GitManager } = require('./core/gitManager');

      const legacyIndexer = new ProjectIndexer(workspaceRoot);
      const legacyGit = new GitManager(workspaceRoot);
      const legacyCtx = new ContextManager(
        legacyIndexer,
        legacyGit,
        workspaceRoot,
      );
      const legacyFileOps = new FileOperations(workspaceRoot);
      const legacyAgent = new AgentExecutor(provider, legacyCtx, legacyFileOps);

      ChatPanel.createOrShow(
        context.extensionUri,
        provider,
        legacyCtx,
        legacyFileOps,
        legacyAgent,
        legacyIndexer,
      );
    }),
  );

  // Analyze project command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.analyzeProject', async () => {
      log('Analyzing project...');
      await progressIndicator.showProgress(
        'Analyzing project',
        4,
        async (progress) => {
          progress.step(1, 'Scanning workspace...');
          await scanner.scan();
          const filesMap = scanner.getFilesMap();

          progress.step(2, 'Building dependency graph...');
          depGraph.build(filesMap);
          const circularDeps = depGraph.getCircularDeps();

          progress.step(3, 'Detecting framework...');
          const framework = frameworkDetector.detect(filesMap);

          progress.step(4, 'Analyzing git status...');
          let gitBranch = '';
          const isGit = await git.isGitRepo();
          if (isGit) {
            gitBranch = await git.getBranch();
          }

          const mostImported = depGraph.getMostImportedFiles(5);

          let summary = `**Project Analysis**\n\n`;
          summary += `- **Files:** ${filesMap.size}\n`;
          if (framework) {
            summary += `- **Framework:** ${framework.name} ${framework.version || ''}\n`;
            if (framework.testFramework) {
              summary += `- **Test framework:** ${framework.testFramework}\n`;
            }
            if (framework.packageManager) {
              summary += `- **Package manager:** ${framework.packageManager}\n`;
            }
          }
          if (gitBranch) {
            summary += `- **Git branch:** ${gitBranch}\n`;
          }
          if (circularDeps.length > 0) {
            summary += `- **Circular dependencies:** ${circularDeps.length} detected\n`;
          }
          if (mostImported.length > 0) {
            summary += `\n**Most imported files:**\n`;
            for (const entry of mostImported) {
              summary += `  - ${entry.file} (${entry.count} imports)\n`;
            }
          }

          vscode.window.showInformationMessage(
            `Project analysis complete: ${filesMap.size} files scanned`,
          );
          log(summary);
        },
      );
    }),
  );

  // Show file tree command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.showFileTree', () => {
      fileTreeView.refresh();
      vscode.commands.executeCommand('testfireFileTree.focus');
    }),
  );

  // Generate component command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'testfire-dev.generateComponent',
      async () => {
        const componentName = await vscode.window.showInputBox({
          prompt: 'Component or module name',
          placeHolder: 'e.g., UserProfile, AuthService, PaymentForm...',
        });
        if (!componentName) {
          return;
        }

        const panel = AgentChatPanel.createOrShow(
          context.extensionUri,
          provider,
          context,
          contextBuilder,
          changeManager,
          multiFileEditor,
          agentController,
          scanner,
        );
        setTimeout(() => {
          panel['handleUserMessage'](
            `Generate a new component/module called "${componentName}" following the existing project patterns and conventions. Include proper types, exports, and any necessary boilerplate.`,
          );
        }, 500);
      },
    ),
  );

  // Refactor project command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'testfire-dev.refactorProject',
      async () => {
        const goal = await vscode.window.showInputBox({
          prompt: 'Describe the refactoring goal',
          placeHolder: 'e.g., Extract shared utilities, Split large module...',
        });
        if (!goal) {
          return;
        }

        const panel = AgentChatPanel.createOrShow(
          context.extensionUri,
          provider,
          context,
          contextBuilder,
          changeManager,
          multiFileEditor,
          agentController,
          scanner,
        );
        setTimeout(() => {
          panel['handleAgentExecution'](`Refactor: ${goal}`);
        }, 500);
      },
    ),
  );

  // Fix all issues command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.fixAllIssues', async () => {
      const diagnostics = taskExecutor.getDiagnostics();
      if (diagnostics.length === 0) {
        vscode.window.showInformationMessage(
          'No issues found in the current workspace.',
        );
        return;
      }

      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      setTimeout(() => {
        panel['handleAgentExecution'](
          `Fix all ${diagnostics.length} diagnostic issues in the workspace. Focus on errors first, then warnings.`,
        );
      }, 500);
    }),
  );

  // Generate tests command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(
          'Open a file first to generate tests for it.',
        );
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      setTimeout(() => {
        panel['handleUserMessage'](
          `Write comprehensive unit tests for the file: ${filePath}. Follow the project's testing conventions and framework.`,
        );
      }, 500);
    }),
  );

  // Add feature command (agent mode)
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.addFeature', async () => {
      const feature = await vscode.window.showInputBox({
        prompt: 'Describe the feature to add',
        placeHolder: 'e.g., Add user authentication with JWT tokens...',
      });
      if (!feature) {
        return;
      }

      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      setTimeout(() => {
        panel['handleAgentExecution'](feature);
      }, 500);
    }),
  );

  // Quick ask - select code and ask via input box
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.askAI', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'What would you like me to do?',
        placeHolder: 'e.g., Explain this, Refactor, Add tests, Fix bugs...',
      });
      if (!prompt) {
        return;
      }

      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      setTimeout(() => {
        panel['handleUserMessage'](prompt);
      }, 500);
    }),
  );

  // Predefined commands that open chat with specific prompts
  const predefinedCommands: Array<[string, string]> = [
    ['testfire-dev.explainCode', 'Explain this code in detail, line by line'],
    [
      'testfire-dev.improveCode',
      'Improve this code: make it more efficient, add error handling, and follow best practices. Return the improved code.',
    ],
    ['testfire-dev.addTests', 'Write comprehensive unit tests for this code'],
    [
      'testfire-dev.optimizeCode',
      'Optimize this code for better performance. Return the optimized code.',
    ],
    [
      'testfire-dev.documentCode',
      'Add comprehensive documentation and comments to this code. Return the documented code.',
    ],
    [
      'testfire-dev.findBugs',
      'Find potential bugs, edge cases, or security issues in this code',
    ],
    [
      'testfire-dev.refactorCode',
      'Refactor this code for better readability and maintainability. Return the refactored code.',
    ],
    [
      'testfire-dev.convertLanguage',
      'Convert this code to another language (ask which one)',
    ],
  ];

  for (const [command, instruction] of predefinedCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showErrorMessage('Please select some code first!');
          return;
        }

        AgentChatPanel.createOrShow(
          context.extensionUri,
          provider,
          context,
          contextBuilder,
          changeManager,
          multiFileEditor,
          agentController,
          scanner,
        );
        setTimeout(() => {
          AgentChatPanel.currentPanel?.['handleUserMessage'](instruction);
        }, 500);
      }),
    );
  }

  // Agent mode command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.runAgent', async () => {
      const goal = await vscode.window.showInputBox({
        prompt: 'Describe the task for the AI agent',
        placeHolder: 'e.g., Add user authentication with JWT tokens...',
      });
      if (!goal) {
        return;
      }

      const panel = AgentChatPanel.createOrShow(
        context.extensionUri,
        provider,
        context,
        contextBuilder,
        changeManager,
        multiFileEditor,
        agentController,
        scanner,
      );
      setTimeout(() => {
        panel['handleAgentExecution'](goal);
      }, 500);
    }),
  );

  // Re-index / re-scan workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.reindex', async () => {
      await progressIndicator.showProgress(
        'Re-scanning workspace',
        3,
        async (progress) => {
          progress.step(1, 'Scanning files...');
          await scanner.scan();

          progress.step(2, 'Rebuilding dependency graph...');
          const filesMap = new Map(
            scanner.getFiles().map((f) => [f.relativePath, f]),
          );
          depGraph.build(filesMap);

          progress.step(3, 'Updating file tree...');
          fileTreeView.refresh();

          vscode.window.showInformationMessage(
            `TestFire: Scanned ${scanner.getFiles().length} files`,
          );
        },
      );
    }),
  );

  // Cancel current task command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.cancelCurrentTask', () => {
      provider.abort();
      agentController.cancel();
      vscode.window.showInformationMessage('TestFire: Task cancelled');
    }),
  );

  // AI Fix command (registered by QuickFixProvider CodeActions)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'testfire-dev.aiFix',
      async (diagnostic: vscode.Diagnostic) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        await progressIndicator.showSpinner(
          'Generating AI fix...',
          async () => {
            await quickFixProvider.executeFix(editor.document, diagnostic);
          },
        );
      },
    ),
  );

  // AI Refactor command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.aiRefactor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showErrorMessage('Select code to refactor');
        return;
      }
      await progressIndicator.showSpinner(
        'Refactoring with AI...',
        async () => {
          await quickFixProvider.executeRefactor(
            editor.document,
            editor.selection,
          );
        },
      );
    }),
  );

  // AI Explain command
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.aiExplain', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showErrorMessage('Select code to explain');
        return;
      }
      const explanation = await progressIndicator.showSpinner(
        'Getting AI explanation...',
        () => hoverProvider.getAIExplanation(editor.document, editor.selection),
      );
      // Show in output channel and info message
      outputChannel.appendLine(`\n--- AI Explanation ---\n${explanation}\n`);
      outputChannel.show();
    }),
  );

  // ─── Initialize Code Memory ──────────────────────────────────────────
  let codeMemory: CodeMemory;
  let memoryView: MemoryView;
  try {
    codeMemory = new CodeMemory(context);
    memoryView = new MemoryView(codeMemory);
    log('Code Memory initialized');
  } catch (err: any) {
    log(`Code Memory init error: ${err.message}`);
    context.subscriptions.push(
      vscode.commands.registerCommand('testfire-dev.showMemory', () => {
        vscode.window.showErrorMessage('Code Memory failed to initialize');
      }),
      vscode.commands.registerCommand('testfire-dev.learnCurrentFile', () => {
        vscode.window.showErrorMessage('Code Memory failed to initialize');
      }),
      vscode.commands.registerCommand('testfire-dev.rememberPreference', () => {
        vscode.window.showErrorMessage('Code Memory failed to initialize');
      }),
    );
    log('Activation complete (with memory errors)');
    return;
  }

  // Memory commands
  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.showMemory', () => {
      memoryView.show();
    }),

    vscode.commands.registerCommand(
      'testfire-dev.learnCurrentFile',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No file open');
          return;
        }

        try {
          await codeMemory.learnFromFile(editor.document.uri.fsPath);
          vscode.window.showInformationMessage('File learned successfully!');
        } catch (err: any) {
          log(`Learn file error: ${err.message}`);
          vscode.window.showErrorMessage(
            `Failed to learn file: ${err.message}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      'testfire-dev.rememberPreference',
      async () => {
        const key = await vscode.window.showInputBox({
          prompt: 'Preference name',
        });
        if (!key) {
          return;
        }

        const value = await vscode.window.showInputBox({
          prompt: 'Preference value',
        });
        if (!value) {
          return;
        }

        try {
          await codeMemory.rememberPreference(key, value);
          vscode.window.showInformationMessage(
            `Preference saved: ${key}=${value}`,
          );
        } catch (err: any) {
          log(`Save preference error: ${err.message}`);
        }
      },
    ),
  );

  // ─── MCP Integration ──────────────────────────────────────────────────
  const paiClient = new PaiMCPClient(context);
  paiClient.start().catch((err: any) => {
    log(`MCP client start error: ${err.message}`);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('testfire-dev.usePai', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const selection = editor.selection;
      const code = editor.document.getText(selection);
      const language = editor.document.languageId;

      const response = await paiClient.analyzeCode(code, language);
      vscode.window.showInformationMessage(response.content[0].text);
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      paiClient.stop();
    },
  });

  log('Activation complete');
}

export function deactivate() {
  // Cleanup handled by disposables registered in context.subscriptions'
  console.log('TestFire AI Agent deactivated');
}
