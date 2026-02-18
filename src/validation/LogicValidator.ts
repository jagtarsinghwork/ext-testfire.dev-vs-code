import { Logger } from '../utils/Logger';
import { ValidationResult, ValidationIssue } from './SyntaxValidator';

/**
 * Pattern representing a common bug type
 */
interface BugPattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  detector: (code: string, language: string) => ValidationIssue[];
}

/**
 * LogicValidator detects common bug patterns and logical errors in code.
 * Identifies issues like:
 * - Multiplication bug (wrong accumulator initialization)
 * - Off-by-one errors in loops
 * - Null/undefined access risks
 * - Infinite loop conditions
 * - Type mismatches and coercion issues
 * - Dead code and unreachable statements
 * - Logic errors in conditionals
 */
export class LogicValidator {
  private logger: Logger;
  private patterns: BugPattern[];

  constructor() {
    this.logger = new Logger('LogicValidator');
    this.patterns = this.initializePatterns();
  }

  /**
   * Validate code for logical errors and common bug patterns
   * @param code - Source code to validate
   * @param language - Programming language
   * @param fileName - Optional file name for better error messages
   * @returns ValidationResult with any logical issues found
   */
  public validate(
    code: string,
    language: string,
    fileName?: string,
  ): ValidationResult {
    const startTime = Date.now();
    this.logger.debug(
      `Validating logic for ${language}${fileName ? ` (${fileName})` : ''}`,
    );

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };

    try {
      // Run all bug pattern detectors
      for (const pattern of this.patterns) {
        try {
          const issues = pattern.detector(code, language);
          for (const issue of issues) {
            if (issue.severity === 'error') {
              result.errors.push(issue);
            } else if (issue.severity === 'warning') {
              result.warnings.push(issue);
            } else {
              result.info.push(issue);
            }
          }
        } catch (error: any) {
          this.logger.warn(
            `Pattern detector '${pattern.name}' failed: ${error.message}`,
          );
        }
      }

      result.valid = result.errors.length === 0;
      result.processingTimeMs = Date.now() - startTime;

      this.logger.debug(`Logic validation completed`, {
        errors: result.errors.length,
        warnings: result.warnings.length,
        timeMs: result.processingTimeMs,
      });
    } catch (error: any) {
      this.logger.error(`Logic validation failed: ${error.message}`, error);
      result.errors.push({
        severity: 'error',
        message: `Logic validation failed: ${error.message}`,
        category: 'logic',
      });
      result.valid = false;
    }

