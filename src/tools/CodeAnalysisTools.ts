import * as vscode from 'vscode';
import { ToolDefinition, ToolResult } from '../types/agents';
import { ToolRegistry } from './ToolRegistry';
import { Logger } from '../utils/Logger';

const logger = new Logger('CodeAnalysisTools');

/**
 * Register code analysis tools with the tool registry.
 */
export function registerCodeAnalysisTools(registry: ToolRegistry): void {
  registry.register(analyzeSyntaxDef, async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = (params.language as string) || 'typescript';
    try {
      const analysis = analyzeCodeStructure(code, language);
      return { success: true, data: analysis };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Analysis failed: ${err.message}`,
      };
    }
  });

  registry.register(findDefinitionsDef, async (params): Promise<ToolResult> => {
    const symbol = params.symbol as string;
    try {
      const locations: Array<{ file: string; line: number; text: string }> = [];
      const uris = await vscode.workspace.findFiles(
        '**/*.{ts,js,tsx,jsx,py,java,go}',
        '**/node_modules/**',
        200,
      );
      const regex = new RegExp(
        `\\b(function|class|interface|type|const|let|var|def|func)\\s+${escapeRegex(symbol)}\\b`,
        'g',
      );

      for (const uri of uris) {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              locations.push({
                file: vscode.workspace.asRelativePath(uri),
                line: i + 1,
                text: lines[i].trim().substring(0, 200),
              });
            }
            regex.lastIndex = 0;
          }
        } catch {
          /* skip */
        }
      }
      return { success: true, data: locations };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Search failed: ${err.message}`,
      };
    }
  });

  registry.register(getDiagnosticsDef, async (params): Promise<ToolResult> => {
    const filePath = params.filePath as string | undefined;
    const results: Array<{
      file: string;
      line: number;
      message: string;
      severity: string;
    }> = [];
    const allDiagnostics = vscode.languages.getDiagnostics();

    for (const [uri, diagnostics] of allDiagnostics) {
      if (uri.scheme !== 'file') {
        continue;
      }
      const relativePath = vscode.workspace.asRelativePath(uri);
      if (filePath && relativePath !== filePath) {
        continue;
      }

      for (const d of diagnostics) {
        if (d.severity <= vscode.DiagnosticSeverity.Warning) {
          results.push({
            file: relativePath,
            line: d.range.start.line + 1,
            message: d.message,
            severity:
              d.severity === vscode.DiagnosticSeverity.Error
                ? 'error'
                : 'warning',
          });
        }
      }
    }
    return { success: true, data: results };
  });

  registry.register(getSymbolsDef, async (params): Promise<ToolResult> => {
    const filePath = params.filePath as string;
    try {
      const uris = await vscode.workspace.findFiles(filePath, null, 1);
      if (uris.length === 0) {
        return { success: false, data: null, error: 'File not found' };
      }
      const doc = await vscode.workspace.openTextDocument(uris[0]);
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >('vscode.executeDocumentSymbolProvider', doc.uri);
      if (!symbols) {
        return { success: true, data: [] };
      }
      const formatted = flattenSymbols(symbols);
      return { success: true, data: formatted };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Symbol search failed: ${err.message}`,
      };
    }
  });

  registry.register(
    getReferencesCountDef,
    async (params): Promise<ToolResult> => {
      const symbol = params.symbol as string;
      try {
        const uris = await vscode.workspace.findFiles(
          '**/*.{ts,js,tsx,jsx,py}',
          '**/node_modules/**',
          500,
        );
        let count = 0;
        const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g');
        for (const uri of uris) {
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const matches = doc.getText().match(regex);
            if (matches) {
              count += matches.length;
            }
          } catch {
            /* skip */
          }
        }
        return { success: true, data: { symbol, referenceCount: count } };
      } catch (err: any) {
        return { success: false, data: null, error: err.message };
      }
    },
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function analyzeCodeStructure(
  code: string,
  language: string,
): Record<string, unknown> {
  const lines = code.split('\n');
  const result: Record<string, unknown> = {
    lineCount: lines.length,
    language,
    functions: [] as string[],
    classes: [] as string[],
    imports: [] as string[],
    exports: [] as string[],
    complexity: 'low' as string,
  };

  let branchCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Functions
    const funcMatch = trimmed.match(
      /(?:function|async\s+function)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(|def\s+(\w+)|func\s+(\w+)/,
    );
    if (funcMatch) {
      (result.functions as string[]).push(
        funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4],
      );
    }

    // Classes
    const classMatch = trimmed.match(/class\s+(\w+)/);
    if (classMatch) {
      (result.classes as string[]).push(classMatch[1]);
    }

    // Imports
    if (
      /^import\s/.test(trimmed) ||
      /^from\s/.test(trimmed) ||
      /require\(/.test(trimmed)
    ) {
      (result.imports as string[]).push(trimmed.substring(0, 100));
    }

    // Exports
    if (/^export\s/.test(trimmed)) {
      (result.exports as string[]).push(trimmed.substring(0, 100));
    }

    // Complexity
    if (/\b(if|else|for|while|switch|catch|&&|\|\||\?)\b/.test(trimmed)) {
      branchCount++;
    }
  }

  result.complexity =
    branchCount < 5 ? 'low' : branchCount < 15 ? 'medium' : 'high';
  return result;
}

function flattenSymbols(
  symbols: vscode.DocumentSymbol[],
  prefix = '',
): Array<{ name: string; kind: string; range: string }> {
  const results: Array<{ name: string; kind: string; range: string }> = [];
  for (const s of symbols) {
    results.push({
      name: prefix ? `${prefix}.${s.name}` : s.name,
      kind: vscode.SymbolKind[s.kind],
      range: `L${s.range.start.line + 1}-L${s.range.end.line + 1}`,
    });
    if (s.children?.length) {
      results.push(
        ...flattenSymbols(s.children, prefix ? `${prefix}.${s.name}` : s.name),
      );
    }
  }
  return results;
}

// ─── Tool Definitions ────────────────────────────────────────────────────

const analyzeSyntaxDef: ToolDefinition = {
  name: 'analyze_code_syntax',
  description:
    'Analyze code structure: functions, classes, imports, complexity',
  category: 'code_analysis',
  parameters: [
    {
      name: 'code',
      type: 'string',
      description: 'Code to analyze',
      required: true,
    },
    {
      name: 'language',
      type: 'string',
      description: 'Programming language',
      required: false,
    },
  ],
};

const findDefinitionsDef: ToolDefinition = {
  name: 'find_definitions',
  description: 'Find definitions of a symbol across the workspace',
  category: 'code_analysis',
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Symbol name to find',
      required: true,
    },
  ],
};

const getDiagnosticsDef: ToolDefinition = {
  name: 'get_diagnostics',
  description: 'Get VS Code diagnostics (errors/warnings) for files',
  category: 'code_analysis',
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'Specific file (omit for all)',
      required: false,
    },
  ],
};

const getSymbolsDef: ToolDefinition = {
  name: 'get_symbols',
  description: 'Get document symbols (functions, classes, etc.) from a file',
  category: 'code_analysis',
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'Relative file path',
      required: true,
    },
  ],
};

const getReferencesCountDef: ToolDefinition = {
  name: 'get_references_count',
  description: 'Count how many times a symbol is referenced in the workspace',
  category: 'code_analysis',
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Symbol name',
      required: true,
    },
  ],
};
