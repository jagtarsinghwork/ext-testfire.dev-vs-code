import { Logger } from '../utils/Logger';
import {
  SyntaxValidator,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
} from './SyntaxValidator';
import { LogicValidator } from './LogicValidator';
import { SecurityValidator } from './SecurityValidator';

/**
 * Priority levels for validation results
 */
export type ValidationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Aggregated validation result with all validators
 */
export interface AggregatedValidationResult {
  valid: boolean;
  overallScore: number; // 0-100, higher is better
  totalIssues: number;
  criticalIssues: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  byCategory: {
    syntax: ValidationIssue[];
    logic: ValidationIssue[];
    security: ValidationIssue[];
    style: ValidationIssue[];
  };
  byPriority: {
    critical: ValidationIssue[];
    high: ValidationIssue[];
    medium: ValidationIssue[];
    low: ValidationIssue[];
  };
  processingTimeMs: number;
  validatorResults: {
    syntax: ValidationResult;
    logic: ValidationResult;
    security: ValidationResult;
  };
}

/**
 * Validation configuration options
 */
export interface ValidationOptions {
  enableSyntax?: boolean;
  enableLogic?: boolean;
  enableSecurity?: boolean;
  minSeverity?: ValidationSeverity;
  maxIssues?: number;
  timeoutMs?: number;
}

/**
 * ValidationOrchestrator coordinates all validators and aggregates results.
 *
 * Features:
 * - Runs syntax, logic, and security validators in parallel
 * - Aggregates and prioritizes results
 * - Provides overall code quality score
 * - Integrates with FileChangeManager for pre-commit validation
 * - Supports configurable validation options
 */
export class ValidationOrchestrator {
  private logger: Logger;
  private syntaxValidator: SyntaxValidator;
  private logicValidator: LogicValidator;
  private securityValidator: SecurityValidator;

  constructor() {
    this.logger = new Logger('ValidationOrchestrator');
    this.syntaxValidator = new SyntaxValidator();
    this.logicValidator = new LogicValidator();
    this.securityValidator = new SecurityValidator();
  }

  /**
   * Validate code using all enabled validators
   * @param code - Source code to validate
   * @param language - Programming language
   * @param fileName - Optional file name for better error messages
   * @param options - Validation options
   * @returns Aggregated validation result
   */
  public async validate(
    code: string,
    language: string,
    fileName?: string,
    options: ValidationOptions = {},
  ): Promise<AggregatedValidationResult> {
    const startTime = Date.now();

    this.logger.info(`Validating code`, {
      language,
      fileName,
      codeLength: code.length,
      options,
    });

    // Set defaults
    const opts: Required<ValidationOptions> = {
      enableSyntax: options.enableSyntax ?? true,
      enableLogic: options.enableLogic ?? true,
      enableSecurity: options.enableSecurity ?? true,
      minSeverity: options.minSeverity ?? 'info',
      maxIssues: options.maxIssues ?? 1000,
      timeoutMs: options.timeoutMs ?? 30000,
    };

    // Run validators in parallel with timeout protection
    const validationPromises: Array<Promise<ValidationResult>> = [];

    if (opts.enableSyntax) {
      validationPromises.push(
        this.runWithTimeout(
          () =>
            Promise.resolve(
              this.syntaxValidator.validate(code, language, fileName),
            ),
          opts.timeoutMs,
          'Syntax validation',
        ),
      );
    } else {
      validationPromises.push(Promise.resolve(this.emptyResult()));
    }

    if (opts.enableLogic) {
      validationPromises.push(
        this.runWithTimeout(
          () =>
            Promise.resolve(
              this.logicValidator.validate(code, language, fileName),
            ),
          opts.timeoutMs,
          'Logic validation',
        ),
      );
    } else {
      validationPromises.push(Promise.resolve(this.emptyResult()));
    }

    if (opts.enableSecurity) {
      validationPromises.push(
        this.runWithTimeout(
          () =>
            Promise.resolve(
              this.securityValidator.validate(code, language, fileName),
            ),
          opts.timeoutMs,
          'Security validation',
        ),
      );
    } else {
      validationPromises.push(Promise.resolve(this.emptyResult()));
    }

    try {
      const [syntaxResult, logicResult, securityResult] =
        await Promise.all(validationPromises);

      // Aggregate results
      const aggregated = this.aggregateResults(
        syntaxResult,
        logicResult,
        securityResult,
        opts,
        Date.now() - startTime,
      );

      this.logger.info(`Validation completed`, {
        valid: aggregated.valid,
        score: aggregated.overallScore,
        totalIssues: aggregated.totalIssues,
        critical: aggregated.criticalIssues,
        timeMs: aggregated.processingTimeMs,
      });

      return aggregated;
    } catch (error: any) {
      this.logger.error(
        `Validation orchestration failed: ${error.message}`,
        error,
      );

      // Return error result
      return {
        valid: false,
        overallScore: 0,
        totalIssues: 1,
        criticalIssues: 1,
        errors: [
          {
            severity: 'error',
            message: `Validation failed: ${error.message}`,
            category: 'syntax',
          },
        ],
        warnings: [],
        info: [],
        byCategory: {
          syntax: [],
          logic: [],
          security: [],
          style: [],
        },
        byPriority: {
          critical: [],
          high: [],
          medium: [],
          low: [],
        },
        processingTimeMs: Date.now() - startTime,
        validatorResults: {
          syntax: this.emptyResult(),
          logic: this.emptyResult(),
          security: this.emptyResult(),
        },
      };
    }
  }

