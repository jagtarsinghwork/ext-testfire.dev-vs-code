import { Logger } from '../utils/Logger';

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Represents a single validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  line?: number;
  column?: number;
  code?: string;
  category: 'syntax' | 'logic' | 'security' | 'style';
  suggestion?: string;
}

/**
 * Result from validation operations
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  processingTimeMs?: number;
}

/**
 * Supported languages for syntax validation
 */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown';

/**
 * SyntaxValidator validates code syntax for multiple programming languages.
 * Performs basic syntax checks including:
 * - Brace/parenthesis/bracket balance
 * - Quote balance (single, double, template literals)
 * - Language-specific syntax patterns
 * - Indentation and structure validation
 */
export class SyntaxValidator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SyntaxValidator');
  }

  /**
   * Validate code syntax based on language
   * @param code - Source code to validate
   * @param language - Programming language
   * @param fileName - Optional file name for better error messages
   * @returns ValidationResult with any syntax issues found
   */
  public validate(
    code: string,
    language: string,
    fileName?: string,
  ): ValidationResult {
    const startTime = Date.now();
    this.logger.debug(
      `Validating syntax for ${language}${fileName ? ` (${fileName})` : ''}`,
    );

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };

    try {
      // Normalize language identifier
      const normalizedLang = this.normalizeLanguage(language);

      // Run common validation checks
      this.validateBraceBalance(code, result);
      this.validateQuoteBalance(code, result);

      // Run language-specific validation
      switch (normalizedLang) {
        case 'typescript':
        case 'javascript':
          this.validateJavaScriptSyntax(code, result);
          break;
        case 'python':
          this.validatePythonSyntax(code, result);
          break;
        case 'json':
          this.validateJSONSyntax(code, result);
          break;
        case 'html':
          this.validateHTMLSyntax(code, result);
          break;
        case 'css':
          this.validateCSSSyntax(code, result);
          break;
        default:
          this.logger.warn(
            `No specific syntax validator for language: ${language}`,
          );
      }

      result.valid = result.errors.length === 0;
      result.processingTimeMs = Date.now() - startTime;

      this.logger.debug(`Syntax validation completed`, {
        errors: result.errors.length,
        warnings: result.warnings.length,
        timeMs: result.processingTimeMs,
      });
    } catch (error: any) {
      this.logger.error(`Syntax validation failed: ${error.message}`, error);
      result.errors.push({
        severity: 'error',
        message: `Syntax validation failed: ${error.message}`,
        category: 'syntax',
      });
      result.valid = false;
    }

    return result;
  }

  /**
   * Validate brace, parenthesis, and bracket balance
   */
  private validateBraceBalance(code: string, result: ValidationResult): void {
    const stack: Array<{ char: string; line: number; column: number }> = [];
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
    };
    const closingChars = new Set([')', ']', '}']);

    let line = 1;
    let column = 1;
    let inString = false;
    let inComment = false;
    let inMultiLineComment = false;
    let stringChar = '';
    let escaped = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1];

      // Track position
      if (char === '\n') {
        line++;
        column = 1;
        if (inComment) {
          inComment = false;
        }
        continue;
      }
      column++;

      // Handle escape sequences
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }

      // Handle comments (for JS/TS-like languages)
      if (!inString) {
        if (char === '/' && nextChar === '/') {
          inComment = true;
          i++; // Skip next char
          continue;
        }
        if (char === '/' && nextChar === '*') {
          inMultiLineComment = true;
          i++; // Skip next char
          continue;
        }
        if (inMultiLineComment && char === '*' && nextChar === '/') {
          inMultiLineComment = false;
          i++; // Skip next char
          continue;
        }
      }

      // Skip if in comment
      if (inComment || inMultiLineComment) {
        continue;
      }

      // Handle strings
      if (char === '"' || char === "'" || char === '`') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      // Skip if in string
      if (inString) {
        continue;
      }

      // Check opening characters
      if (char in pairs) {
        stack.push({ char, line, column });
      }

      // Check closing characters
      if (closingChars.has(char)) {
        if (stack.length === 0) {
          result.errors.push({
            severity: 'error',
            message: `Unexpected closing '${char}' with no matching opening`,
            line,
            column,
            category: 'syntax',
            code: 'UNMATCHED_CLOSING',
          });
        } else {
          const last = stack.pop()!;
          const expected = pairs[last.char];
          if (char !== expected) {
            result.errors.push({
              severity: 'error',
              message: `Mismatched brackets: expected '${expected}' but found '${char}'`,
              line,
              column,
              category: 'syntax',
              code: 'MISMATCHED_BRACKETS',
              suggestion: `Opening '${last.char}' at line ${last.line}, column ${last.column}`,
            });
          }
        }
      }
    }

    // Check for unclosed brackets
    for (const item of stack) {
      result.errors.push({
        severity: 'error',
        message: `Unclosed '${item.char}'`,
        line: item.line,
        column: item.column,
        category: 'syntax',
        code: 'UNCLOSED_BRACKET',
        suggestion: `Add closing '${pairs[item.char]}'`,
      });
    }
  }

  /**
   * Validate quote balance
   */
  private validateQuoteBalance(code: string, result: ValidationResult): void {
    let line = 1;
    let column = 1;
    let inString = false;
    let stringChar = '';
    let stringStartLine = 0;
    let stringStartColumn = 0;
    let escaped = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (char === '\n') {
        // Multi-line strings are OK for template literals, but not for single/double quotes
        if (inString && stringChar !== '`') {
          result.errors.push({
            severity: 'error',
            message: `Unclosed string started with ${stringChar}`,
            line: stringStartLine,
            column: stringStartColumn,
            category: 'syntax',
            code: 'UNCLOSED_STRING',
            suggestion: `Add closing ${stringChar} before end of line`,
          });
          inString = false;
        }
        line++;
        column = 1;
        continue;
      }
      column++;

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        if (!inString) {
          inString = true;
          stringChar = char;
          stringStartLine = line;
          stringStartColumn = column;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }
    }

    // Check for unclosed string at end of file
    if (inString) {
      result.errors.push({
        severity: 'error',
        message: `Unclosed string started with ${stringChar}`,
        line: stringStartLine,
        column: stringStartColumn,
        category: 'syntax',
        code: 'UNCLOSED_STRING',
        suggestion: `Add closing ${stringChar}`,
      });
    }
  }

  /**
   * Validate JavaScript/TypeScript specific syntax
   */
  private validateJavaScriptSyntax(
    code: string,
    result: ValidationResult,
  ): void {
    const lines = code.split('\n');

    // Check for common syntax errors
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for missing semicolons (warning only)
      if (
        /^\s*(const|let|var|return|break|continue|throw)\s+.*[^;{}\s]$/.test(
          line,
        )
      ) {
        if (!line.trim().endsWith(',')) {
          result.warnings.push({
            severity: 'warning',
            message: 'Statement may be missing a semicolon',
            line: lineNum,
            category: 'syntax',
            code: 'MISSING_SEMICOLON',
            suggestion: 'Add semicolon at end of statement',
          });
        }
      }

      // Check for multiple statements on one line (without semicolon)
      const singleLineMultiStatement = /;\s*[a-zA-Z]+.*[^{]$/.test(line);
      if (singleLineMultiStatement && !line.includes('for')) {
        result.warnings.push({
          severity: 'warning',
          message: 'Multiple statements on one line',
          line: lineNum,
          category: 'syntax',
          code: 'MULTIPLE_STATEMENTS',
          suggestion: 'Split into separate lines for readability',
        });
      }

      // Check for function syntax errors
      if (/function\s*\(/.test(line)) {
        result.errors.push({
          severity: 'error',
          message: 'Function declaration missing name',
          line: lineNum,
          category: 'syntax',
          code: 'MISSING_FUNCTION_NAME',
          suggestion: 'Add function name or use function expression',
        });
      }

      // Check for invalid arrow function syntax
      if (/=>\s*{[^}]*$/.test(line) && i === lines.length - 1) {
        result.warnings.push({
          severity: 'warning',
          message: 'Arrow function body may be incomplete',
          line: lineNum,
          category: 'syntax',
          code: 'INCOMPLETE_ARROW_FUNCTION',
        });
      }

      // Check for async/await syntax
      if (/\bawait\b/.test(line)) {
        // Check if in async context (very basic check)
        let hasAsync = false;
        for (let j = Math.max(0, i - 10); j < i; j++) {
          if (/\basync\b/.test(lines[j])) {
            hasAsync = true;
            break;
          }
        }
        if (!hasAsync && !code.includes('async')) {
          result.warnings.push({
            severity: 'warning',
            message: 'await used outside async function',
            line: lineNum,
            category: 'syntax',
            code: 'AWAIT_WITHOUT_ASYNC',
            suggestion: 'Ensure this is inside an async function',
          });
        }
      }

      // Check for incorrect use of reserved words
      const reservedWords = [
        'class',
        'const',
        'let',
        'var',
        'function',
        'return',
        'if',
        'else',
        'switch',
        'case',
      ];
      for (const word of reservedWords) {
        const regex = new RegExp(`\\b${word}\\s*=(?!=)`, 'g');
        if (regex.test(line)) {
          result.errors.push({
            severity: 'error',
            message: `Cannot assign to reserved word '${word}'`,
            line: lineNum,
            category: 'syntax',
            code: 'RESERVED_WORD_ASSIGNMENT',
          });
        }
      }
    }

    // Check for unmatched template literal placeholders
    const templateLiteralRegex = /`[^`]*\$\{[^}]*`/g;
    let match;
    let line = 1;
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '\n') {
        line++;
      }
      if (code[i] === '`') {
        let j = i + 1;
        let bracketCount = 0;
        let inPlaceholder = false;
        while (j < code.length && code[j] !== '`') {
          if (code[j] === '$' && code[j + 1] === '{') {
            inPlaceholder = true;
            bracketCount++;
            j += 2;
          } else if (inPlaceholder && code[j] === '{') {
            bracketCount++;
            j++;
          } else if (inPlaceholder && code[j] === '}') {
            bracketCount--;
            if (bracketCount === 0) {
              inPlaceholder = false;
            }
            j++;
          } else {
            j++;
          }
        }
        if (bracketCount > 0) {
          result.errors.push({
            severity: 'error',
            message: 'Unclosed template literal placeholder',
            line,
            category: 'syntax',
            code: 'UNCLOSED_TEMPLATE_PLACEHOLDER',
            suggestion: 'Ensure all ${...} placeholders are properly closed',
          });
        }
      }
    }
  }

  /**
   * Validate Python specific syntax
   */
  private validatePythonSyntax(code: string, result: ValidationResult): void {
    const lines = code.split('\n');
    let indentStack: number[] = [0];
    const indentSize = this.detectPythonIndent(code);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip blank lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      // Check indentation
      const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;
      const previousLine = i > 0 ? lines[i - 1].trim() : '';

      // Check if previous line expects indentation
      if (previousLine.endsWith(':')) {
        if (leadingSpaces <= indentStack[indentStack.length - 1]) {
          result.errors.push({
            severity: 'error',
            message: 'Expected indented block',
            line: lineNum,
            category: 'syntax',
            code: 'INDENTATION_ERROR',
            suggestion: `Add ${indentSize} spaces of indentation`,
          });
        } else {
          indentStack.push(leadingSpaces);
        }
      } else {
        // Check consistent indentation
        if (leadingSpaces < indentStack[indentStack.length - 1]) {
          // Dedent
          while (
            indentStack.length > 1 &&
            leadingSpaces < indentStack[indentStack.length - 1]
          ) {
            indentStack.pop();
          }
          if (leadingSpaces !== indentStack[indentStack.length - 1]) {
            result.errors.push({
              severity: 'error',
              message: 'Inconsistent indentation',
              line: lineNum,
              category: 'syntax',
              code: 'INCONSISTENT_INDENTATION',
              suggestion: 'Align with previous indentation level',
            });
          }
        }
      }

      // Check for common Python syntax errors
      if (
        line.trim().startsWith('else:') ||
        line.trim().startsWith('elif ') ||
        line.trim().startsWith('except') ||
        line.trim().startsWith('finally:')
      ) {
        if (i === 0) {
          result.errors.push({
            severity: 'error',
            message: `'${line.trim().split(/[\s:]/)[0]}' without matching 'try' or 'if'`,
            line: lineNum,
            category: 'syntax',
            code: 'ORPHANED_CLAUSE',
          });
        }
      }

      // Check for missing colons
      if (
        /^\s*(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(
          line,
        ) &&
        !line.trim().endsWith(':') &&
        !line.trim().endsWith('\\')
      ) {
        result.errors.push({
          severity: 'error',
          message: 'Missing colon at end of statement',
          line: lineNum,
          category: 'syntax',
          code: 'MISSING_COLON',
          suggestion: 'Add colon (:) at end of line',
        });
      }

      // Check for incorrect use of = instead of ==
      if (/\bif\s+.*\s=\s(?!=)/.test(line)) {
        result.errors.push({
          severity: 'error',
          message: 'Assignment (=) in condition, did you mean == or :=?',
          line: lineNum,
          category: 'syntax',
          code: 'ASSIGNMENT_IN_CONDITION',
          suggestion: 'Use == for comparison or := for walrus operator',
        });
      }

      // Check for incorrect string formatting
      if (/f['"][^'"]*\{[^}]*$/.test(line)) {
        result.errors.push({
          severity: 'error',
          message: 'Unclosed f-string placeholder',
          line: lineNum,
          category: 'syntax',
          code: 'UNCLOSED_F_STRING',
          suggestion: 'Close the {..} placeholder',
        });
      }
    }
  }

  /**
   * Validate JSON syntax
   */
  private validateJSONSyntax(code: string, result: ValidationResult): void {
    try {
      JSON.parse(code);
    } catch (error: any) {
      const match = error.message.match(/at position (\d+)/);
      let line = 1;
      let column = 1;

      if (match) {
        const position = parseInt(match[1], 10);
        for (let i = 0; i < position && i < code.length; i++) {
          if (code[i] === '\n') {
            line++;
            column = 1;
          } else {
            column++;
          }
        }
      }

      result.errors.push({
        severity: 'error',
        message: `Invalid JSON: ${error.message}`,
        line,
        column,
        category: 'syntax',
        code: 'INVALID_JSON',
        suggestion: 'Check JSON syntax at the specified position',
      });
    }

    // Additional JSON-specific checks
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for trailing commas (common error)
      if (/,\s*[}\]]/.test(line)) {
        result.warnings.push({
          severity: 'warning',
          message: 'Trailing comma before closing bracket',
          line: lineNum,
          category: 'syntax',
          code: 'TRAILING_COMMA',
          suggestion: 'Remove trailing comma (not valid in JSON)',
        });
      }

      // Check for single quotes (must be double quotes in JSON)
      if (/'[^']*'/.test(line) && !line.trim().startsWith('//')) {
        result.errors.push({
          severity: 'error',
          message: 'JSON strings must use double quotes',
          line: lineNum,
          category: 'syntax',
          code: 'SINGLE_QUOTES',
          suggestion: 'Replace single quotes with double quotes',
        });
      }

      // Check for comments (not allowed in strict JSON)
      if (line.trim().startsWith('//') || line.includes('/*')) {
        result.warnings.push({
          severity: 'warning',
          message: 'Comments are not allowed in standard JSON',
          line: lineNum,
          category: 'syntax',
          code: 'JSON_COMMENT',
          suggestion: 'Remove comments or use JSON5/JSONC format',
        });
      }
    }
  }

  /**
   * Validate HTML syntax
   */
  private validateHTMLSyntax(code: string, result: ValidationResult): void {
    const tagStack: Array<{ tag: string; line: number }> = [];
    const selfClosingTags = new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);

    const lines = code.split('\n');
    let line = 1;

    // Simple tag matching
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      line = i + 1;

      let lastIndex = 0;
      tagRegex.lastIndex = 0;

      while ((match = tagRegex.exec(currentLine)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullTag.startsWith('</');
        const isSelfClosing =
          fullTag.endsWith('/>') || selfClosingTags.has(tagName);

        if (isClosing) {
          if (tagStack.length === 0) {
            result.errors.push({
              severity: 'error',
              message: `Unexpected closing tag </${tagName}>`,
              line,
              category: 'syntax',
              code: 'UNEXPECTED_CLOSING_TAG',
            });
          } else {
            const last = tagStack.pop()!;
            if (last.tag !== tagName) {
              result.errors.push({
                severity: 'error',
                message: `Mismatched tags: expected </${last.tag}> but found </${tagName}>`,
                line,
                category: 'syntax',
                code: 'MISMATCHED_TAGS',
                suggestion: `Opening <${last.tag}> at line ${last.line}`,
              });
            }
          }
        } else if (!isSelfClosing) {
          tagStack.push({ tag: tagName, line });
        }
      }
    }

    // Check for unclosed tags
    for (const item of tagStack) {
      result.errors.push({
        severity: 'error',
        message: `Unclosed tag <${item.tag}>`,
        line: item.line,
        category: 'syntax',
        code: 'UNCLOSED_TAG',
        suggestion: `Add closing </${item.tag}>`,
      });
    }
  }

  /**
   * Validate CSS syntax
   */
  private validateCSSSyntax(code: string, result: ValidationResult): void {
    const lines = code.split('\n');
    let inRuleSet = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      if (!line || line.startsWith('/*')) {
        continue;
      }

      // Count braces
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceCount += openBraces - closeBraces;

      if (openBraces > 0) {
        inRuleSet = true;
      }
      if (closeBraces > 0 && braceCount === 0) {
        inRuleSet = false;
      }

      // Check for missing semicolons in property declarations
      if (
        inRuleSet &&
        line.includes(':') &&
        !line.endsWith(';') &&
        !line.endsWith('{') &&
        !line.endsWith('}')
      ) {
        result.warnings.push({
          severity: 'warning',
          message: 'CSS property declaration may be missing semicolon',
          line: lineNum,
          category: 'syntax',
          code: 'MISSING_SEMICOLON',
          suggestion: 'Add semicolon at end of property declaration',
        });
      }

      // Check for invalid property names
      if (inRuleSet && line.includes(':')) {
        const propName = line.split(':')[0].trim();
        if (propName && /[A-Z]/.test(propName)) {
          result.warnings.push({
            severity: 'warning',
            message: 'CSS property names should be lowercase',
            line: lineNum,
            category: 'syntax',
            code: 'PROPERTY_CASE',
            suggestion: 'Use lowercase for CSS property names',
          });
        }
      }
    }

    if (braceCount !== 0) {
      result.errors.push({
        severity: 'error',
        message: `Unmatched braces in CSS (${braceCount > 0 ? 'missing closing' : 'extra closing'})`,
        category: 'syntax',
        code: 'UNMATCHED_BRACES',
        suggestion:
          braceCount > 0 ? 'Add closing braces' : 'Remove extra closing braces',
      });
    }
  }

  /**
   * Normalize language identifier
   */
  private normalizeLanguage(language: string): SupportedLanguage {
    const normalized = language.toLowerCase();
    const mapping: Record<string, SupportedLanguage> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      htm: 'html',
      md: 'markdown',
    };
    return (
      (mapping[normalized] as SupportedLanguage) ||
      (normalized as SupportedLanguage)
    );
  }

  /**
   * Detect Python indentation size (2 or 4 spaces)
   */
  private detectPythonIndent(code: string): number {
    const lines = code.split('\n');
    const indents: number[] = [];

    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1].trim();
      const curr = lines[i];

      if (prev.endsWith(':') && curr.trim()) {
        const prevIndent = lines[i - 1].match(/^\s*/)?.[0].length || 0;
        const currIndent = curr.match(/^\s*/)?.[0].length || 0;
        if (currIndent > prevIndent) {
          indents.push(currIndent - prevIndent);
        }
      }
    }

    if (indents.length === 0) {
      return 4; // Default
    }

    // Return most common indent size
    const counts = indents.reduce(
      (acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    return parseInt(
      Object.keys(counts).sort(
        (a, b) => counts[parseInt(b)] - counts[parseInt(a)],
      )[0],
      10,
    );
  }
}
