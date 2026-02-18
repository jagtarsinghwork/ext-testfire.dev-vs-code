import * as vscode from 'vscode';
import { AIProvider, AIMessage } from '../types';
import { Logger } from '../utils/Logger';

/**
 * VS Code CodeAction provider that suggests AI-powered fixes for diagnostics,
 * quick improvements, and auto-import suggestions.
 */
export class QuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  private logger: Logger;

  constructor(private provider: AIProvider) {
    this.logger = new Logger('QuickFixProvider');
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // For each diagnostic in range, offer an AI fix
    for (const diagnostic of context.diagnostics) {
      const fixAction = new vscode.CodeAction(
        `TestFire: AI Fix - ${this.truncate(diagnostic.message, 50)}`,
        vscode.CodeActionKind.QuickFix,
      );
      fixAction.diagnostics = [diagnostic];
      fixAction.command = {
        command: 'testfire-dev.aiFix',
        title: 'AI Fix',
        arguments: [document.uri, diagnostic],
      };
      fixAction.isPreferred = false;
      actions.push(fixAction);
    }

    // If there's a selection, offer refactoring
    if (!range.isEmpty) {
      const refactorAction = new vscode.CodeAction(
        'TestFire: AI Refactor Selection',
        vscode.CodeActionKind.Refactor,
      );
      refactorAction.command = {
        command: 'testfire-dev.aiRefactor',
        title: 'AI Refactor',
        arguments: [document.uri, range],
      };
      actions.push(refactorAction);

      // Offer to explain code
      const explainAction = new vscode.CodeAction(
        'TestFire: Explain This Code',
        vscode.CodeActionKind.Empty,
      );
      explainAction.command = {
        command: 'testfire-dev.aiExplain',
        title: 'Explain Code',
        arguments: [document.uri, range],
      };
      actions.push(explainAction);
    }

    return actions;
  }

  /**
   * Execute an AI fix for a diagnostic.
   */
  async executeFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): Promise<string | null> {
    const surroundingCode = this.getSurroundingCode(
      document,
      diagnostic.range,
      5,
    );

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a code fix assistant. Given a code error/warning, provide ONLY the fixed code.
Do not include explanations. Return just the corrected code that should replace the problematic section.
If you need to add imports, include them at the top.`,
      },
      {
        role: 'user',
        content: `**File:** ${document.fileName} (${document.languageId})
**Error:** ${diagnostic.message}
**Severity:** ${diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning'}
**Line:** ${diagnostic.range.start.line + 1}

**Code context:**
\`\`\`${document.languageId}
${surroundingCode}
\`\`\`

Provide the fixed version of the code.`,
      },
    ];

    try {
      const response = await this.provider.chat(messages);
      return this.extractCode(response);
    } catch (err: any) {
      this.logger.error(`AI fix failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Execute an AI refactoring of selected code.
   */
  async executeRefactor(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<string | null> {
    const selectedCode = document.getText(range);

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a code refactoring assistant. Refactor the given code for better readability,
performance, and maintainability. Return ONLY the refactored code, no explanations.`,
      },
      {
        role: 'user',
        content: `**File:** ${document.fileName} (${document.languageId})

\`\`\`${document.languageId}
${selectedCode}
\`\`\`

Refactor this code.`,
      },
    ];

    try {
      const response = await this.provider.chat(messages);
      return this.extractCode(response);
    } catch (err: any) {
      this.logger.error(`AI refactor failed: ${err.message}`);
      return null;
    }
  }

  private getSurroundingCode(
    document: vscode.TextDocument,
    range: vscode.Range,
    contextLines: number,
  ): string {
    const startLine = Math.max(0, range.start.line - contextLines);
    const endLine = Math.min(
      document.lineCount - 1,
      range.end.line + contextLines,
    );
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const marker =
        i >= range.start.line && i <= range.end.line ? '>>> ' : '    ';
      lines.push(`${marker}${i + 1}: ${document.lineAt(i).text}`);
    }
    return lines.join('\n');
  }

  private extractCode(response: string): string {
    const match = response.match(/```\w*\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '...' : text;
  }
}