  /**
   * Validate multiple files in batch
   * @param files - Array of file objects with code, language, and fileName
   * @param options - Validation options
   * @returns Map of fileName to validation result
   */
  public async validateBatch(
    files: Array<{ code: string; language: string; fileName: string }>,
    options: ValidationOptions = {},
  ): Promise<Map<string, AggregatedValidationResult>> {
    this.logger.info(`Batch validation starting`, { fileCount: files.length });

    const results = new Map<string, AggregatedValidationResult>();

    // Validate files in parallel (with concurrency limit)
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(files, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((file) =>
          this.validate(file.code, file.language, file.fileName, options).then(
            (result) => ({ fileName: file.fileName, result }),
          ),
        ),
      );

      for (const { fileName, result } of chunkResults) {
        results.set(fileName, result);
      }
    }

    this.logger.info(`Batch validation completed`, { fileCount: files.length });

    return results;
  }

  /**
   * Quick validation - syntax only, faster for real-time feedback
   * @param code - Source code to validate
   * @param language - Programming language
   * @returns Validation result with only syntax checks
   */
  public quickValidate(code: string, language: string): ValidationResult {
    return this.syntaxValidator.validate(code, language);
  }

  /**
   * Get validation summary for reporting
   * @param result - Aggregated validation result
   * @returns Human-readable summary
   */
  public getSummary(result: AggregatedValidationResult): string {
    const lines: string[] = [];

    lines.push(`Validation Summary:`);
    lines.push(`  Overall Score: ${result.overallScore}/100`);
    lines.push(`  Status: ${result.valid ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`  Total Issues: ${result.totalIssues}`);

    if (result.criticalIssues > 0) {
      lines.push(`  ⚠ Critical Issues: ${result.criticalIssues}`);
    }

    lines.push(``);
    lines.push(`Issues by Severity:`);
    lines.push(`  Errors:   ${result.errors.length}`);
    lines.push(`  Warnings: ${result.warnings.length}`);
    lines.push(`  Info:     ${result.info.length}`);

    lines.push(``);
    lines.push(`Issues by Category:`);
    lines.push(`  Syntax:   ${result.byCategory.syntax.length}`);
    lines.push(`  Logic:    ${result.byCategory.logic.length}`);
    lines.push(`  Security: ${result.byCategory.security.length}`);
    lines.push(`  Style:    ${result.byCategory.style.length}`);

    if (result.byPriority.critical.length > 0) {
      lines.push(``);
      lines.push(`Critical Issues:`);
      for (const issue of result.byPriority.critical.slice(0, 5)) {
        lines.push(
          `  • ${issue.message} ${issue.line ? `(line ${issue.line})` : ''}`,
        );
      }
      if (result.byPriority.critical.length > 5) {
        lines.push(`  ... and ${result.byPriority.critical.length - 5} more`);
      }
    }

    lines.push(``);
    lines.push(`Processing Time: ${result.processingTimeMs}ms`);

    return lines.join('\n');
  }

  /**
   * Get detailed report with all issues
   * @param result - Aggregated validation result
   * @returns Detailed report string
   */
  public getDetailedReport(result: AggregatedValidationResult): string {
    const lines: string[] = [];

    lines.push(`${'='.repeat(80)}`);
    lines.push(`VALIDATION REPORT`);
    lines.push(`${'='.repeat(80)}`);
    lines.push(``);

    lines.push(this.getSummary(result));
    lines.push(``);
    lines.push(`${'='.repeat(80)}`);

    // Group issues by priority
    const priorities: ValidationPriority[] = [
      'critical',
      'high',
      'medium',
      'low',
    ];

    for (const priority of priorities) {
      const issues = result.byPriority[priority];
      if (issues.length === 0) {
        continue;
      }

      lines.push(``);
      lines.push(
        `${priority.toUpperCase()} PRIORITY (${issues.length} issues):`,
      );
      lines.push(`${'-'.repeat(80)}`);

      for (const issue of issues) {
        lines.push(``);
        lines.push(`[${issue.severity.toUpperCase()}] ${issue.message}`);
        if (issue.line) {
          lines.push(
            `  Location: Line ${issue.line}${issue.column ? `, Column ${issue.column}` : ''}`,
          );
        }
        lines.push(`  Category: ${issue.category}`);
        if (issue.code) {
          lines.push(`  Code: ${issue.code}`);
        }
        if (issue.suggestion) {
          lines.push(`  Suggestion: ${issue.suggestion}`);
        }
      }
    }

    lines.push(``);
    lines.push(`${'='.repeat(80)}`);
    lines.push(`END OF REPORT`);
    lines.push(`${'='.repeat(80)}`);

    return lines.join('\n');
  }

  /**
   * Aggregate results from all validators
   */
  private aggregateResults(
    syntaxResult: ValidationResult,
    logicResult: ValidationResult,
    securityResult: ValidationResult,
    options: Required<ValidationOptions>,
    processingTimeMs: number,
  ): AggregatedValidationResult {
    // Collect all issues
    const allErrors = [
      ...syntaxResult.errors,
      ...logicResult.errors,
      ...securityResult.errors,
    ];
    const allWarnings = [
      ...syntaxResult.warnings,
      ...logicResult.warnings,
      ...securityResult.warnings,
    ];
    const allInfo = [
      ...syntaxResult.info,
      ...logicResult.info,
      ...securityResult.info,
    ];

    // Filter by minimum severity
    const filteredErrors = this.filterBySeverity(
      allErrors,
      options.minSeverity,
    );
    const filteredWarnings = this.filterBySeverity(
      allWarnings,
      options.minSeverity,
    );
    const filteredInfo = this.filterBySeverity(allInfo, options.minSeverity);

    // Combine and sort by line number
    const allIssues = [...filteredErrors, ...filteredWarnings, ...filteredInfo]
      .sort((a, b) => (a.line || 0) - (b.line || 0))
      .slice(0, options.maxIssues);

    // Group by category
    const byCategory = {
      syntax: allIssues.filter((i) => i.category === 'syntax'),
      logic: allIssues.filter((i) => i.category === 'logic'),
      security: allIssues.filter((i) => i.category === 'security'),
      style: allIssues.filter((i) => i.category === 'style'),
    };

    // Assign priorities and group
    const withPriority = allIssues.map((issue) => ({
      issue,
      priority: this.assignPriority(issue),
    }));

    const byPriority = {
      critical: withPriority
        .filter((i) => i.priority === 'critical')
        .map((i) => i.issue),
      high: withPriority
        .filter((i) => i.priority === 'high')
        .map((i) => i.issue),
      medium: withPriority
        .filter((i) => i.priority === 'medium')
        .map((i) => i.issue),
      low: withPriority.filter((i) => i.priority === 'low').map((i) => i.issue),
    };

    // Calculate overall score (0-100)
    const score = this.calculateScore(
      filteredErrors.length,
      filteredWarnings.length,
      filteredInfo.length,
      byPriority.critical.length,
    );

    return {
      valid: filteredErrors.length === 0 && byPriority.critical.length === 0,
      overallScore: score,
      totalIssues: allIssues.length,
      criticalIssues: byPriority.critical.length,
      errors: filteredErrors,
      warnings: filteredWarnings,
      info: filteredInfo,
      byCategory,
      byPriority,
      processingTimeMs,
      validatorResults: {
        syntax: syntaxResult,
        logic: logicResult,
        security: securityResult,
      },
    };
  }

  /**
   * Assign priority to an issue based on severity and category
   */
  private assignPriority(issue: ValidationIssue): ValidationPriority {
    // Security errors are always critical
    if (issue.category === 'security' && issue.severity === 'error') {
      return 'critical';
    }

    // Certain codes are critical
    const criticalCodes = [
      'SQL_INJECTION',
      'XSS_INNERHTML',
      'COMMAND_INJECTION',
      'HARDCODED_SECRET',
      'UNSAFE_EVAL',
      'INFINITE_LOOP',
      'MULTIPLICATION_BUG',
    ];
    if (issue.code && criticalCodes.includes(issue.code)) {
      return 'critical';
    }

    // Map severity to priority
    if (issue.severity === 'error') {
      return issue.category === 'syntax' ? 'high' : 'medium';
    }

    if (issue.severity === 'warning') {
      return issue.category === 'security' ? 'high' : 'medium';
    }

    return 'low';
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateScore(
    errors: number,
    warnings: number,
    info: number,
    critical: number,
  ): number {
    let score = 100;

    // Critical issues have severe impact
    score -= critical * 20;

    // Errors are significant
    score -= errors * 5;

    // Warnings have moderate impact
    score -= warnings * 2;

    // Info has minor impact
    score -= info * 0.5;

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Filter issues by minimum severity level
   */
  private filterBySeverity(
    issues: ValidationIssue[],
    minSeverity: ValidationSeverity,
  ): ValidationIssue[] {
    const severityLevels: ValidationSeverity[] = ['info', 'warning', 'error'];
    const minLevel = severityLevels.indexOf(minSeverity);

    return issues.filter((issue) => {
      const issueLevel = severityLevels.indexOf(issue.severity);
      return issueLevel >= minLevel;
    });
  }

  /**
   * Run a validation function with timeout protection
   */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    name: string,
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${name} timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Create an empty validation result
   */
  private emptyResult(): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      processingTimeMs: 0,
    };
  }

  /**
   * Chunk array for parallel processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Export singleton instance for convenience
export const validationOrchestrator = new ValidationOrchestrator();
