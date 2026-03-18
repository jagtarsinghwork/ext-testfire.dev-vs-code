import { ToolDefinition, ToolResult, ToolInvocation } from '../types/agents';
import { Logger } from '../utils/Logger';

export type ToolHandler = (
  params: Record<string, unknown>,
) => Promise<ToolResult>;

/**
 * Central registry for all tools that agents can invoke.
 * Tools are registered with definitions and handler functions.
 */
export class ToolRegistry {
  private tools: Map<
    string,
    { definition: ToolDefinition; handler: ToolHandler }
  > = new Map();
  private invocationLog: ToolInvocation[] = [];
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ToolRegistry');
  }

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    this.logger.info(`Registered tool: ${definition.name}`);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return this.getDefinitions().filter((t) => t.category === category);
  }

  async invoke(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, data: null, error: `Tool not found: ${name}` };
    }

    const invocation: ToolInvocation = {
      toolName: name,
      parameters: params,
      timestamp: Date.now(),
    };

    this.logger.info(`Invoking tool: ${name}`, params);
    const start = Date.now();

    try {
      const result = await tool.handler(params);
      invocation.result = result;
      invocation.durationMs = Date.now() - start;
      this.invocationLog.push(invocation);
      return result;
    } catch (err: any) {
      const result: ToolResult = {
        success: false,
        data: null,
        error: err.message,
      };
      invocation.result = result;
      invocation.durationMs = Date.now() - start;
      this.invocationLog.push(invocation);
      this.logger.error(`Tool ${name} failed: ${err.message}`);
      return result;
    }
  }

  getInvocationLog(): ToolInvocation[] {
    return [...this.invocationLog];
  }

  clearLog(): void {
    this.invocationLog = [];
  }

  /**
   * Format tool definitions for injection into agent system prompts.
   */
  formatForPrompt(category?: ToolDefinition['category']): string {
    const defs = category
      ? this.getToolsByCategory(category)
      : this.getDefinitions();
    if (defs.length === 0) {
      return 'No tools available.';
    }

    let text = 'Available tools:\n';
    for (const def of defs) {
      text += `\n- **${def.name}**: ${def.description}\n`;
      if (def.parameters.length > 0) {
        text += '  Parameters:\n';
        for (const p of def.parameters) {
          text += `    - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}\n`;
        }
      }
    }
    return text;
  }
}
