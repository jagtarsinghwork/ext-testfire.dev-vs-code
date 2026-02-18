import * as vscode from 'vscode';
import * as path from 'path';
import { AIMessage, SelectedCode, FileInfo } from '../types';
import { WorkspaceScanner } from '../workspace/WorkspaceScanner';
import { DependencyGraph } from '../workspace/DependencyGraph';
import { GitTracker } from '../workspace/GitTracker';
import { FrameworkDetector } from '../workspace/FrameworkDetector';
import { CodeParser } from './CodeParser';
import { SemanticSearch } from './SemanticSearch';
import { Logger } from '../utils/Logger';

const MAX_CONTEXT_CHARS = 12000;

/**
 * Builds comprehensive AI context from multiple sources:
 * workspace files, dependencies, git info, semantic search, code parsing.
 */
export class ContextBuilder {
  private manualContextFiles: Set<string> = new Set();
  private codeParser: CodeParser;
  private logger: Logger;

  constructor(
    private scanner: WorkspaceScanner,
    private depGraph: DependencyGraph,
    private git: GitTracker,
    private frameworkDetector: FrameworkDetector,
    private semanticSearch: SemanticSearch,
    private workspaceRoot: string
  ) {
    this.codeParser = new CodeParser();
    this.logger = new Logger('ContextBuilder');
  }

  // ─── Manual context files ─────────────────────────────────────────────

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

  // ─── Build messages ───────────────────────────────────────────────────

  async buildMessages(userMessage: string, selectedCode: SelectedCode | null): Promise<AIMessage[]> {
    const messages: AIMessage[] = [];

    // System prompt
    messages.push({ role: 'system', content: await this.buildSystemPrompt() });

    // User message with enriched context
    let enriched = '';
    let contextSize = 0;

    // 1. Selected code
    if (selectedCode) {
      const block = this.formatSelectedCode(selectedCode);
      enriched += block + '\n\n';
      contextSize += block.length;
    }

    // 2. Manual context files
    if (this.manualContextFiles.size > 0) {
      enriched += '**Referenced files:**\n';
      for (const fp of this.manualContextFiles) {
        if (contextSize > MAX_CONTEXT_CHARS) { break; }
        const file = this.scanner.getFile(fp);
        if (file) {
          const block = this.formatFile(file);
          enriched += block + '\n';
          contextSize += block.length;
        }
      }
      enriched += '\n';
    }

    // 3. Related files (imports/dependents of selected file)
    if (selectedCode) {
      const relativePath = path.relative(this.workspaceRoot, selectedCode.filePath);
      const relatedFiles = this.depGraph.getRelatedFiles(relativePath, 1);

      if (relatedFiles.length > 0) {
        enriched += '**Related files (imports/dependents):**\n';
        for (const rp of relatedFiles.slice(0, 3)) {
          if (contextSize > MAX_CONTEXT_CHARS) { break; }
          const file = this.scanner.getFile(rp);
          if (file) {
            // Include file summary (symbols) rather than full content to save tokens
            const parsed = this.codeParser.parse(file.content, rp, file.language);
            const summary = this.codeParser.getFileSummary(parsed);
            enriched += `\n--- \`${rp}\` (summary) ---\n\`\`\`\n${summary}\n\`\`\`\n`;
            contextSize += summary.length;
          }
        }
        enriched += '\n';
      }
    }

    // 4. Semantic search results (if available and query is complex)
    if (this.semanticSearch.isAvailable() && userMessage.length > 20) {
      try {
        const results = await this.semanticSearch.search(userMessage, 3);
        if (results.length > 0) {
          enriched += '**Semantically relevant code:**\n';
          for (const result of results) {
            if (contextSize > MAX_CONTEXT_CHARS) { break; }
            enriched += `\n--- \`${result.filePath}\` (L${result.startLine}-${result.endLine}, relevance: ${(result.score * 100).toFixed(0)}%) ---\n\`\`\`\n${result.chunk}\n\`\`\`\n`;
            contextSize += result.chunk.length;
          }
          enriched += '\n';
        }
      } catch { /* semantic search failed, continue without it */ }
    }

    enriched += `**User request:** ${userMessage}`;
    messages.push({ role: 'user', content: enriched });

    return messages;
  }

