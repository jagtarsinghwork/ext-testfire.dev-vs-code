import * as vscode from 'vscode';
import { AIProvider, AIMessage } from '../types';
import { CodeParser } from '../context/CodeParser';
import { Logger } from '../utils/Logger';

/**
 * VS Code HoverProvider that shows AI-generated documentation,
 * code explanations, and improvement suggestions on hover.
 */
export class TestFireHoverProvider implements vscode.HoverProvider {
  private cache: Map<string, { content: string; timestamp: number }> =
    new Map();
  private codeParser: CodeParser;
  private logger: Logger;
  private enabled = true;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(private provider: AIProvider) {
    this.codeParser = new CodeParser();
    this.logger = new Logger('HoverProvider');
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (!this.enabled) {
      return null;
    }

    // Get the word at the position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }
    const word = document.getText(wordRange);
    if (word.length < 2) {
      return null;
    }

    // Check cache
    const cacheKey = `${document.uri.fsPath}:${position.line}:${word}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return new vscode.Hover(new vscode.MarkdownString(cached.content));
    }

    // Get local context: the function/class containing this word
    const surroundingContext = this.getSurroundingContext(
      document,
      position,
      10,
    );

    // Only provide hover for non-trivial symbols
    if (this.isTrivialKeyword(word, document.languageId)) {
      return null;
    }

    // Don't block the UI with slow AI calls - make it optional
    // For now, return a quick local analysis
    const localInfo = this.getLocalSymbolInfo(document, position, word);
    if (localInfo) {
      const content = this.formatHoverContent(
        word,
        localInfo,
        document.languageId,
      );
      this.cache.set(cacheKey, { content, timestamp: Date.now() });
      return new vscode.Hover(new vscode.MarkdownString(content));
    }

    return null;
  }

  /**
   * Get detailed AI explanation (called explicitly, not on every hover).
   */
  async getAIExplanation(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<string> {
    const code = document.getText(range);

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a concise code documentation assistant.
Explain what the given code does in 2-3 sentences.
Include: purpose, parameters, return value (if applicable).
Use Markdown formatting.`,
      },
      {
        role: 'user',
        content: `**File:** ${document.fileName} (${document.languageId})

\`\`\`${document.languageId}
${code}
\`\`\`

Explain this code.`,
      },
    ];

    try {
      return await this.provider.chat(messages);
    } catch (err: any) {
      this.logger.error(`AI explanation failed: ${err.message}`);
      return `Failed to generate explanation: ${err.message}`;
    }
  }

  private getLocalSymbolInfo(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
  ): string | null {
    const content = document.getText();
    const language = document.languageId;
    const parsed = this.codeParser.parse(
      content,
      document.uri.fsPath,
      language,
    );

    // Find the symbol
    for (const sym of parsed.symbols) {
      if (sym.name === word) {
        let info = `**${sym.kind}** \`${sym.name}\``;
        if (sym.signature) {
          info += ` ${sym.signature}`;
        }
        info += `  \nDefined at line ${sym.startLine}`;
        if (sym.docComment) {
          info += `\n\n${sym.docComment}`;
        }
        if (sym.children && sym.children.length > 0) {
          info += `\n\n**Members:** ${sym.children.map((c) => c.name).join(', ')}`;
        }
        return info;
      }
      // Check children (methods)
      if (sym.children) {
        for (const child of sym.children) {
          if (child.name === word) {
            return `**${child.kind}** \`${sym.name}.${child.name}\`${child.signature ? ' ' + child.signature : ''}\nDefined at line ${child.startLine}`;
          }
        }
      }
    }

    // Check imports
    for (const imp of parsed.imports) {
      if (imp.specifiers.includes(word)) {
        return `**import** from \`${imp.source}\`\nLine ${imp.line}`;
      }
    }

    return null;
  }

  private getSurroundingContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    lines: number,
  ): string {
    const start = Math.max(0, position.line - lines);
    const end = Math.min(document.lineCount - 1, position.line + lines);
    const result: string[] = [];
    for (let i = start; i <= end; i++) {
      result.push(document.lineAt(i).text);
    }
    return result.join('\n');
  }

  private formatHoverContent(
    word: string,
    info: string,
    _language: string,
  ): string {
    return `**TestFire AI** | ${info}`;
  }

  private isTrivialKeyword(word: string, language: string): boolean {
    const commonKeywords = new Set([
      'if',
      'else',
      'for',
      'while',
      'do',
      'switch',
      'case',
      'break',
      'continue',
      'return',
      'const',
      'let',
      'var',
      'function',
      'class',
      'import',
      'export',
      'default',
      'from',
      'new',
      'this',
      'super',
      'try',
      'catch',
      'finally',
      'throw',
      'async',
      'await',
      'yield',
      'true',
      'false',
      'null',
      'undefined',
      'void',
      'typeof',
      'instanceof',
      'in',
      'of',
      'with',
      'as',
      'is',
      'type',
      'interface',
      'enum',
      'def',
      'self',
      'cls',
      'pass',
      'lambda',
      'None',
      'True',
      'False',
      'print',
      'len',
      'range',
      'str',
      'int',
      'float',
      'bool',
      'list',
      'dict',
    ]);
    return commonKeywords.has(word);
  }
}