    return result;
  }

  /**
   * Initialize all bug pattern detectors
   */
  private initializePatterns(): BugPattern[] {
    return [
      {
        name: 'multiplication-bug',
        description:
          'Detect incorrect accumulator initialization (result = 1 with addition)',
        severity: 'error',
        detector: this.detectMultiplicationBug.bind(this),
      },
      {
        name: 'off-by-one',
        description: 'Detect off-by-one errors in loops',
        severity: 'warning',
        detector: this.detectOffByOneErrors.bind(this),
      },
      {
        name: 'null-access',
        description: 'Detect potential null/undefined access',
        severity: 'warning',
        detector: this.detectNullAccess.bind(this),
      },
      {
        name: 'infinite-loop',
        description: 'Detect potential infinite loops',
        severity: 'error',
        detector: this.detectInfiniteLoops.bind(this),
      },
      {
        name: 'type-mismatch',
        description: 'Detect type coercion and mismatch issues',
        severity: 'warning',
        detector: this.detectTypeMismatches.bind(this),
      },
      {
        name: 'dead-code',
        description: 'Detect unreachable code',
        severity: 'warning',
        detector: this.detectDeadCode.bind(this),
      },
      {
        name: 'logic-errors',
        description: 'Detect logical errors in conditionals',
        severity: 'warning',
        detector: this.detectLogicErrors.bind(this),
      },
      {
        name: 'async-issues',
        description: 'Detect async/await misuse',
        severity: 'warning',
        detector: this.detectAsyncIssues.bind(this),
      },
    ];
  }

  /**
   * Detect multiplication bug: result = 1 but using += instead of *=
   * Example: let result = 1; for(...) result += x; (should be *= or start with 0)
   */
  private detectMultiplicationBug(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (
      !['javascript', 'typescript', 'python'].includes(language.toLowerCase())
    ) {
      return issues;
    }

    const lines = code.split('\n');

    // Track variable initializations
    const varsInitializedToOne: Map<string, number> = new Map();
    const varsInitializedToZero: Map<string, number> = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript patterns
      const jsInitOne = line.match(/(?:let|const|var)\s+(\w+)\s*=\s*1\s*[;,]?/);
      const jsInitZero = line.match(
        /(?:let|const|var)\s+(\w+)\s*=\s*0\s*[;,]?/,
      );

      // Python patterns
      const pyInitOne = line.match(/(\w+)\s*=\s*1\s*$/);
      const pyInitZero = line.match(/(\w+)\s*=\s*0\s*$/);

      if (jsInitOne || pyInitOne) {
        const varName = (jsInitOne || pyInitOne)![1];
        varsInitializedToOne.set(varName, lineNum);
      }
      if (jsInitZero || pyInitZero) {
        const varName = (jsInitZero || pyInitZero)![1];
        varsInitializedToZero.set(varName, lineNum);
      }

      // Check for += operations on variables initialized to 1
      for (const [varName, initLine] of Array.from(varsInitializedToOne.entries())) {
        if (line.includes(`${varName} +=`) || line.includes(`${varName}+=`)) {
          issues.push({
            severity: 'error',
            message: `Potential multiplication bug: '${varName}' initialized to 1 at line ${initLine} but using += operator`,
            line: lineNum,
            category: 'logic',
            code: 'MULTIPLICATION_BUG',
            suggestion: `Either initialize ${varName} to 0 (for addition) or use *= operator (for multiplication)`,
          });
        }
      }

      // Check for *= operations on variables initialized to 0
      for (const [varName, initLine] of Array.from(varsInitializedToZero.entries())) {
        if (line.includes(`${varName} *=`) || line.includes(`${varName}*=`)) {
          issues.push({
            severity: 'warning',
            message: `Variable '${varName}' initialized to 0 at line ${initLine} but using *= operator (result will always be 0)`,
            line: lineNum,
            category: 'logic',
            code: 'MULTIPLICATION_BY_ZERO',
            suggestion: `Initialize ${varName} to 1 for multiplication, or use += for addition`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect off-by-one errors in loop conditions
   */
  private detectOffByOneErrors(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript for loops
      // Check for patterns like: for(let i = 0; i <= arr.length; i++)
      const forLoopMatch = line.match(
        /for\s*\(\s*(?:let|var|const)?\s*(\w+)\s*=\s*(\d+)\s*;\s*\1\s*(<=?)\s*(\w+)\.length\s*;/,
      );
      if (forLoopMatch) {
        const [, varName, startVal, operator, arrayName] = forLoopMatch;
        if (operator === '<=' && startVal === '0') {
          issues.push({
            severity: 'warning',
            message: `Potential off-by-one error: loop condition '${varName} <= ${arrayName}.length' will access index out of bounds`,
            line: lineNum,
            category: 'logic',
            code: 'OFF_BY_ONE_LOOP',
            suggestion: `Change to '${varName} < ${arrayName}.length'`,
          });
        }
      }

      // Check for manual array access that might be off by one
      const arrayAccessMatch = line.match(/(\w+)\[(\w+)\.length\]/);
      if (arrayAccessMatch) {
        const [, arrayName, sizeVar] = arrayAccessMatch;
        if (!line.includes(`${sizeVar}.length - 1`)) {
          issues.push({
            severity: 'warning',
            message: `Array access '${arrayName}[${sizeVar}.length]' is out of bounds (max index is length-1)`,
            line: lineNum,
            category: 'logic',
            code: 'OFF_BY_ONE_ACCESS',
            suggestion: `Use '${arrayName}[${sizeVar}.length - 1]' for last element`,
          });
        }
      }

      // Python range off-by-one
      if (language.toLowerCase() === 'python') {
        const rangeMatch = line.match(
          /for\s+\w+\s+in\s+range\s*\(\s*len\((\w+)\)\s*\+\s*1\s*\)/,
        );
        if (rangeMatch) {
          issues.push({
            severity: 'warning',
            message: `Potential off-by-one error: range(len(${rangeMatch[1]}) + 1) will exceed array bounds`,
            line: lineNum,
            category: 'logic',
            code: 'OFF_BY_ONE_RANGE',
            suggestion: `Use 'range(len(${rangeMatch[1]}))' to iterate all elements`,
          });
        }
      }

      // Check for > when >= might be intended, or vice versa
      const comparisonMatch = line.match(
        /if\s*\(\s*(\w+)\s*([<>]=?)\s*(\w+)\.length\s*\)/,
      );
      if (comparisonMatch) {
        const [, varName, operator, arrayName] = comparisonMatch;
        if (
          operator === '>=' &&
          line.includes('return') &&
          line.includes(arrayName)
        ) {
          issues.push({
            severity: 'warning',
            message: `Check condition '${varName} >= ${arrayName}.length' - array indices are 0 to length-1`,
            line: lineNum,
            category: 'logic',
            code: 'BOUNDARY_CHECK',
            suggestion: `Consider if '${varName} >= ${arrayName}.length' is correct or should be '>'`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect potential null/undefined access
   */
  private detectNullAccess(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    // Track variables that might be null/undefined
    const nullableVars: Set<string> = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Detect assignments that could be null/undefined
      const nullAssignment = line.match(
        /(?:let|const|var)\s+(\w+)\s*=\s*(?:null|undefined|.*\?.*:.*null)/,
      );
      if (nullAssignment) {
        nullableVars.add(nullAssignment[1]);
      }

      // Detect function return values that might be null
      const functionCall = line.match(
        /(?:let|const|var)\s+(\w+)\s*=\s*(\w+)\s*\(/,
      );
      if (
        functionCall &&
        (line.includes('find') ||
          line.includes('get') ||
          line.includes('fetch'))
      ) {
        nullableVars.add(functionCall[1]);
      }

      // Check for property access on potentially null variables
      for (const varName of Array.from(nullableVars)) {
        const propertyAccess = new RegExp(`${varName}\\.\\w+`);
        const arrayAccess = new RegExp(`${varName}\\[`);

        if (propertyAccess.test(line) || arrayAccess.test(line)) {
          // Check if there's a null check before this line
          let hasNullCheck = false;
          const checkLines = Math.max(0, i - 5);
          for (let j = checkLines; j < i; j++) {
            if (
              lines[j].includes(`${varName} !== null`) ||
              lines[j].includes(`${varName} !== undefined`) ||
              lines[j].includes(`${varName}?.`) ||
              lines[j].includes(`if (${varName})`) ||
              lines[j].includes(`if (!${varName})`)
            ) {
              hasNullCheck = true;
              break;
            }
          }

          if (!hasNullCheck && !line.includes('?.') && !line.includes('??')) {
            issues.push({
              severity: 'warning',
              message: `Potential null/undefined access: '${varName}' might be null or undefined`,
              line: lineNum,
              category: 'logic',
              code: 'NULL_ACCESS',
              suggestion: `Add null check: if (${varName}) { ... } or use optional chaining: ${varName}?.property`,
            });
          }
        }
      }

      // Python None checks
      if (language.toLowerCase() === 'python') {
        for (const varName of Array.from(nullableVars)) {
          const propertyAccess = new RegExp(`${varName}\\.\\w+`);
          if (propertyAccess.test(line)) {
            let hasNoneCheck = false;
            const checkLines = Math.max(0, i - 5);
            for (let j = checkLines; j < i; j++) {
              if (
                lines[j].includes(`${varName} is not None`) ||
                lines[j].includes(`if ${varName}:`)
              ) {
                hasNoneCheck = true;
                break;
              }
            }

            if (!hasNoneCheck) {
              issues.push({
                severity: 'warning',
                message: `Potential None access: '${varName}' might be None`,
                line: lineNum,
                category: 'logic',
                code: 'NONE_ACCESS',
                suggestion: `Add None check: if ${varName} is not None:`,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Detect potential infinite loops
   */
  private detectInfiniteLoops(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // While(true) without break
      if (
        /while\s*\(\s*true\s*\)/.test(line) ||
        /while\s*\(\s*1\s*\)/.test(line)
      ) {
        let hasBreak = false;
        let hasReturn = false;

        // Check next 20 lines for break or return
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (/\bbreak\b/.test(lines[j])) {
            hasBreak = true;
            break;
          }
          if (/\breturn\b/.test(lines[j])) {
            hasReturn = true;
            break;
          }
          // Check for closing brace at same indent level
          if (
            lines[j].trim() === '}' ||
            (language === 'python' && lines[j].match(/^\S/))
          ) {
            break;
          }
        }

        if (!hasBreak && !hasReturn) {
          issues.push({
            severity: 'error',
            message:
              'Potential infinite loop: while(true) without break or return statement',
            line: lineNum,
            category: 'logic',
            code: 'INFINITE_LOOP',
            suggestion:
              'Add a break condition or return statement inside the loop',
          });
        }
      }

      // For loop where counter is not modified
      const forLoopMatch = line.match(
        /for\s*\(\s*(?:let|var|const)?\s*(\w+)\s*=\s*\d+\s*;\s*\1\s*[<>=!]+\s*[^;]+;/,
      );
      if (forLoopMatch) {
        const counterVar = forLoopMatch[1];
        const loopBlock = lines
          .slice(i, Math.min(i + 20, lines.length))
          .join('\n');

        // Check if counter variable is modified in loop body
        const counterModified = new RegExp(
          `${counterVar}\\s*(?:\\+\\+|--|\\+=|-=|=)`,
        ).test(loopBlock.substring(line.length));

        if (!counterModified) {
          issues.push({
            severity: 'error',
            message: `Potential infinite loop: counter variable '${counterVar}' is not modified in loop body`,
            line: lineNum,
            category: 'logic',
            code: 'LOOP_COUNTER_NOT_MODIFIED',
            suggestion: `Ensure '${counterVar}' is incremented/decremented in the loop`,
          });
        }
      }

      // Python while True without break
      if (
        language.toLowerCase() === 'python' &&
        /while\s+True\s*:/.test(line)
      ) {
        let hasBreak = false;
        let hasReturn = false;
        let baseIndent = line.match(/^\s*/)?.[0].length || 0;

        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const currentIndent = lines[j].match(/^\s*/)?.[0].length || 0;

          // Exit loop block when dedent occurs
          if (currentIndent <= baseIndent && lines[j].trim()) {
            break;
          }

          if (/\bbreak\b/.test(lines[j])) {
            hasBreak = true;
            break;
          }
          if (/\breturn\b/.test(lines[j])) {
            hasReturn = true;
            break;
          }
        }

        if (!hasBreak && !hasReturn) {
          issues.push({
            severity: 'error',
            message:
              'Potential infinite loop: while True without break or return statement',
            line: lineNum,
            category: 'logic',
            code: 'INFINITE_LOOP',
            suggestion:
              'Add a break condition or return statement inside the loop',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect type mismatches and coercion issues
   */
  private detectTypeMismatches(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!['javascript', 'typescript'].includes(language.toLowerCase())) {
      return issues;
    }

    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for == instead of ===
      if (/[^=!]={2}[^=]/.test(line) && !line.includes('===')) {
        issues.push({
          severity: 'warning',
          message: 'Using == instead of === can lead to type coercion issues',
          line: lineNum,
          category: 'logic',
          code: 'LOOSE_EQUALITY',
          suggestion: 'Use === for strict equality comparison',
        });
      }

      // Check for != instead of !==
      if (/!={1}[^=]/.test(line) && !line.includes('!==')) {
        issues.push({
          severity: 'warning',
          message: 'Using != instead of !== can lead to type coercion issues',
          line: lineNum,
          category: 'logic',
          code: 'LOOSE_INEQUALITY',
          suggestion: 'Use !== for strict inequality comparison',
        });
      }

      // Check for string concatenation with + that might be numeric addition
      const stringConcat = line.match(/(\w+)\s*\+\s*(\w+)/g);
      if (stringConcat) {
        for (const match of stringConcat) {
          if (
            line.includes('console.log') ||
            line.includes('alert') ||
            line.includes('return')
          ) {
            issues.push({
              severity: 'warning',
              message:
                'Mixing string concatenation with + operator - ensure types are consistent',
              line: lineNum,
              category: 'logic',
              code: 'TYPE_COERCION',
              suggestion:
                'Use template literals: `${var1} ${var2}` or explicit toString()',
            });
            break;
          }
        }
      }

      // Check for array.length in boolean context
      if (/if\s*\(\s*(\w+)\.length\s*\)/.test(line)) {
        issues.push({
          severity: 'warning',
          message: 'Using array.length in boolean context - 0 is falsy',
          line: lineNum,
          category: 'logic',
          code: 'LENGTH_BOOLEAN',
          suggestion:
            'Be explicit: if (array.length > 0) or if (array.length !== 0)',
        });
      }

      // Check for NaN comparison
      if (/[^!]=+\s*NaN/.test(line) || /NaN\s*[^!]=+/.test(line)) {
        issues.push({
          severity: 'error',
          message:
            'NaN comparison always returns false - use Number.isNaN() instead',
          line: lineNum,
          category: 'logic',
          code: 'NAN_COMPARISON',
          suggestion: 'Use Number.isNaN(value) to check for NaN',
        });
      }
    }

    return issues;
  }

  /**
   * Detect unreachable/dead code
   */
  private detectDeadCode(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (
        !line ||
        line.startsWith('//') ||
        line.startsWith('#') ||
        line.startsWith('/*')
      ) {
        continue;
      }

      // Check for code after return statement
      if (/\breturn\b/.test(line) && i < lines.length - 1) {
        let nextNonEmpty = i + 1;
        while (nextNonEmpty < lines.length && !lines[nextNonEmpty].trim()) {
          nextNonEmpty++;
        }

        if (nextNonEmpty < lines.length) {
          const nextLine = lines[nextNonEmpty].trim();
          // Check if next line is not a closing brace
          if (
            nextLine &&
            nextLine !== '}' &&
            !nextLine.startsWith('//') &&
            !nextLine.startsWith('#')
          ) {
            issues.push({
              severity: 'warning',
              message: 'Unreachable code after return statement',
              line: nextNonEmpty + 1,
              category: 'logic',
              code: 'UNREACHABLE_CODE',
              suggestion: 'Remove or move code before return statement',
            });
          }
        }
      }

      // Check for code after throw statement
      if (/\bthrow\b/.test(line) && i < lines.length - 1) {
        let nextNonEmpty = i + 1;
        while (nextNonEmpty < lines.length && !lines[nextNonEmpty].trim()) {
          nextNonEmpty++;
        }

        if (nextNonEmpty < lines.length) {
          const nextLine = lines[nextNonEmpty].trim();
          if (
            nextLine &&
            nextLine !== '}' &&
            !nextLine.startsWith('//') &&
            !nextLine.startsWith('#')
          ) {
            issues.push({
              severity: 'warning',
              message: 'Unreachable code after throw statement',
              line: nextNonEmpty + 1,
              category: 'logic',
              code: 'UNREACHABLE_CODE',
              suggestion: 'Remove code after throw statement',
            });
          }
        }
      }

      // Check for conditions that are always true/false
      if (/if\s*\(\s*true\s*\)/.test(line)) {
        issues.push({
          severity: 'warning',
          message: 'Condition is always true',
          line: lineNum,
          category: 'logic',
          code: 'CONSTANT_CONDITION',
          suggestion: 'Remove condition or fix logic',
        });
      }

      if (/if\s*\(\s*false\s*\)/.test(line)) {
        issues.push({
          severity: 'warning',
          message: 'Condition is always false - code block never executes',
          line: lineNum,
          category: 'logic',
          code: 'DEAD_CODE_BLOCK',
          suggestion: 'Remove dead code block',
        });
      }
    }

    return issues;
  }

  /**
   * Detect logical errors in conditionals
   */
  private detectLogicErrors(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for assignment in condition (= instead of ==)
      if (/if\s*\([^)]*[^=!<>]=(?!=)[^=]/.test(line)) {
        issues.push({
          severity: 'error',
          message: 'Assignment in condition - did you mean == or ===?',
          line: lineNum,
          category: 'logic',
          code: 'ASSIGNMENT_IN_CONDITION',
          suggestion: 'Use == or === for comparison, not =',
        });
      }

      // Check for duplicate conditions
      const ifMatch = line.match(/if\s*\((.*?)\)/);
      if (ifMatch && i < lines.length - 1) {
        const condition = ifMatch[1];
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j];
          if (/else\s+if/.test(nextLine) && nextLine.includes(condition)) {
            issues.push({
              severity: 'warning',
              message: 'Duplicate condition in else-if chain',
              line: j + 1,
              category: 'logic',
              code: 'DUPLICATE_CONDITION',
              suggestion: 'Second condition will never be reached',
            });
          }
        }
      }

      // Check for bitwise operators that might be logical errors
      if (/[^&]&[^&]/.test(line) || /[^|]\|[^|]/.test(line)) {
        if (/if|while|return/.test(line)) {
          issues.push({
            severity: 'warning',
            message:
              'Using bitwise operator in condition - did you mean && or ||?',
            line: lineNum,
            category: 'logic',
            code: 'BITWISE_IN_CONDITION',
            suggestion: 'Use && for logical AND, || for logical OR',
          });
        }
      }

      // Check for negation errors
      if (/if\s*\(\s*!.*===/.test(line)) {
        issues.push({
          severity: 'warning',
          message: 'Negation with === - ensure operator precedence is correct',
          line: lineNum,
          category: 'logic',
          code: 'NEGATION_PRECEDENCE',
          suggestion: 'Use parentheses: if (!(x === y)) or if (x !== y)',
        });
      }
    }

    return issues;
  }

  /**
   * Detect async/await misuse
   */
  private detectAsyncIssues(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!['javascript', 'typescript'].includes(language.toLowerCase())) {
      return issues;
    }

    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for await in non-async function
      if (/\bawait\b/.test(line)) {
        let hasAsync = false;
        // Look backwards for function declaration
        for (let j = Math.max(0, i - 10); j < i; j++) {
          if (/\basync\b/.test(lines[j]) && /function|=>/.test(lines[j])) {
            hasAsync = true;
            break;
          }
        }

        if (!hasAsync) {
          issues.push({
            severity: 'error',
            message: 'await used outside async function',
            line: lineNum,
            category: 'logic',
            code: 'AWAIT_WITHOUT_ASYNC',
            suggestion: 'Wrap in async function or remove await',
          });
        }
      }

      // Check for missing await on Promise-returning functions
      const promiseFunctions = [
        'fetch',
        'axios',
        '.json()',
        '.text()',
        '.then',
        'Promise',
        'readFile',
        'writeFile',
      ];
      for (const promiseFunc of promiseFunctions) {
        if (
          line.includes(promiseFunc) &&
          !line.includes('await') &&
          !line.includes('.then') &&
          !line.includes('.catch')
        ) {
          // Check if result is assigned but not awaited
          if (/(?:const|let|var)\s+\w+\s*=/.test(line)) {
            issues.push({
              severity: 'warning',
              message: `Promise-returning function '${promiseFunc}' called without await`,
              line: lineNum,
              category: 'logic',
              code: 'MISSING_AWAIT',
              suggestion: 'Add await keyword or handle with .then()/.catch()',
            });
          }
        }
      }

      // Check for Promise constructor anti-pattern
      if (/new\s+Promise.*async/.test(line)) {
        issues.push({
          severity: 'warning',
          message: 'Unnecessary Promise constructor with async function',
          line: lineNum,
          category: 'logic',
          code: 'PROMISE_ANTI_PATTERN',
          suggestion: 'async functions already return Promises',
        });
      }

      // Check for unhandled Promise rejection
      if (/\.then\s*\(/.test(line) && !line.includes('.catch')) {
        // Check if .catch appears in next few lines
        let hasCatch = false;
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          if (/\.catch\s*\(/.test(lines[j])) {
            hasCatch = true;
            break;
          }
        }

        if (!hasCatch) {
          issues.push({
            severity: 'warning',
            message:
              'Promise chain without .catch() - unhandled rejection possible',
            line: lineNum,
            category: 'logic',
            code: 'UNHANDLED_PROMISE_REJECTION',
            suggestion: 'Add .catch() to handle errors',
          });
        }
      }
    }

    return issues;
  }
}
