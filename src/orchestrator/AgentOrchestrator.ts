import * as vscode from 'vscode';
import {
  AgentConfig,
  AgentRole,
  AgentResponse,
  WorkflowType,
  WorkflowPlan,
  WorkflowStep,
  MultiAgentResult,
  OrchestratorEvent,
  ToolInvocation,
} from '../types/agents';
import { AIProvider, AIProviderConfig, AIStreamCallback } from '../types';
import { SpecializedAgent, DEFAULT_AGENT_CONFIGS } from './SpecializedAgent';
import { ToolRegistry } from '../tools/ToolRegistry';
import {
  QueryClassifier,
  ClassificationResult,
} from '../routing/QueryClassifier';
import { Logger } from '../utils/Logger';
import { createProvider } from '../providers/aiProvider';

/**
 * Orchestrates multiple specialized agents, delegates tasks,
 * manages parallel processing, and composes final responses.
 */
export class AgentOrchestrator {
  private agents: Map<string, SpecializedAgent> = new Map();
  private eventListeners: Array<(event: OrchestratorEvent) => void> = [];
  private classifier: QueryClassifier;
  private logger: Logger;
  private cancelled = false;
  private baseUrl: string;

  constructor(
    private defaultProvider: AIProvider,
    private toolRegistry: ToolRegistry,
    private configs?: AgentConfig[],
  ) {
    this.classifier = new QueryClassifier();
    this.logger = new Logger('AgentOrchestrator');
    this.baseUrl = defaultProvider.config.baseUrl;
    this.initializeAgents(configs || DEFAULT_AGENT_CONFIGS);
  }

