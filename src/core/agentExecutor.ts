import { AIProvider, AIMessage, AgentPlan, AgentStep, AIAction, FileChange } from '../types';
import { ContextManager } from './contextManager';
import { FileOperations } from './fileOperations';

export class AgentExecutor {
  private currentPlan: AgentPlan | null = null;
  private cancelled = false;

  constructor(
    private provider: AIProvider,
    private contextManager: ContextManager,
    private fileOps: FileOperations
  ) {}

  async createPlan(goal: string, onUpdate: (plan: AgentPlan) => void): Promise<AgentPlan> {
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

    // Ask AI to break down the goal into steps
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an AI coding agent planner. Break down the user's goal into concrete, actionable steps.

Each step should be a single, specific action. Always include these kinds of steps when relevant:
1. **Analyze** - Read existing code to understand current state
2. **Plan** - Identify exactly what files need to change
3. **Implement** - Create or modify specific files (include file paths)
4. **Integrate** - Update imports, exports, and connections between files
5. **Test** - Verify changes work (suggest test commands or write test files)

Respond with a JSON object:
{
  "steps": [
    "Analyze the current project structure and identify relevant files",
    "Create src/components/Button.tsx with the button component",
    "Add styles in src/components/Button.css",
    "Update src/components/index.ts to export the new component",
    "Write unit tests in src/components/__tests__/Button.test.tsx",
    "Verify the build passes with no errors"
  ]
}
Keep it to 3-8 steps. Be specific about file paths and actions.`
      },
      { role: 'user', content: `Goal: ${goal}` }
    ];

    try {
      const response = await this.provider.chat(messages);
      const parsed = this.parseJSON(response);

      if (parsed?.steps && Array.isArray(parsed.steps)) {
        plan.steps = parsed.steps.map((desc: string, i: number): AgentStep => ({
          id: i,
          description: desc,
          action: null,
          status: 'pending',
        }));
      } else {
        // Fallback: single step
        plan.steps = [{
          id: 0,
          description: goal,
          action: null,
          status: 'pending',
        }];
      }

      plan.status = 'planning';
      onUpdate(plan);
      return plan;
    } catch (error: any) {
      plan.status = 'failed';
      plan.steps = [{ id: 0, description: goal, action: null, status: 'failed', error: error.message }];
      onUpdate(plan);
      return plan;
    }
  }

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

      try {
        const messages = await this.contextManager.buildAgentMessages(
          plan.goal,
          step.description,
          results
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
          await this.fileOps.applyChanges(fileChanges, `Agent: ${step.description}`);
          step.result = parsed.summary || 'Changes applied successfully';
        } else {
          step.result = parsed?.summary || parsed?.reasoning || response.substring(0, 500);
        }

        step.status = 'completed';
        results.push(step.result || 'Done');
        onStepUpdate(plan.id, step.id, 'completed', step.result);
      } catch (error: any) {
        step.status = 'failed';
        step.error = error.message;
        results.push(`Failed: ${error.message}`);
        onStepUpdate(plan.id, step.id, 'failed', error.message);
      }
    }

    plan.status = this.cancelled ? 'cancelled' : (plan.steps.some(s => s.status === 'failed') ? 'failed' : 'completed');
    this.currentPlan = null;

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

  private parseJSON(text: string): any {
    // Try to extract JSON from the response
    // First try direct parse
    try {
      return JSON.parse(text);
    } catch { /* continue */ }

    // Try to find JSON in code blocks
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch { /* continue */ }
    }

    // Try to find JSON object in text
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch { /* continue */ }
    }

    return null;
  }
}
