import { AIProvider, AgentPlan, AgentStep, AIAction, FileChange } from '../types';
import { ContextBuilder } from '../context/ContextBuilder';
import { ChainOfThought } from './ChainOfThought';
import { TaskExecutor } from './TaskExecutor';
import { Logger } from '../utils/Logger';

/**
 * Top-level agent controller: plans tasks, executes them step-by-step,
 * handles errors, shows progress, and supports per-step approval.
 */
export class AgentController {
  private currentPlan: AgentPlan | null = null;
  private cancelled = false;
  private chainOfThought: ChainOfThought;
  private logger: Logger;

  constructor(
    private provider: AIProvider,
    private contextBuilder: ContextBuilder,
    private taskExecutor: TaskExecutor
  ) {
    this.chainOfThought = new ChainOfThought(provider);
    this.logger = new Logger('AgentController');
  }

  /**
   * Create a plan by breaking the goal into steps using chain-of-thought.
   */
  async createPlan(
    goal: string,
    onUpdate: (plan: AgentPlan) => void
  ): Promise<AgentPlan> {
    const plan: AgentPlan = {
      id: `plan_${Date.now()}`,
      goal,
      steps: [],
      status: 'planning',
      createdAt: Date.now(),
    };
    this.currentPlan = plan;
    this.cancelled = false;
    onUpdate(plan);

    // Use chain-of-thought to break down the goal
    const context = this.contextBuilder.getContextFiles().join(', ') || 'No specific files selected';

    const thoughts = await this.chainOfThought.reason(goal, context, (_entry) => {
      // Could stream chain-of-thought entries to UI
    });

    plan.steps = thoughts.map((t, i) => ({
      id: i,
      description: t.action,
      reasoning: t.thought,
      action: null,
      status: 'pending' as const,
      requiresApproval: false,
    }));

    plan.status = 'awaiting_approval';
    onUpdate(plan);
    this.logger.info(`Plan created with ${plan.steps.length} steps for: ${goal}`);
    return plan;
  }

  /**
   * Execute a plan step by step.
   */
  async executePlan(
    plan: AgentPlan,
    onStepUpdate: (planId: string, stepId: number, status: AgentStep['status'], result?: string) => void
  ): Promise<string> {
    this.currentPlan = plan;
    plan.status = 'executing';
    const results: string[] = [];

    for (const step of plan.steps) {
      if (this.cancelled) {
        step.status = 'skipped';
        onStepUpdate(plan.id, step.id, 'skipped');
        continue;
      }

      step.status = 'running';
      onStepUpdate(plan.id, step.id, 'running');
      this.logger.info(`Executing step ${step.id + 1}: ${step.description}`);

      try {
        const messages = await this.contextBuilder.buildAgentMessages(
          plan.goal, step.description, results
        );

        const response = await this.provider.chat(messages);
        const parsed = this.parseJSON(response);

        if (parsed?.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          const fileChanges: FileChange[] = parsed.actions.map((a: any) => ({
            file: a.file,
            originalContent: '',
            newContent: a.content || '',
            type: a.type || 'edit',
          }));

          step.action = {
            type: parsed.actions[0].type || 'edit',
            files: fileChanges,
            description: parsed.summary || step.description,
            reasoning: parsed.reasoning,
          };

          // Apply the changes
          const result = await this.taskExecutor.applyFileChanges(fileChanges, `Agent: ${step.description}`);
          step.result = parsed.summary || result;

          // Check for errors after applying
          const errors = this.taskExecutor.getErrorCount();
          if (errors > 0) {
            step.result += ` (${errors} diagnostic errors detected)`;
          }
        } else {
          step.result = parsed?.summary || parsed?.reasoning || response.substring(0, 500);
        }

        step.status = 'completed';
        results.push(step.result || 'Done');
        onStepUpdate(plan.id, step.id, 'completed', step.result);
        this.logger.info(`Step ${step.id + 1} completed: ${step.result}`);
      } catch (error: any) {
        step.status = 'failed';
        step.error = error.message;
        results.push(`Failed: ${error.message}`);
        onStepUpdate(plan.id, step.id, 'failed', error.message);
        this.logger.error(`Step ${step.id + 1} failed: ${error.message}`);

        // Try to recover from the error
        const shouldContinue = await this.attemptRecovery(plan, step, error.message);
        if (!shouldContinue) { break; }
      }
    }

    plan.status = this.cancelled ? 'cancelled'
      : plan.steps.some(s => s.status === 'failed') ? 'failed'
      : 'completed';
    this.currentPlan = null;

    // Run tests after completion if possible
    if (plan.status === 'completed') {
      const testResult = await this.taskExecutor.runTests();
      if (!testResult.success) {
        results.push(`Tests failed: ${testResult.output.substring(0, 200)}`);
      }
    }

    return results.join('\n');
  }

  cancel(): void {
    this.cancelled = true;
    this.provider.abort();
    if (this.currentPlan) {
      this.currentPlan.status = 'cancelled';
    }
  }

  getCurrentPlan(): AgentPlan | null {
    return this.currentPlan;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async attemptRecovery(plan: AgentPlan, failedStep: AgentStep, error: string): Promise<boolean> {
    this.logger.info(`Attempting recovery for step ${failedStep.id + 1}`);

    // Simple recovery: if this isn't the last step, continue
    const isLastStep = failedStep.id === plan.steps.length - 1;
    if (!isLastStep) {
      this.logger.info('Continuing to next step despite failure');
      return true;
    }

    return false;
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
