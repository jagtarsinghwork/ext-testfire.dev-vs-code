import {
  AgentConfig,
  AgentResponse,
  AgentRole,
  ToolInvocation,
} from '../types/agents';
import { AIProvider, AIMessage, AIStreamCallback } from '../types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { Logger } from '../utils/Logger';

/**
 * A specialized agent wrapping an AI model with a specific role, system prompt,
 * and the ability to invoke tools.
 */
export class SpecializedAgent {
  private conversationHistory: AIMessage[] = [];
  private logger: Logger;

  constructor(
    readonly config: AgentConfig,
    private provider: AIProvider,
    private toolRegistry: ToolRegistry,
  ) {
    this.logger = new Logger(`Agent:${config.role}`);
  }

  get id(): string {
    return this.config.id;
  }
  get role(): AgentRole {
    return this.config.role;
  }
  get model(): string {
    return this.config.model;
  }

  /**
   * Send a message to this agent and get a response.
   * Supports tool calling via structured JSON in the response.
   */
  async chat(
    userMessage: string,
    context?: string,
    callback?: AIStreamCallback,
  ): Promise<AgentResponse> {
    const start = Date.now();
    const toolInvocations: ToolInvocation[] = [];

    const messages: AIMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      ...this.conversationHistory.slice(-10), // Keep last 10 messages for memory
      { role: 'user', content: userMessage },
    ];

