import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectIndexer } from './projectIndexer';
import { GitManager } from './gitManager';
import { AIMessage, SelectedCode, ProjectContext } from '../types';

const MAX_CONTEXT_TOKENS = 8000; // Rough char limit for context

export class ContextManager {
  private manualContextFiles: Set<string> = new Set();

  constructor(
    private indexer: ProjectIndexer,
    private git: GitManager,
    private workspaceRoot: string
  ) {}

  addContextFile(relativePath: string): void {
    this.manualContextFiles.add(relativePath);
  }

  removeContextFile(relativePath: string): void {
    this.manualContextFiles.delete(relativePath);
  }

  getContextFiles(): string[] {
    return Array.from(this.manualContextFiles);
  }

  clearContext(): void {
    this.manualContextFiles.clear();
  }

  async buildMessages(userMessage: string, selectedCode: SelectedCode | null): Promise<AIMessage[]> {
    const messages: AIMessage[] = [];

    // System prompt with project awareness
    const systemPrompt = await this.buildSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    // Build user message with context
    let enrichedMessage = '';

    // Add selected code context
    if (selectedCode) {
      enrichedMessage += `**Currently selected code** in \`${selectedCode.filePath}\` (lines ${selectedCode.startLine}-${selectedCode.endLine}, language: ${selectedCode.language}):\n\`\`\`${selectedCode.language}\n${selectedCode.text}\n\`\`\`\n\n`;
    }

    // Add manually added context files
    if (this.manualContextFiles.size > 0) {
      enrichedMessage += '**Referenced files:**\n';
      let contextSize = 0;

      for (const filePath of this.manualContextFiles) {
        const file = this.indexer.getFile(filePath);
        if (file && contextSize + file.content.length < MAX_CONTEXT_TOKENS) {
          enrichedMessage += `\n--- \`${filePath}\` ---\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
          contextSize += file.content.length;
        }
      }
      enrichedMessage += '\n';
    }

    // Add related files context for selected code
    if (selectedCode) {
      const relativePath = path.relative(this.workspaceRoot, selectedCode.filePath);
      const relatedFiles = this.indexer.getRelatedFiles(relativePath, 1);
      let contextSize = enrichedMessage.length;

      if (relatedFiles.length > 0) {
        enrichedMessage += '**Related files (imports/dependents):**\n';
        for (const relPath of relatedFiles.slice(0, 3)) {
          const file = this.indexer.getFile(relPath);
          if (file && contextSize + file.content.length < MAX_CONTEXT_TOKENS) {
            enrichedMessage += `\n--- \`${relPath}\` ---\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
            contextSize += file.content.length;
          }
        }
        enrichedMessage += '\n';
      }
    }

    enrichedMessage += `**User request:** ${userMessage}`;
    messages.push({ role: 'user', content: enrichedMessage });

    return messages;
  }

  async buildAgentMessages(goal: string, stepDescription: string, previousResults: string[]): Promise<AIMessage[]> {
    const messages: AIMessage[] = [];

    const systemPrompt = await this.buildSystemPrompt();
    messages.push({
      role: 'system',
      content: systemPrompt + `\n\nYou are an autonomous coding agent. You must respond with valid JSON containing file changes.
When you need to create or edit files, respond in this exact format:
{
  "reasoning": "Why you're making these changes",
  "actions": [
    {
      "type": "edit" | "create" | "delete",
      "file": "relative/path/to/file",
      "content": "full new file content (for create/edit)"
    }
  ],
  "summary": "Brief summary of what was done"
}

If the step requires only analysis/explanation (no file changes), respond with:
{
  "reasoning": "Your analysis",
  "actions": [],
  "summary": "Your explanation"
}`
    });

    let userMsg = `**Goal:** ${goal}\n\n**Current step:** ${stepDescription}\n`;

    if (previousResults.length > 0) {
      userMsg += '\n**Previous step results:**\n';
      for (let i = 0; i < previousResults.length; i++) {
        userMsg += `Step ${i + 1}: ${previousResults[i]}\n`;
      }
    }

    // Add context files
    for (const filePath of this.manualContextFiles) {
      const file = this.indexer.getFile(filePath);
      if (file) {
        userMsg += `\n--- \`${filePath}\` ---\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
      }
    }

    messages.push({ role: 'user', content: userMsg });
    return messages;
  }

  getSelectedCode(): SelectedCode | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) { return null; }

    const selection = editor.selection;
    return {
      text: editor.document.getText(selection),
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      startLine: selection.start.line + 1,
      endLine: selection.end.line + 1,
    };
  }

  async getProjectContext(): Promise<ProjectContext> {
    const gitInfo = await this.git.getInfo();

    return {
      workspaceRoot: this.workspaceRoot,
      files: this.indexer.getFiles(),
      dependencies: this.indexer.getDependencyGraph(),
      gitInfo,
      openFiles: vscode.workspace.textDocuments.filter(d => d.uri.scheme === 'file'),
      selectedCode: this.getSelectedCode(),
      framework: this.indexer.getFramework(),
    };
  }

  private async buildSystemPrompt(): Promise<string> {
    const framework = this.indexer.getFramework();
    const fileCount = this.indexer.getFiles().length;
    let gitBranch = 'unknown';
    try {
      gitBranch = await this.git.getBranch();
    } catch { /* ignore */ }

    const openFiles = vscode.workspace.textDocuments
      .filter(d => d.uri.scheme === 'file')
      .map(d => path.relative(this.workspaceRoot, d.uri.fsPath))
      .slice(0, 10);

    let prompt = `You are TestFire AI, an expert coding assistant embedded in VS Code.

**Project Info:**
- Workspace: ${path.basename(this.workspaceRoot)}
- Files indexed: ${fileCount}
- Git branch: ${gitBranch}`;

    if (framework) {
      prompt += `\n- Framework: ${framework.name} (${framework.type})`;
      if (framework.buildTool) { prompt += `\n- Build tool: ${framework.buildTool}`; }
      if (framework.testFramework) { prompt += `\n- Test framework: ${framework.testFramework}`; }
    }

    if (openFiles.length > 0) {
      prompt += `\n- Open files: ${openFiles.join(', ')}`;
    }

    prompt += `

**Instructions:**
- Provide clear, concise, production-quality code
- Follow the project's existing patterns and conventions
- Use the project's language and framework idioms
- Consider error handling and edge cases
- IMPORTANT: When you suggest code changes, ALWAYS include the filepath as a comment on the first line of each code block. This enables the user to apply changes directly. Use this exact format:
\`\`\`typescript
// filepath: src/example.ts
<complete file content or changed code here>
\`\`\`
- When editing existing code, show only the relevant function/section that changed, with the filepath comment
- When creating new files, include the complete file content with the filepath comment
- You can suggest changes to multiple files — each in its own code block with filepath`;

    return prompt;
  }
}
