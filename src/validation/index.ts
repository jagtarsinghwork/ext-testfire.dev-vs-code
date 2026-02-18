/**
 * Code Validation System
 *
 * A comprehensive validation framework for detecting:
 * - Syntax errors (brace balance, quotes, language-specific syntax)
 * - Logic bugs (multiplication bug, off-by-one, null access, infinite loops)
 * - Security vulnerabilities (SQL injection, XSS, hardcoded secrets, unsafe eval)
 *
 * @example
 * ```typescript
 * import { validationOrchestrator } from './validation';
 *
 * const result = await validationOrchestrator.validate(
 *   code,
 *   'typescript',
 *   'myFile.ts'
 * );
 *
 * console.log(validationOrchestrator.getSummary(result));
 * ```
 */

// Validators
export { SyntaxValidator } from './SyntaxValidator';
export { LogicValidator } from './LogicValidator';
export { SecurityValidator } from './SecurityValidator';
export {
  ValidationOrchestrator,
  validationOrchestrator,
} from './ValidationOrchestrator';

// Types
export type {
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
  SupportedLanguage,
} from './SyntaxValidator';

export type {
  AggregatedValidationResult,
  ValidationOptions,
  ValidationPriority,
} from './ValidationOrchestrator';