    try {
      let response: string;
      if (callback) {
        response = await this.provider.chat(messages, callback);
      } else {
        response = await this.provider.chat(messages);
      }

      // Check if the response contains tool calls
      const toolCallResult = await this.processToolCalls(response);
      if (toolCallResult.toolCalls.length > 0) {
        toolInvocations.push(...toolCallResult.toolCalls);

        // If tools were called, send results back for a follow-up response
        if (toolCallResult.needsFollowUp) {
          const followUpMessages: AIMessage[] = [
            ...messages,
            { role: 'assistant', content: response },
            {
              role: 'user',
              content: `Tool results:\n${toolCallResult.resultsText}\n\nPlease provide your final response incorporating these tool results.`,
            },
          ];
          response = await this.provider.chat(followUpMessages);
        }
      }

      // Update conversation history
      this.conversationHistory.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response },
      );

      return {
        agentId: this.config.id,
        role: this.config.role,
        content: response,
        model: this.config.model,
        durationMs: Date.now() - start,
        toolCalls: toolInvocations.length > 0 ? toolInvocations : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Chat failed: ${err.message}`);
      return {
        agentId: this.config.id,
        role: this.config.role,
        content: `Error: ${err.message}`,
        model: this.config.model,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Reset conversation history for this agent.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  updateProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  private buildSystemPrompt(context?: string): string {
    let prompt = this.config.systemPrompt;

    // Add available tools description
    const toolsDesc = this.toolRegistry.formatForPrompt();
    prompt += `\n\n## Available Tools\n${toolsDesc}\n\nTo use a tool, include a JSON block in your response:\n\`\`\`tool_call\n{"tool": "tool_name", "params": {"param1": "value1"}}\n\`\`\`\n`;

    if (context) {
      prompt += `\n\n## Context\n${context}`;
    }

    return prompt;
  }

  /**
   * Parse and execute tool calls from agent response.
   */
  private async processToolCalls(response: string): Promise<{
    toolCalls: ToolInvocation[];
    needsFollowUp: boolean;
    resultsText: string;
  }> {
    const toolCalls: ToolInvocation[] = [];
    const results: string[] = [];

    // Match tool_call code blocks
    const toolCallRegex = /```tool_call\s*\n?([\s\S]*?)\n?```/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool && typeof parsed.tool === 'string') {
          const toolDef = this.toolRegistry.getDefinition(parsed.tool);
          if (!toolDef) {
            results.push(`Tool "${parsed.tool}" not found`);
            continue;
          }

          // Check if tool requires approval (skip for now, could integrate UI approval)
          if (toolDef.requiresApproval) {
            this.logger.info(
              `Tool ${parsed.tool} requires approval, auto-approving in agent context`,
            );
          }

          const result = await this.toolRegistry.invoke(
            parsed.tool,
            parsed.params || {},
          );
          toolCalls.push({
            toolName: parsed.tool,
            parameters: parsed.params || {},
            result,
            timestamp: Date.now(),
          });
          results.push(
            `${parsed.tool}: ${result.success ? JSON.stringify(result.data).substring(0, 1000) : result.error}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Failed to parse tool call: ${err.message}`);
      }
    }

    return {
      toolCalls,
      needsFollowUp: toolCalls.length > 0,
      resultsText: results.join('\n\n'),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEFAULT AGENT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'coder',
    role: 'coder',
    model: 'deepseek-coder:6.7b',
    description:
      'Expert software engineer for code generation and implementation',
    strengths: ['code generation', 'implementation', 'algorithms', 'debugging'],
    temperature: 0.3,
    systemPrompt: `You are an expert software engineer. Write production-ready code with error handling, type hints, and comprehensive comments. Follow best practices and design patterns.

When writing code:
1. Explain your approach first
2. Write clean, readable code
3. Include error handling
4. Add TypeScript types where applicable
5. Follow the project's existing patterns

When you need to read or write files, analyze code, or run commands, use the available tools.`,
  },
  {
    id: 'reviewer',
    role: 'reviewer',
    model: 'codellama:7b',
    description: 'Senior code reviewer for bugs, security, and quality',
    strengths: [
      'code review',
      'bug finding',
      'security analysis',
      'optimization',
    ],
    temperature: 0.2,
    systemPrompt: `You are a senior code reviewer. Analyze code for:
1. Bugs and logic errors
2. Security vulnerabilities (OWASP Top 10)
3. Performance issues and bottlenecks
4. Style violations and code smells
5. Missing error handling

Provide specific line-by-line feedback with severity levels (critical/warning/info).
Be constructive and educational. Suggest concrete improvements.`,
  },
  {
    id: 'planner',
    role: 'planner',
    model: 'qwen2:7b',
    description: 'Task planner for breaking down complex problems',
    strengths: [
      'task decomposition',
      'architecture',
      'planning',
      'dependencies',
    ],
    temperature: 0.4,
    systemPrompt: `You break down complex programming tasks into step-by-step plans.

For each task:
1. Analyze requirements and constraints  
2. Identify dependencies and potential issues
3. Create ordered steps with clear descriptions
4. Consider edge cases and error scenarios
5. Estimate complexity for each step

Output structured plans in this format:
## Plan: [Task Name]
### Steps:
1. **[Step Title]** - Description (complexity: low/medium/high)
   - Files affected: [list]
   - Dependencies: [list]
2. ...

### Risks & Mitigations:
- [Risk] → [Mitigation]`,
  },
  {
    id: 'documenter',
    role: 'documenter',
    model: 'llama3:8b',
    description: 'Documentation specialist for docs, comments, and tutorials',
    strengths: ['documentation', 'comments', 'README', 'API docs', 'tutorials'],
    temperature: 0.5,
    systemPrompt: `You create clear, comprehensive documentation. You write:
1. README files with setup instructions and usage examples
2. API documentation with parameter descriptions
3. Code comments explaining the "why" not just the "what"
4. JSDoc/TSDoc annotations
5. Tutorials and guides

Use clear language, include code examples, and organize content with proper headings.
Match the documentation style of the existing project.`,
  },
  {
    id: 'quick',
    role: 'quick',
    model: 'phi:2.7b',
    description: 'Lightweight agent for quick responses and simple tasks',
    strengths: ['quick answers', 'simple tasks', 'lookups', 'formatting'],
    temperature: 0.3,
    maxTokens: 1024,
    systemPrompt: `You are a fast, concise assistant. Provide brief, accurate responses.
Keep answers short and to the point. If a task needs deeper analysis, say so.`,
  },
];