  /**
   * Initialize specialized agents. Each agent gets its own provider instance
   * configured for its specific model.
   */
  private initializeAgents(configs: AgentConfig[]): void {
    for (const config of configs) {
      const providerConfig: AIProviderConfig = {
        ...this.defaultProvider.config,
        model: config.model,
        maxTokens: config.maxTokens || this.defaultProvider.config.maxTokens,
        temperature:
          config.temperature ?? this.defaultProvider.config.temperature,
      };
      const provider = createProvider(providerConfig);
      const agent = new SpecializedAgent(config, provider, this.toolRegistry);
      this.agents.set(config.id, agent);
      this.logger.info(`Initialized agent: ${config.id} (${config.model})`);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Process a user request through the orchestration pipeline:
   * 1. Classify the query
   * 2. Select appropriate agent(s) or workflow
   * 3. Execute and compose responses
   */
  async processRequest(
    message: string,
    context?: string,
    onEvent?: (event: OrchestratorEvent) => void,
    streamCallback?: AIStreamCallback,
  ): Promise<MultiAgentResult> {
    this.cancelled = false;
    const start = Date.now();
    const allToolInvocations: ToolInvocation[] = [];

    if (onEvent) {
      this.eventListeners.push(onEvent);
    }

    // Classify the query
    const classification = this.classifier.classify(message);
    this.logger.info(
      `Query classified as: ${classification.type} (confidence: ${classification.confidence.toFixed(2)})`,
    );

    // Determine workflow
    const workflowType = this.mapToWorkflow(classification);
    const workflow = this.createWorkflow(workflowType, message, context);

    const responses: AgentResponse[] = [];

    // Execute workflow steps
    for (const step of workflow.steps) {
      if (this.cancelled) {
        break;
      }

      const agent = this.agents.get(step.agentRole) || this.agents.get('coder');
      if (!agent) {
        continue;
      }

      this.emit({
        type: 'agent_start',
        agentId: agent.id,
        timestamp: Date.now(),
      });

      // Build step context from previous responses
      let stepContext = context || '';
      if (step.dependsOn) {
        for (const depIdx of step.dependsOn) {
          if (responses[depIdx]) {
            stepContext += `\n\n## Previous Agent Response (${responses[depIdx].role}):\n${responses[depIdx].content}`;
          }
        }
      }

      // Use streaming only for the final step
      const isLastStep = step === workflow.steps[workflow.steps.length - 1];
      const response = await agent.chat(
        step.instruction,
        stepContext,
        isLastStep ? streamCallback : undefined,
      );

      responses.push(response);
      if (response.toolCalls) {
        allToolInvocations.push(...response.toolCalls);
      }

      this.emit({
        type: 'agent_complete',
        agentId: agent.id,
        data: response,
        timestamp: Date.now(),
      });
    }

    // Compose final response
    const finalResponse = this.composeResponse(workflowType, responses);

    if (onEvent) {
      this.eventListeners = this.eventListeners.filter((l) => l !== onEvent);
    }

    const result: MultiAgentResult = {
      workflow: workflowType,
      responses,
      finalResponse,
      toolInvocations: allToolInvocations,
      totalDurationMs: Date.now() - start,
    };

    this.emit({
      type: 'workflow_complete',
      data: result,
      timestamp: Date.now(),
    });
    return result;
  }

  /**
   * Send a message directly to a specific agent.
   */
  async chatWithAgent(
    agentId: string,
    message: string,
    context?: string,
    callback?: AIStreamCallback,
  ): Promise<AgentResponse> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    this.emit({ type: 'agent_start', agentId, timestamp: Date.now() });
    const response = await agent.chat(message, context, callback);
    this.emit({
      type: 'agent_complete',
      agentId,
      data: response,
      timestamp: Date.now(),
    });
    return response;
  }

  /**
   * Run multiple agents in parallel on the same query.
   */
  async parallelProcess(
    message: string,
    agentIds: string[],
    context?: string,
  ): Promise<AgentResponse[]> {
    const promises = agentIds.map((id) => {
      const agent = this.agents.get(id);
      if (!agent) {
        return Promise.resolve(null);
      }
      this.emit({ type: 'agent_start', agentId: id, timestamp: Date.now() });
      return agent.chat(message, context).then((response) => {
        this.emit({
          type: 'agent_complete',
          agentId: id,
          data: response,
          timestamp: Date.now(),
        });
        return response;
      });
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is AgentResponse => r !== null);
  }

  cancel(): void {
    this.cancelled = true;
    this.defaultProvider.abort();
  }

  getAgentConfigs(): AgentConfig[] {
    return Array.from(this.agents.values()).map((a) => a.config);
  }

  getAgent(id: string): SpecializedAgent | undefined {
    return this.agents.get(id);
  }

  clearAllHistory(): void {
    for (const agent of this.agents.values()) {
      agent.clearHistory();
    }
  }

  updateDefaultProvider(provider: AIProvider): void {
    this.defaultProvider = provider;
  }

  /**
   * Check which configured models are actually available on the Ollama server.
   */
  async checkModelAvailability(): Promise<Map<string, boolean>> {
    const availability = new Map<string, boolean>();
    try {
      const models = await this.defaultProvider.listModels();
      const modelSet = new Set(models.map((m) => m.toLowerCase()));
      for (const [id, agent] of this.agents) {
        availability.set(id, modelSet.has(agent.model.toLowerCase()));
      }
    } catch {
      for (const id of this.agents.keys()) {
        availability.set(id, false);
      }
    }
    return availability;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private mapToWorkflow(classification: ClassificationResult): WorkflowType {
    switch (classification.type) {
      case 'code_generation':
        return 'code_generation';
      case 'bug_finding':
        return 'debugging';
      case 'refactoring':
      case 'optimization':
        return 'review';
      case 'documentation':
        return 'documentation';
      default:
        return 'general';
    }
  }

  private createWorkflow(
    type: WorkflowType,
    message: string,
    context?: string,
  ): WorkflowPlan {
    const plans: Record<WorkflowType, WorkflowStep[]> = {
      code_generation: [
        {
          agentRole: 'planner',
          instruction: `Plan the implementation for: ${message}`,
          tools: ['get_project_structure', 'get_active_file'],
        },
        {
          agentRole: 'coder',
          instruction: `Implement the following based on the plan:\n${message}`,
          dependsOn: [0],
          tools: ['read_file', 'write_file'],
        },
        {
          agentRole: 'reviewer',
          instruction: `Review the generated code for bugs and improvements`,
          dependsOn: [1],
        },
      ],
      debugging: [
        {
          agentRole: 'reviewer',
          instruction: `Analyze this code for bugs and issues:\n${message}`,
          tools: ['read_file', 'get_diagnostics'],
        },
        {
          agentRole: 'coder',
          instruction: `Fix the identified bugs and provide corrected code`,
          dependsOn: [0],
          tools: ['read_file', 'write_file'],
        },
      ],
      review: [
        {
          agentRole: 'reviewer',
          instruction: `Review and analyze:\n${message}`,
          tools: ['read_file', 'get_diagnostics', 'analyze_code_syntax'],
        },
        {
          agentRole: 'coder',
          instruction: `Implement the suggested improvements`,
          dependsOn: [0],
        },
      ],
      documentation: [
        {
          agentRole: 'documenter',
          instruction: `Create documentation for:\n${message}`,
          tools: ['read_file', 'get_project_structure'],
        },
      ],
      general: [
        {
          agentRole: 'coder',
          instruction: message,
          tools: ['read_file', 'get_active_file', 'get_project_structure'],
        },
      ],
    };

    return {
      type,
      steps: plans[type],
      context: context ? { userContext: context } : {},
    };
  }

  private composeResponse(
    type: WorkflowType,
    responses: AgentResponse[],
  ): string {
    if (responses.length === 0) {
      return 'No response generated.';
    }
    if (responses.length === 1) {
      return responses[0].content;
    }

    // For multi-step workflows, compose a structured response
    let composed = '';

    if (type === 'code_generation' && responses.length >= 2) {
      // Plan + Implementation + Review
      if (responses[0]?.role === 'planner') {
        composed += `## 📋 Plan\n${responses[0].content}\n\n`;
      }
      const coder = responses.find((r) => r.role === 'coder');
      if (coder) {
        composed += `## 💻 Implementation\n${coder.content}\n\n`;
      }
      const reviewer = responses.find((r) => r.role === 'reviewer');
      if (reviewer) {
        composed += `## 🔍 Review\n${reviewer.content}\n`;
      }
    } else if (type === 'debugging') {
      const reviewer = responses.find((r) => r.role === 'reviewer');
      if (reviewer) {
        composed += `## 🐛 Bug Analysis\n${reviewer.content}\n\n`;
      }
      const coder = responses.find((r) => r.role === 'coder');
      if (coder) {
        composed += `## 🔧 Fix\n${coder.content}\n`;
      }
    } else {
      // Default: concatenate with headers
      for (const r of responses) {
        composed += `## ${getRoleEmoji(r.role)} ${getRoleLabel(r.role)}\n${r.content}\n\n`;
      }
    }

    return composed.trim();
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

function getRoleEmoji(role: AgentRole): string {
  const emojis: Record<AgentRole, string> = {
    coder: '💻',
    reviewer: '🔍',
    planner: '📋',
    documenter: '📝',
    quick: '⚡',
  };
  return emojis[role] || '🤖';
}

function getRoleLabel(role: AgentRole): string {
  const labels: Record<AgentRole, string> = {
    coder: 'Coder',
    reviewer: 'Reviewer',
    planner: 'Planner',
    documenter: 'Documenter',
    quick: 'Quick',
  };
  return labels[role] || role;
}
