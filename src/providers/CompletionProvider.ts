import * as vscode from 'vscode';
import { AIProvider, AIMessage } from '../types';
import { Logger } from '../utils/Logger';

/**
 * VS Code CompletionItemProvider that offers AI-powered code completions,
 * intelligent suggestions, and context-aware snippets.
 */
export class TestFireCompletionProvider
  implements vscode.CompletionItemProvider
{
  private logger: Logger;
  private enabled = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCompletion: {
    line: number;
    content: string;
    result: vscode.CompletionItem[];
  } | null = null;

  constructor(private provider: AIProvider) {
    this.logger = new Logger('CompletionProvider');
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[] | null> {
    if (!this.enabled) {
      return null;
    }

    // Only trigger on explicit invocation or dot trigger
    if (
      context.triggerKind === vscode.CompletionTriggerKind.Invoke ||
      context.triggerCharacter === '.'
    ) {
      return this.getCompletions(document, position, token);
    }

    return null;
  }

  private async getCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem[]> {
    // Get context for AI
    const prefix = this.getPrefix(document, position, 20);
    const suffix = this.getSuffix(document, position, 5);
    const currentLine = document.lineAt(position.line).text;
    const cursorPrefix = currentLine.substring(0, position.character);

    // Check cache
    if (
      this.lastCompletion &&
      this.lastCompletion.line === position.line &&
      cursorPrefix.startsWith(this.lastCompletion.content)
    ) {
      return this.lastCompletion.result;
    }

    if (token.isCancellationRequested) {
      return [];
    }

    try {
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: `You are a code completion engine. Given the code context, suggest 3-5 completions.
Return ONLY a JSON array of completion objects:
[
  { "label": "completionText", "detail": "brief description", "snippet": "text to insert" }
]
Make suggestions contextually relevant. Include proper indentation.
Do NOT include explanations outside the JSON.`,
        },
        {
          role: 'user',
          content: `**File:** ${document.fileName} (${document.languageId})

**Code before cursor:**
\`\`\`${document.languageId}
${prefix}
\`\`\`

**Current line:** \`${cursorPrefix}|\`

**Code after cursor:**
\`\`\`${document.languageId}
${suffix}
\`\`\`

Suggest completions for the cursor position.`,
        },
      ];

      const response = await this.provider.chat(messages);
      const suggestions = this.parseCompletions(response, document.languageId);

      // Cache the result
      this.lastCompletion = {
        line: position.line,
        content: cursorPrefix,
        result: suggestions,
      };
      return suggestions;
    } catch (err: any) {
      this.logger.warn(`Completion failed: ${err.message}`);
      return [];
    }
  }

  private parseCompletions(
    response: string,
    language: string,
  ): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    try {
      // Extract JSON from response
      let json: any[];
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        json = JSON.parse(match[0]);
      } else {
        return items;
      }

      for (const suggestion of json) {
        if (!suggestion.label) {
          continue;
        }

        const item = new vscode.CompletionItem(
          suggestion.label,
          vscode.CompletionItemKind.Snippet,
        );
        item.detail = suggestion.detail || 'TestFire AI';
        item.documentation = new vscode.MarkdownString(
          `*AI suggestion*\n\n${suggestion.detail || ''}`,
        );

        if (suggestion.snippet) {
          item.insertText = new vscode.SnippetString(suggestion.snippet);
        } else {
          item.insertText = suggestion.label;
        }

        item.sortText = `0_testfire_${items.length}`; // Sort at top
        item.preselect = items.length === 0; // Preselect first item
        items.push(item);
      }
    } catch {
      // If JSON parse fails, try to extract simple suggestions
      const lines = response.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines.slice(0, 5)) {
        const clean = line.replace(/^[-*]\s*/, '').trim();
        if (clean.length > 0 && clean.length < 200) {
          const item = new vscode.CompletionItem(
            clean,
            vscode.CompletionItemKind.Snippet,
          );
          item.detail = 'TestFire AI';
          items.push(item);
        }
      }
    }

    return items;
  }

  private getPrefix(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxLines: number,
  ): string {
    const startLine = Math.max(0, position.line - maxLines);
    const lines: string[] = [];
    for (let i = startLine; i <= position.line; i++) {
      if (i === position.line) {
        lines.push(document.lineAt(i).text.substring(0, position.character));
      } else {
        lines.push(document.lineAt(i).text);
      }
    }
    return lines.join('\n');
  }

  private getSuffix(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxLines: number,
  ): string {
    const endLine = Math.min(document.lineCount - 1, position.line + maxLines);
    const lines: string[] = [];
    for (let i = position.line; i <= endLine; i++) {
      if (i === position.line) {
        lines.push(document.lineAt(i).text.substring(position.character));
      } else {
        lines.push(document.lineAt(i).text);
      }
    }
    return lines.join('\n');
  }
}
