import { AIProvider, AIMessage, ChainOfThoughtEntry } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Implements chain-of-thought reasoning for complex tasks.
 * Breaks down tasks, shows reasoning, and supports per-step approval.
 */
export class ChainOfThought {
  private entries: ChainOfThoughtEntry[] = [];
  private logger: Logger;

  constructor(private provider: AIProvider) {
    this.logger = new Logger('ChainOfThought');
  }

  /**
   * Break a complex goal into a sequence of reasoning steps.
   */
  async reason(
    goal: string,
    context: string,
    onStep: (entry: ChainOfThoughtEntry) => void
  ): Promise<ChainOfThoughtEntry[]> {
    this.entries = [];

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a reasoning agent. Think step-by-step about how to accomplish the user's goal.
For each step, provide your thought process, the action to take, and what you observe/expect.

Respond in this JSON format:
{
  "steps": [
    {
      "thought": "What I'm thinking about this step",
      "action": "The specific action to take",
      "observation": "What I expect to happen or discover"
    }
  ]
}

Be specific about file paths and code changes. Limit to 3-8 steps.`
      },
      {
        role: 'user',
        content: `**Goal:** ${goal}\n\n**Context:**\n${context}`
      }
    ];

    try {
      const response = await this.provider.chat(messages);
      const parsed = this.parseJSON(response);

      if (parsed?.steps && Array.isArray(parsed.steps)) {
        for (let i = 0; i < parsed.steps.length; i++) {
          const step = parsed.steps[i];
          const entry: ChainOfThoughtEntry = {
            step: i + 1,
            thought: step.thought || '',
            action: step.action || '',
            observation: step.observation || '',
            timestamp: Date.now(),
          };
          this.entries.push(entry);
          onStep(entry);
        }
      }
    } catch (err: any) {
      this.logger.error(`Reasoning failed: ${err.message}`);
      const fallbackEntry: ChainOfThoughtEntry = {
        step: 1,
        thought: `Attempting to: ${goal}`,
        action: goal,
        observation: 'Will execute directly',
        timestamp: Date.now(),
      };
      this.entries.push(fallbackEntry);
      onStep(fallbackEntry);
    }

    return this.entries;
  }

  /**
   * Refine a specific step based on user feedback.
   */
  async refineStep(
    stepIndex: number,
    feedback: string,
    context: string
  ): Promise<ChainOfThoughtEntry> {
    const step = this.entries[stepIndex];
    if (!step) { throw new Error(`Step ${stepIndex} not found`); }

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'Refine the action based on user feedback. Respond with JSON: { "thought": "...", "action": "...", "observation": "..." }'
      },
      {
        role: 'user',
        content: `**Original step:** ${step.action}\n**Feedback:** ${feedback}\n**Context:** ${context}`
      }
    ];

    const response = await this.provider.chat(messages);
    const parsed = this.parseJSON(response);

    if (parsed) {
      const refined: ChainOfThoughtEntry = {
        step: step.step,
        thought: parsed.thought || step.thought,
        action: parsed.action || step.action,
        observation: parsed.observation || step.observation,
        timestamp: Date.now(),
      };
      this.entries[stepIndex] = refined;
      return refined;
    }

    return step;
  }

  getEntries(): ChainOfThoughtEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  private parseJSON(text: string): any {
    try { return JSON.parse(text); } catch { /* continue */ }
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) { try { return JSON.parse(match[1]); } catch { /* continue */ } }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch { /* continue */ } }
    return null;
  }
}
