import { AIProvider, AIMessage, FileInfo } from '../types';

/**
 * Explanation Generator - Creates educational explanations for AI suggestions
 */
export class ExplanationGenerator {
  constructor(private aiProvider: AIProvider) {}

  /**
   * Generate explanation for a code change
   */
  async explainCodeChange(
    filePath: string,
    originalCode: string,
    newCode: string,
    language: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert educator explaining code changes. Be clear, concise, and educational.
Focus on:
1. Why the change was made
2. What problem it solves
3. Key concepts involved
4. Best practices applied`,
      },
      {
        role: 'user',
        content: `Explain this code change in ${filePath}:

**Original:**
\`\`\`${language}
${originalCode}
\`\`\`

**New:**
\`\`\`${language}
${newCode}
\`\`\`

Provide a clear, educational explanation.`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for a refactoring action
   */
  async explainRefactoring(
    description: string,
    affectedFiles: string[],
    reasoning?: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert software architect explaining refactoring decisions. Be thorough and educational.`,
      },
      {
        role: 'user',
        content: `Explain this refactoring:

**Description:** ${description}

**Affected files:** ${affectedFiles.join(', ')}

${reasoning ? `**Initial reasoning:** ${reasoning}` : ''}

Provide a comprehensive explanation covering:
1. The problem being addressed
2. The solution approach
3. Benefits of this refactoring
4. Potential trade-offs
5. Related patterns/best practices`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for an agent plan
   */
  async explainPlan(
    goal: string,
    steps: string[],
    estimatedDuration?: number,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert project planner explaining implementation strategies. Be clear and educational.`,
      },
      {
        role: 'user',
        content: `Explain this implementation plan:

**Goal:** ${goal}

**Steps:**
${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

${estimatedDuration ? `**Estimated duration:** ${Math.round(estimatedDuration / 1000 / 60)} minutes` : ''}

Provide an explanation covering:
1. Overall strategy
2. Why these steps are necessary
3. Order of operations rationale
4. Key risks and mitigations
5. Success criteria`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for why certain files were chosen
   */
  async explainFileSelection(
    query: string,
    selectedFiles: FileInfo[],
    totalFiles: number,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert explaining code analysis decisions. Be concise and clear.`,
      },
      {
        role: 'user',
        content: `Explain why these files were selected:

**Query:** ${query}

**Selected files (${selectedFiles.length} of ${totalFiles}):**
${selectedFiles.map((f) => `- ${f.relativePath} (${f.language})`).join('\n')}

Explain:
1. Selection criteria
2. Relevance to the query
3. What to look for in these files`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for a bug fix
   */
  async explainBugFix(
    bugDescription: string,
    fix: string,
    affectedCode: string,
    language: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert debugging instructor. Explain bug fixes clearly and educationally.`,
      },
      {
        role: 'user',
        content: `Explain this bug fix:

**Bug:** ${bugDescription}

**Fix:**
\`\`\`${language}
${fix}
\`\`\`

**Context:**
\`\`\`${language}
${affectedCode}
\`\`\`

Provide an educational explanation covering:
1. Root cause of the bug
2. How the fix addresses it
3. Why this approach was chosen
4. How to prevent similar bugs
5. Testing considerations`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for a design pattern
   */
  async explainPattern(
    patternName: string,
    codeExample: string,
    language: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert software engineer explaining design patterns. Be practical and educational.`,
      },
      {
        role: 'user',
        content: `Explain the ${patternName} pattern as seen in this code:

\`\`\`${language}
${codeExample}
\`\`\`

Cover:
1. Pattern overview
2. When to use it
3. Benefits and trade-offs
4. Key components in this example
5. Common pitfalls to avoid`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate explanation for best practices
   */
  async explainBestPractice(
    practice: string,
    beforeCode: string,
    afterCode: string,
    language: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert code reviewer explaining best practices. Be clear and actionable.`,
      },
      {
        role: 'user',
        content: `Explain this best practice: "${practice}"

**Before:**
\`\`\`${language}
${beforeCode}
\`\`\`

**After:**
\`\`\`${language}
${afterCode}
\`\`\`

Explain:
1. What the best practice is
2. Why it matters
3. Impact on code quality
4. When to apply it
5. Related practices`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate confidence explanation for a suggestion
   */
  async explainConfidence(
    suggestion: string,
    confidence: 'high' | 'medium' | 'low',
    reasoning: string,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert explaining AI confidence levels. Be transparent and honest.`,
      },
      {
        role: 'user',
        content: `Explain the confidence level for this suggestion:

**Suggestion:** ${suggestion}

**Confidence:** ${confidence}

**Reasoning:** ${reasoning}

Explain:
1. What this confidence level means
2. Factors affecting confidence
3. What to review carefully
4. When human judgment is critical`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }

  /**
   * Generate educational summary for a code review
   */
  async generateReviewSummary(
    findings: Array<{ type: string; description: string; severity: string }>,
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert code reviewer providing educational feedback. Be constructive and helpful.`,
      },
      {
        role: 'user',
        content: `Summarize these code review findings educationally:

${findings
  .map((f, i) => `${i + 1}. **${f.type}** (${f.severity}): ${f.description}`)
  .join('\n')}

Provide:
1. Overall assessment
2. Key learning points
3. Priority recommendations
4. Resources for improvement`,
      },
    ];

    return await this.aiProvider.chat(messages);
  }
}
