import { AIMessage, AIStreamCallback } from './index';

// ═══════════════════════════════════════════════════════════════════════════
//  MULTI-AGENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AgentRole =
  | 'coder'
  | 'reviewer'
  | 'planner'
  | 'documenter'
  | 'quick';

export interface AgentConfig {
  id: string;
  role: AgentRole;
  model: string;
  systemPrompt: string;
  description: string;
  strengths: string[];
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResponse {
  agentId: string;
  role: AgentRole;
  content: string;
  model: string;
  durationMs: number;
  toolCalls?: ToolInvocation[];
  confidence?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOOL SYSTEM TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ToolDefinition {
  name: string;
  description: string;
  category:
    | 'filesystem'
    | 'code_analysis'
    | 'terminal'
    | 'project'
    | 'knowledge';
  parameters: ToolParameter[];
  requiresApproval?: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolInvocation {
  toolName: string;
  parameters: Record<string, unknown>;
  result?: ToolResult;
  timestamp: number;
  durationMs?: number;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ORCHESTRATOR TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowType =
  | 'code_generation'
  | 'debugging'
  | 'review'
  | 'documentation'
  | 'general';

export interface WorkflowStep {
  agentRole: AgentRole;
  instruction: string;
  dependsOn?: number[];
  tools?: string[];
}

export interface WorkflowPlan {
  type: WorkflowType;
  steps: WorkflowStep[];
  context: Record<string, string>;
}

export interface OrchestratorEvent {
  type:
    | 'agent_start'
    | 'agent_complete'
    | 'agent_error'
    | 'tool_invoke'
    | 'tool_complete'
    | 'workflow_complete';
  agentId?: string;
  data?: unknown;
  timestamp: number;
}

export interface MultiAgentResult {
  workflow: WorkflowType;
  responses: AgentResponse[];
  finalResponse: string;
  toolInvocations: ToolInvocation[];
  totalDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  KNOWLEDGE BASE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CodeChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  symbols: string[];
  embedding?: number[];
}

export interface KnowledgeSearchResult {
  chunk: CodeChunk;
  score: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEBVIEW MESSAGE EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════

export type AgentWebviewMessage =
  | { type: 'switchAgent'; agentId: string }
  | { type: 'runWorkflow'; workflowType: WorkflowType; input: string }
  | { type: 'getAgents' }
  | { type: 'getTools' }
  | { type: 'cancelWorkflow' }
  | { type: 'approveToolCall'; invocationId: string }
  | { type: 'rejectToolCall'; invocationId: string };

export type AgentExtensionMessage =
  | { type: 'agentList'; agents: AgentConfig[] }
  | { type: 'toolList'; tools: ToolDefinition[] }
  | { type: 'agentThinking'; agentId: string; role: AgentRole }
  | { type: 'agentResponse'; response: AgentResponse }
  | { type: 'toolInvoked'; invocation: ToolInvocation }
  | { type: 'toolApprovalRequired'; invocation: ToolInvocation }
  | { type: 'workflowResult'; result: MultiAgentResult }
  | { type: 'workflowError'; error: string }
  | { type: 'orchestratorEvent'; event: OrchestratorEvent };