  /**
   * Build messages for agent steps (more structured format).
   */
  async buildAgentMessages(goal: string, stepDescription: string, previousResults: string[]): Promise<AIMessage[]> {
    const messages: AIMessage[] = [];
    messages.push({
      role: 'system',
      content: await this.buildSystemPrompt() + `\n\nYou are an autonomous coding agent. Respond with valid JSON:
{
  "reasoning": "Why you're making these changes",
  "actions": [
    { "type": "edit"|"create"|"delete", "file": "relative/path", "content": "full file content" }
  ],
  "summary": "Brief summary"
}
If no file changes are needed:
{ "reasoning": "Analysis", "actions": [], "summary": "Explanation" }`
    });

    let userMsg = `**Goal:** ${goal}\n**Current step:** ${stepDescription}\n`;

    if (previousResults.length > 0) {
      userMsg += '\n**Previous results:**\n';
      previousResults.forEach((r, i) => { userMsg += `Step ${i + 1}: ${r}\n`; });
    }

    // Add context files
    for (const fp of this.manualContextFiles) {
      const file = this.scanner.getFile(fp);
      if (file) {
        userMsg += this.formatFile(file) + '\n';
      }
    }

    messages.push({ role: 'user', content: userMsg });
    return messages;
  }

  /**
   * Get current editor selection as SelectedCode.
   */
  getSelectedCode(): SelectedCode | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) { return null; }
    return {
      text: editor.document.getText(editor.selection),
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      startLine: editor.selection.start.line + 1,
      endLine: editor.selection.end.line + 1,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async buildSystemPrompt(): Promise<string> {
    const framework = this.frameworkDetector.detect(
      new Map(this.scanner.getFiles().map(f => [f.relativePath, f]))
    );
    const fileCount = this.scanner.getFileCount();
    let gitBranch = 'unknown';
    try { gitBranch = await this.git.getBranch(); } catch { /* ignore */ }

    const openFiles = vscode.workspace.textDocuments
      .filter(d => d.uri.scheme === 'file')
      .map(d => path.relative(this.workspaceRoot, d.uri.fsPath))
      .slice(0, 10);

    let prompt = `You are TestFire AI, an expert coding assistant embedded in VS Code.

**Project:**
- Workspace: ${path.basename(this.workspaceRoot)}
- Files: ${fileCount} indexed
- Branch: ${gitBranch}`;

    if (framework) {
      prompt += `\n- Framework: ${framework.name} (${framework.type})`;
      if (framework.buildTool) { prompt += `\n- Build: ${framework.buildTool}`; }
      if (framework.testFramework) { prompt += `\n- Tests: ${framework.testFramework}`; }
      if (framework.packageManager) { prompt += `\n- Package manager: ${framework.packageManager}`; }
    }

    if (openFiles.length > 0) {
      prompt += `\n- Open: ${openFiles.join(', ')}`;
    }

    prompt += `

**Instructions:**
- Write production-quality code following project conventions
- When proposing file changes, use fenced code blocks with filepath comment:
\`\`\`language
// filepath: relative/path/to/file
<content>
\`\`\`
- Consider error handling and edge cases
- Be concise but thorough`;

    return prompt;
  }

  private formatSelectedCode(sel: SelectedCode): string {
    const relPath = path.relative(this.workspaceRoot, sel.filePath);
    return `**Selected code** in \`${relPath}\` (L${sel.startLine}-${sel.endLine}, ${sel.language}):\n\`\`\`${sel.language}\n${sel.text}\n\`\`\``;
  }

  private formatFile(file: FileInfo): string {
    return `\n--- \`${file.relativePath}\` ---\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
  }
}
