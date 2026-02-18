import * as vscode from 'vscode';

// ═══════════════════════════════════════════════════════════════════════════
//  PROJECT & WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectContext {
  workspaceRoot: string;
  files: FileInfo[];
  dependencies: DependencyGraph;
  gitInfo: GitInfo;
  openFiles: vscode.TextDocument[];
  selectedCode: SelectedCode | null;
  framework: FrameworkInfo | null;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  content: string;
  language: string;
  lastModified: number;
  size: number;
  imports: string[];
  exports: string[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  language?: string;
  size?: number;
  status?: 'modified' | 'added' | 'deleted' | 'untracked' | 'clean';
}

export interface DependencyGraph {
  nodes: Map<string, string[]>;
  packageJson?: Record<string, unknown>;
  circularDeps: string[][];
}

export interface GitInfo {
  branch: string;
  remoteUrl: string;
  lastCommit: string;
  uncommittedChanges: GitChange[];
  recentCommits: GitCommit[];
  gitignorePatterns: string[];
}

export interface GitChange {
  file: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  diff?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: string[];
}

export interface SelectedCode {
  text: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
}

export interface FrameworkInfo {
  name: string;
  version: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'library' | 'cli' | 'unknown';
  buildTool?: string;
  testFramework?: string;
  packageManager?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CODE PARSING
// ═══════════════════════════════════════════════════════════════════════════

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'method' | 'property';
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
  children?: CodeSymbol[];
}

export interface ParsedFile {
  path: string;
  language: string;
  symbols: CodeSymbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  comments: CommentBlock[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  line: number;
}

export interface CommentBlock {
  text: string;
  startLine: number;
  endLine: number;
  isDocBlock: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEMANTIC SEARCH
// ═══════════════════════════════════════════════════════════════════════════

export interface EmbeddingEntry {
  filePath: string;
  chunk: string;
  embedding: number[];
  startLine: number;
  endLine: number;
}

export interface SearchResult {
  filePath: string;
  chunk: string;
  score: number;
  startLine: number;
  endLine: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export type AIProviderType = 'ollama' | 'openai' | 'anthropic';

export interface AIProviderConfig {
  type: AIProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  embeddingModel?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamCallback {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

export interface AIProvider {
  readonly name: string;
  readonly config: AIProviderConfig;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<string[]>;
  chat(messages: AIMessage[], callback?: AIStreamCallback): Promise<string>;
  generateEmbedding(text: string): Promise<number[]>;
  abort(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
//  AGENT / ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ActionType = 'edit' | 'create' | 'delete' | 'refactor' | 'explain' | 'test' | 'terminal';

export interface AIAction {
  type: ActionType;
  files: FileChange[];
  description: string;
  reasoning?: string;
  preview?: MultiFileEdit;
  confidence?: 'high' | 'medium' | 'low';
  warnings?: string[];
}

export interface FileChange {
  file: string;
  originalContent: string;
  newContent: string;
  type: 'create' | 'edit' | 'delete';
}

export interface AgentPlan {
  id: string;
  goal: string;
  steps: AgentStep[];
  status: 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  explanation?: string;
  estimatedDuration?: number;
  affectedFiles?: string[];
}

export interface AgentStep {
  id: number;
  description: string;
  reasoning?: string;
  action: AIAction | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval';
  result?: string;
  error?: string;
  requiresApproval?: boolean;
}

export interface ChainOfThoughtEntry {
  step: number;
  thought: string;
  action: string;
  observation: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface FileOperationEntry {
  id: string;
  timestamp: number;
  description: string;
  changes: FileChange[];
  backupPaths: Map<string, string>;
}

export interface MultiFileEdit {
  id: string;
  description: string;
  edits: SingleFileEdit[];
  status: 'pending' | 'previewing' | 'applied' | 'reverted';
}

export interface SingleFileEdit {
  file: string;
  type: 'create' | 'edit' | 'delete';
  originalContent: string;
  newContent: string;
  diff: string;
  accepted: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROGRESS TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export interface ProgressInfo {
  taskId: string;
  label: string;
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  percentage: number;
  startTime: number;
  estimatedEndTime?: number;
  cancellable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHAT / UI
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions?: AIAction[];
  plan?: AgentPlan;
  contextFiles?: string[];
  isStreaming?: boolean;
  chainOfThought?: ChainOfThoughtEntry[];
  explanation?: string;
  preview?: MultiFileEdit;
  requiresApproval?: boolean;
  approved?: boolean;
  tasks?: TaskItem[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEBVIEW MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export type WebviewMessage =
  | { type: 'sendMessage'; content: string; contextFiles?: string[] }
  | { type: 'cancelRequest' }
  | { type: 'applyAction'; actionIndex: number; messageId: string }
  | { type: 'applyAllActions'; messageId: string }
  | { type: 'undoAction'; operationId: string }
  | { type: 'newSession' }
  | { type: 'getFileTree' }
  | { type: 'addContextFile'; filePath: string }
  | { type: 'removeContextFile'; filePath: string }
  | { type: 'executeAgent'; goal: string }
  | { type: 'cancelAgent' }
  | { type: 'acceptPlan'; planId: string }
  | { type: 'rejectPlan'; planId: string }
  | { type: 'approveStep'; planId: string; stepId: number }
  | { type: 'rejectStep'; planId: string; stepId: number }
  | { type: 'acceptChange'; editId: string; fileIndex: number }
  | { type: 'rejectChange'; editId: string; fileIndex: number }
  | { type: 'applyEdit'; editId: string }
  | { type: 'ready' }
  | { type: 'listModels' }
  | { type: 'selectModel'; model: string }
  | { type: 'applyCodeBlock'; filePath: string; code: string }
  | { type: 'approveMessage'; messageId: string }
  | { type: 'rejectMessage'; messageId: string }
  | { type: 'requestExplanation'; messageId: string }
  | { type: 'updateTaskStatus'; taskId: string; status: TaskItem['status'] };

export type ExtensionMessage =
  | { type: 'streamToken'; messageId: string; token: string }
  | { type: 'streamComplete'; messageId: string; content: string; actions?: AIAction[]; explanation?: string; preview?: MultiFileEdit }
  | { type: 'streamError'; messageId: string; error: string }
  | { type: 'chatHistory'; messages: ChatMessage[] }
  | { type: 'fileTree'; tree: FileTreeNode }
  | { type: 'agentPlan'; plan: AgentPlan }
  | { type: 'agentStepUpdate'; planId: string; stepId: number; status: AgentStep['status']; result?: string }
  | { type: 'agentComplete'; planId: string; summary: string }
  | { type: 'actionApplied'; operationId: string; success: boolean; error?: string }
  | { type: 'contextUpdate'; files: string[] }
  | { type: 'providerStatus'; available: boolean; provider: string; model?: string }
  | { type: 'modelList'; models: string[] }
  | { type: 'modelChanged'; model: string }
  | { type: 'codeApplied'; filePath: string; success: boolean; error?: string }
  | { type: 'progressUpdate'; progress: ProgressInfo }
  | { type: 'changePreview'; edit: MultiFileEdit }
  | { type: 'chainOfThought'; entry: ChainOfThoughtEntry }
  | { type: 'explanation'; messageId: string; explanation: string }
  | { type: 'taskUpdate'; taskId: string; status: TaskItem['status']; result?: string; error?: string };

// ═══════════════════════════════════════════════════════════════════════════
//  TASK TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export interface TaskItem {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  order: number;
  subtasks?: TaskItem[];
  result?: string;
  error?: string;
}

export interface TaskList {
  id: string;
  title: string;
  tasks: TaskItem[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'cancelled';
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
  data?: unknown;
}
