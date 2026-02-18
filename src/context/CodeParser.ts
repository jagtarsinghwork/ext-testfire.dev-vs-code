import { CodeSymbol, ParsedFile, ImportInfo, ExportInfo, CommentBlock } from '../types';

/**
 * Parses source files to extract functions, classes, interfaces, imports, exports, and comments.
 * Uses regex-based parsing (no external AST library needed).
 */
export class CodeParser {

  /**
   * Parse a source file into structured symbols.
   */
  parse(content: string, filePath: string, language: string): ParsedFile {
    return {
      path: filePath,
      language,
      symbols: this.extractSymbols(content, language),
      imports: this.extractImports(content, language),
      exports: this.extractExports(content, language),
      comments: this.extractComments(content, language),
    };
  }

  /**
   * Extract all code symbols (functions, classes, interfaces, etc.)
   */
  extractSymbols(content: string, language: string): CodeSymbol[] {
    switch (language) {
      case 'typescript':
      case 'typescriptreact':
      case 'javascript':
      case 'javascriptreact':
        return this.extractJSSymbols(content);
      case 'python':
        return this.extractPythonSymbols(content);
      case 'go':
        return this.extractGoSymbols(content);
      case 'rust':
        return this.extractRustSymbols(content);
      default:
        return this.extractGenericSymbols(content);
    }
  }

  /**
   * Get a summary of the file's structure (for AI context).
   */
  getFileSummary(parsed: ParsedFile): string {
    const lines: string[] = [];
    lines.push(`File: ${parsed.path} (${parsed.language})`);

    if (parsed.imports.length > 0) {
      lines.push(`Imports: ${parsed.imports.map(i => i.source).join(', ')}`);
    }

    for (const sym of parsed.symbols) {
      const doc = sym.docComment ? ` - ${sym.docComment.split('\n')[0]}` : '';
      lines.push(`  ${sym.kind} ${sym.name} (L${sym.startLine}-${sym.endLine})${doc}`);
      if (sym.children) {
        for (const child of sym.children) {
          lines.push(`    ${child.kind} ${child.name} (L${child.startLine})`);
        }
      }
    }

    if (parsed.exports.length > 0) {
      lines.push(`Exports: ${parsed.exports.map(e => e.name).join(', ')}`);
    }

    return lines.join('\n');
  }

  // ─── JS/TS ──────────────────────────────────────────────────────────────

  private extractJSSymbols(content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    // Functions (regular, arrow, async)
    const funcRegex = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/;
    const arrowRegex = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/;
    const classRegex = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/;
    const interfaceRegex = /^(?:export\s+)?(?:interface|type)\s+(\w+)/;
    const enumRegex = /^(?:export\s+)?enum\s+(\w+)/;

    let currentClass: CodeSymbol | null = null;
    let braceDepth = 0;
    let classStartDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Track brace depth
      for (const ch of line) {
        if (ch === '{') { braceDepth++; }
        if (ch === '}') { braceDepth--; }
      }

      // End of class
      if (currentClass && braceDepth <= classStartDepth) {
        currentClass.endLine = lineNum;
        symbols.push(currentClass);
        currentClass = null;
      }

      // Class detection
      const classMatch = line.match(classRegex);
      if (classMatch) {
        currentClass = {
          name: classMatch[1],
          kind: 'class',
          startLine: lineNum,
          endLine: lineNum,
          children: [],
          docComment: this.getPrecedingDocComment(lines, i),
        };
        classStartDepth = braceDepth - 1;
        continue;
      }

      // Methods inside a class
      if (currentClass) {
        const methodMatch = line.match(/^(?:async\s+)?(?:static\s+)?(?:private\s+|protected\s+|public\s+)?(\w+)\s*\(/);
        if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' && methodMatch[1] !== 'while') {
          currentClass.children!.push({
            name: methodMatch[1],
            kind: 'method',
            startLine: lineNum,
            endLine: lineNum,
          });
        }
        continue;
      }

      // Top-level function
      const funcMatch = line.match(funcRegex);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: 'function',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
          signature: funcMatch[2],
          docComment: this.getPrecedingDocComment(lines, i),
        });
        continue;
      }

      // Arrow function
      const arrowMatch = line.match(arrowRegex);
      if (arrowMatch) {
        symbols.push({
          name: arrowMatch[1],
          kind: 'function',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
          docComment: this.getPrecedingDocComment(lines, i),
        });
        continue;
      }

      // Interface/Type
      const intMatch = line.match(interfaceRegex);
      if (intMatch) {
        symbols.push({
          name: intMatch[1],
          kind: line.includes('type') ? 'type' : 'interface',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
          docComment: this.getPrecedingDocComment(lines, i),
        });
        continue;
      }

      // Enum
      const enumMatch = line.match(enumRegex);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          kind: 'enum',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
        });
      }
    }

    if (currentClass) {
      currentClass.endLine = lines.length;
      symbols.push(currentClass);
    }

    return symbols;
  }

  // ─── Python ─────────────────────────────────────────────────────────────

  private extractPythonSymbols(content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    const classRegex = /^class\s+(\w+)/;
    const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;
    const methodRegex = /^    (?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;

    let currentClass: CodeSymbol | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const classMatch = line.match(classRegex);
      if (classMatch) {
        if (currentClass) { currentClass.endLine = lineNum - 1; symbols.push(currentClass); }
        currentClass = {
          name: classMatch[1], kind: 'class',
          startLine: lineNum, endLine: lineNum,
          children: [],
          docComment: this.getPythonDocstring(lines, i),
        };
        continue;
      }

      if (currentClass) {
        const methodMatch = line.match(methodRegex);
        if (methodMatch) {
          currentClass.children!.push({
            name: methodMatch[1], kind: 'method',
            startLine: lineNum, endLine: lineNum,
            signature: `(${methodMatch[2]})`,
          });
          continue;
        }
        // Check if we've left the class (non-indented non-empty line)
        if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('#')) {
          currentClass.endLine = lineNum - 1;
          symbols.push(currentClass);
          currentClass = null;
        }
      }

      if (!currentClass) {
        const funcMatch = line.match(funcRegex);
        if (funcMatch) {
          symbols.push({
            name: funcMatch[1], kind: 'function',
            startLine: lineNum, endLine: lineNum,
            signature: `(${funcMatch[2]})`,
            docComment: this.getPythonDocstring(lines, i),
          });
        }
      }
    }

    if (currentClass) { currentClass.endLine = lines.length; symbols.push(currentClass); }
    return symbols;
  }

  // ─── Go ─────────────────────────────────────────────────────────────────

  private extractGoSymbols(content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');
    const funcRegex = /^func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)/;
    const typeRegex = /^type\s+(\w+)\s+(struct|interface)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const funcMatch = line.match(funcRegex);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[3],
          kind: funcMatch[1] ? 'method' : 'function',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
          signature: `(${funcMatch[4]})`,
        });
        continue;
      }

      const typeMatch = line.match(typeRegex);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: typeMatch[2] === 'interface' ? 'interface' : 'class',
          startLine: lineNum,
          endLine: this.findEndLine(lines, i),
        });
      }
    }

    return symbols;
  }

  // ─── Rust ───────────────────────────────────────────────────────────────

  private extractRustSymbols(content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');
    const fnRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/;
    const structRegex = /^(?:pub\s+)?struct\s+(\w+)/;
    const enumRegex = /^(?:pub\s+)?enum\s+(\w+)/;
    const traitRegex = /^(?:pub\s+)?trait\s+(\w+)/;
    const implRegex = /^impl(?:<[^>]+>)?\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      let match;
      if ((match = line.match(fnRegex))) {
        symbols.push({ name: match[1], kind: 'function', startLine: lineNum, endLine: this.findEndLine(lines, i) });
      } else if ((match = line.match(structRegex))) {
        symbols.push({ name: match[1], kind: 'class', startLine: lineNum, endLine: this.findEndLine(lines, i) });
      } else if ((match = line.match(enumRegex))) {
        symbols.push({ name: match[1], kind: 'enum', startLine: lineNum, endLine: this.findEndLine(lines, i) });
      } else if ((match = line.match(traitRegex))) {
        symbols.push({ name: match[1], kind: 'interface', startLine: lineNum, endLine: this.findEndLine(lines, i) });
      } else if ((match = line.match(implRegex))) {
        symbols.push({ name: `impl ${match[1]}`, kind: 'class', startLine: lineNum, endLine: this.findEndLine(lines, i) });
      }
    }

    return symbols;
  }

  // ─── Generic ────────────────────────────────────────────────────────────

  private extractGenericSymbols(content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');
    // Try to detect function-like patterns
    const funcRegex = /(?:function|def|fn|func|sub|proc)\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(funcRegex);
      if (match) {
        symbols.push({ name: match[1], kind: 'function', startLine: i + 1, endLine: i + 1 });
      }
    }
    return symbols;
  }

  // ─── Imports/Exports ────────────────────────────────────────────────────

  extractImports(content: string, language: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
      // Named: import { X, Y } from 'module'
      const namedRegex = /import\s+\{([^}]+)\}\s+from\s+['"](.+?)['"]/g;
      let m;
      while ((m = namedRegex.exec(content))) {
        const specifiers = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        imports.push({ source: m[2], specifiers, isDefault: false, isNamespace: false, line: this.getLineNumber(content, m.index) });
      }

      // Default: import X from 'module'
      const defaultRegex = /import\s+(\w+)\s+from\s+['"](.+?)['"]/g;
      while ((m = defaultRegex.exec(content))) {
        imports.push({ source: m[2], specifiers: [m[1]], isDefault: true, isNamespace: false, line: this.getLineNumber(content, m.index) });
      }

      // Namespace: import * as X from 'module'
      const nsRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"](.+?)['"]/g;
      while ((m = nsRegex.exec(content))) {
        imports.push({ source: m[2], specifiers: [m[1]], isDefault: false, isNamespace: true, line: this.getLineNumber(content, m.index) });
      }
    }

    return imports;
  }

  extractExports(content: string, language: string): ExportInfo[] {
    const exports: ExportInfo[] = [];

    if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
      const regex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum|abstract\s+class)\s+(\w+)/g;
      let m;
      while ((m = regex.exec(content))) {
        exports.push({
          name: m[1],
          isDefault: m[0].includes('default'),
          line: this.getLineNumber(content, m.index),
        });
      }
    }

    return exports;
  }

  // ─── Comments ───────────────────────────────────────────────────────────

  extractComments(content: string, _language: string): CommentBlock[] {
    const comments: CommentBlock[] = [];

    // JSDoc / block comments: /** ... */
    const blockRegex = /\/\*\*([\s\S]*?)\*\//g;
    let m;
    while ((m = blockRegex.exec(content))) {
      const startLine = this.getLineNumber(content, m.index);
      const endLine = this.getLineNumber(content, m.index + m[0].length);
      const text = m[1].replace(/^\s*\*\s?/gm, '').trim();
      comments.push({ text, startLine, endLine, isDocBlock: true });
    }

    // Python docstrings: """..."""
    const pyDocRegex = /"""([\s\S]*?)"""/g;
    while ((m = pyDocRegex.exec(content))) {
      const startLine = this.getLineNumber(content, m.index);
      const endLine = this.getLineNumber(content, m.index + m[0].length);
      comments.push({ text: m[1].trim(), startLine, endLine, isDocBlock: true });
    }

    return comments;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private findEndLine(lines: string[], startIdx: number): number {
    let depth = 0;
    let started = false;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') { depth--; }
      }
      if (started && depth <= 0) { return i + 1; }
    }
    return startIdx + 1;
  }

  private getPrecedingDocComment(lines: string[], lineIdx: number): string | undefined {
    if (lineIdx === 0) { return undefined; }
    let i = lineIdx - 1;
    while (i >= 0 && lines[i].trim() === '') { i--; }

    if (i >= 0 && lines[i].trim().endsWith('*/')) {
      const endIdx = i;
      while (i >= 0 && !lines[i].trim().startsWith('/**') && !lines[i].trim().startsWith('/*')) { i--; }
      return lines.slice(i, endIdx + 1).map(l => l.replace(/^\s*\/?\*+\/?/g, '').trim()).filter(Boolean).join('\n');
    }

    // Single-line comments
    const commentLines: string[] = [];
    while (i >= 0 && lines[i].trim().startsWith('//')) {
      commentLines.unshift(lines[i].trim().replace(/^\/\/\s?/, ''));
      i--;
    }
    return commentLines.length > 0 ? commentLines.join('\n') : undefined;
  }

  private getPythonDocstring(lines: string[], lineIdx: number): string | undefined {
    const nextLine = lines[lineIdx + 1]?.trim();
    if (nextLine?.startsWith('"""') || nextLine?.startsWith("'''")) {
      const quote = nextLine.startsWith('"""') ? '"""' : "'''";
      if (nextLine.endsWith(quote) && nextLine.length > 6) {
        return nextLine.slice(3, -3).trim();
      }
      const docLines: string[] = [nextLine.slice(3)];
      for (let i = lineIdx + 2; i < lines.length; i++) {
        if (lines[i].trim().endsWith(quote)) {
          docLines.push(lines[i].trim().slice(0, -3));
          return docLines.filter(Boolean).join('\n').trim();
        }
        docLines.push(lines[i].trim());
      }
    }
    return undefined;
  }

  private getLineNumber(content: string, charIndex: number): number {
    return content.substring(0, charIndex).split('\n').length;
  }
}
