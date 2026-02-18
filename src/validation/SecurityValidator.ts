import { Logger } from '../utils/Logger';
import { ValidationResult, ValidationIssue } from './SyntaxValidator';

/**
 * Security vulnerability pattern
 */
interface SecurityPattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  owaspCategory?: string;
  detector: (code: string, language: string) => ValidationIssue[];
}

/**
 * SecurityValidator scans code for security vulnerabilities.
 * Detects common security issues including:
 * - SQL injection patterns
 * - XSS (Cross-Site Scripting) vulnerabilities
 * - Hardcoded secrets (API keys, passwords, tokens)
 * - Unsafe eval() and Function() usage
 * - Command injection risks
 * - Path traversal vulnerabilities
 * - Insecure cryptography
 * - OWASP Top 10 basic checks
 */
export class SecurityValidator {
  private logger: Logger;
  private patterns: SecurityPattern[];

  // Common patterns for secrets
  private readonly SECRET_PATTERNS = [
    {
      name: 'API Key',
      pattern: /(?:api[_-]?key|apikey)[\s:=]+['"]([a-zA-Z0-9_\-]{20,})['"]/,
    },
    { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/ },
    {
      name: 'Private Key',
      pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    },
    {
      name: 'Password',
      pattern: /(?:password|passwd|pwd)[\s:=]+['"](?!.*\$\{)([^'"]{3,})['"]/,
    },
    {
      name: 'Secret',
      pattern: /(?:secret|token)[\s:=]+['"]([a-zA-Z0-9_\-]{20,})['"]/,
    },
    {
      name: 'Database URL',
      pattern: /(?:mongodb|mysql|postgres):\/\/[^:]+:[^@]+@/,
    },
    {
      name: 'JWT Token',
      pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    },
    {
      name: 'OAuth Token',
      pattern:
        /(?:access_token|auth_token)['"]?\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{30,})['"]/,
    },
    { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
    {
      name: 'Slack Token',
      pattern: /xox[baprs]-[0-9]{10,13}-[a-zA-Z0-9-]{24,}/,
    },
  ];

  constructor() {
    this.logger = new Logger('SecurityValidator');
    this.patterns = this.initializePatterns();
  }

  /**
   * Validate code for security vulnerabilities
   * @param code - Source code to validate
   * @param language - Programming language
   * @param fileName - Optional file name for better error messages
   * @returns ValidationResult with any security issues found
   */
  public validate(
    code: string,
    language: string,
    fileName?: string,
  ): ValidationResult {
    const startTime = Date.now();
    this.logger.debug(
      `Validating security for ${language}${fileName ? ` (${fileName})` : ''}`,
    );

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };

    try {
      // Run all security pattern detectors
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
            `Security detector '${pattern.name}' failed: ${error.message}`,
          );
        }
      }

      result.valid = result.errors.length === 0;
      result.processingTimeMs = Date.now() - startTime;

      this.logger.debug(`Security validation completed`, {
        errors: result.errors.length,
        warnings: result.warnings.length,
        timeMs: result.processingTimeMs,
      });
    } catch (error: any) {
      this.logger.error(`Security validation failed: ${error.message}`, error);
      result.errors.push({
        severity: 'error',
        message: `Security validation failed: ${error.message}`,
        category: 'security',
      });
      result.valid = false;
    }

    return result;
  }

  /**
   * Initialize all security pattern detectors
   */
  private initializePatterns(): SecurityPattern[] {
    return [
      {
        name: 'sql-injection',
        description: 'Detect SQL injection vulnerabilities',
        severity: 'error',
        owaspCategory: 'A03:2021 - Injection',
        detector: this.detectSQLInjection.bind(this),
      },
      {
        name: 'xss',
        description: 'Detect XSS vulnerabilities',
        severity: 'error',
        owaspCategory: 'A03:2021 - Injection',
        detector: this.detectXSS.bind(this),
      },
      {
        name: 'hardcoded-secrets',
        description: 'Detect hardcoded secrets and credentials',
        severity: 'error',
        owaspCategory: 'A07:2021 - Identification and Authentication Failures',
        detector: this.detectHardcodedSecrets.bind(this),
      },
      {
        name: 'unsafe-eval',
        description: 'Detect unsafe eval() usage',
        severity: 'error',
        owaspCategory: 'A03:2021 - Injection',
        detector: this.detectUnsafeEval.bind(this),
      },
      {
        name: 'command-injection',
        description: 'Detect command injection vulnerabilities',
        severity: 'error',
        owaspCategory: 'A03:2021 - Injection',
        detector: this.detectCommandInjection.bind(this),
      },
      {
        name: 'path-traversal',
        description: 'Detect path traversal vulnerabilities',
        severity: 'error',
        owaspCategory: 'A01:2021 - Broken Access Control',
        detector: this.detectPathTraversal.bind(this),
      },
      {
        name: 'insecure-crypto',
        description: 'Detect insecure cryptography',
        severity: 'warning',
        owaspCategory: 'A02:2021 - Cryptographic Failures',
        detector: this.detectInsecureCrypto.bind(this),
      },
      {
        name: 'insecure-random',
        description: 'Detect insecure random number generation',
        severity: 'warning',
        owaspCategory: 'A02:2021 - Cryptographic Failures',
        detector: this.detectInsecureRandom.bind(this),
      },
      {
        name: 'unsafe-deserialization',
        description: 'Detect unsafe deserialization',
        severity: 'error',
        owaspCategory: 'A08:2021 - Software and Data Integrity Failures',
        detector: this.detectUnsafeDeserialization.bind(this),
      },
      {
        name: 'xxe',
        description: 'Detect XML External Entity (XXE) vulnerabilities',
        severity: 'error',
        owaspCategory: 'A05:2021 - Security Misconfiguration',
        detector: this.detectXXE.bind(this),
      },
    ];
  }

  /**
   * Detect SQL injection vulnerabilities
   */
  private detectSQLInjection(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript SQL injection patterns
      if (['javascript', 'typescript'].includes(language.toLowerCase())) {
        // String concatenation in SQL queries
        const sqlConcatPatterns = [
          /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).*\+\s*\w+/i,
          /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).*\$\{\s*\w+\s*\}/i,
          /\.query\s*\(\s*['"`].*\+/i,
          /\.query\s*\(\s*`.*\$\{/i,
        ];

        for (const pattern of sqlConcatPatterns) {
          if (pattern.test(line)) {
            // Check if using parameterized queries
            if (
              !line.includes('?') &&
              !line.includes('$1') &&
              !line.includes('prepare')
            ) {
              issues.push({
                severity: 'error',
                message:
                  'Potential SQL injection: string concatenation in SQL query',
                line: lineNum,
                category: 'security',
                code: 'SQL_INJECTION',
                suggestion: 'Use parameterized queries or prepared statements',
              });
            }
          }
        }

        // Check for raw SQL execution
        if (
          /(exec|execute|query)\s*\(\s*['"`].*\$\{/.test(line) &&
          /SELECT|INSERT|UPDATE|DELETE/i.test(line)
        ) {
          issues.push({
            severity: 'error',
            message: 'Potential SQL injection: template literal in SQL query',
            line: lineNum,
            category: 'security',
            code: 'SQL_INJECTION',
            suggestion: 'Use parameterized queries with placeholders',
          });
        }
      }

      // Python SQL injection patterns
      if (language.toLowerCase() === 'python') {
        const pythonSqlPatterns = [
          /(?:execute|executemany)\s*\(\s*['"].*%.*['"].*%/,
          /(?:execute|executemany)\s*\(\s*f['"]/,
          /(?:execute|executemany)\s*\(\s*['"].*\+/,
        ];

        for (const pattern of pythonSqlPatterns) {
          if (pattern.test(line)) {
            issues.push({
              severity: 'error',
              message:
                'Potential SQL injection: string formatting in SQL query',
              line: lineNum,
              category: 'security',
              code: 'SQL_INJECTION',
              suggestion: 'Use parameterized queries with placeholders (?, %s)',
            });
          }
        }
      }

      // Check for raw query execution
      if (
        /(raw|unsafe).*query/i.test(line) &&
        /SELECT|INSERT|UPDATE|DELETE/i.test(line)
      ) {
        issues.push({
          severity: 'warning',
          message: 'Raw SQL query detected - ensure input is sanitized',
          line: lineNum,
          category: 'security',
          code: 'RAW_SQL_QUERY',
          suggestion: 'Use ORM methods or ensure thorough input validation',
        });
      }
    }

    return issues;
  }

  /**
   * Detect XSS (Cross-Site Scripting) vulnerabilities
   */
  private detectXSS(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript XSS patterns
      if (
        ['javascript', 'typescript', 'html'].includes(language.toLowerCase())
      ) {
        // innerHTML with user input
        if (
          /\.innerHTML\s*=/.test(line) &&
          !line.includes('DOMPurify') &&
          !line.includes('sanitize')
        ) {
          // Check if using template literals or concatenation
          if (/\$\{|\+/.test(line)) {
            issues.push({
              severity: 'error',
              message: 'Potential XSS: innerHTML with unsanitized user input',
              line: lineNum,
              category: 'security',
              code: 'XSS_INNERHTML',
              suggestion:
                'Use textContent, or sanitize with DOMPurify before setting innerHTML',
            });
          }
        }

        // document.write with user input
        if (
          /document\.write\s*\(/.test(line) &&
          (/\$\{|\+/.test(line) || /\bparams\b|\breq\b|\binput\b/.test(line))
        ) {
          issues.push({
            severity: 'error',
            message: 'Potential XSS: document.write with unsanitized input',
            line: lineNum,
            category: 'security',
            code: 'XSS_DOCUMENT_WRITE',
            suggestion:
              'Avoid document.write, use DOM manipulation methods instead',
          });
        }

        // eval with user input
        if (
          /eval\s*\(/.test(line) &&
          /\bparams\b|\breq\b|\binput\b|\bquery\b/.test(line)
        ) {
          issues.push({
            severity: 'error',
            message: 'Potential XSS: eval with user input',
            line: lineNum,
            category: 'security',
            code: 'XSS_EVAL',
            suggestion:
              'Never use eval with user input, use JSON.parse for data',
          });
        }

        // dangerouslySetInnerHTML in React
        if (
          /dangerouslySetInnerHTML/.test(line) &&
          !line.includes('DOMPurify')
        ) {
          issues.push({
            severity: 'error',
            message:
              'Potential XSS: dangerouslySetInnerHTML without sanitization',
            line: lineNum,
            category: 'security',
            code: 'XSS_REACT',
            suggestion:
              'Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML',
          });
        }

        // Unescaped template rendering
        if (/\{\{\{.*\}\}\}/.test(line)) {
          issues.push({
            severity: 'warning',
            message: 'Unescaped template variable - potential XSS',
            line: lineNum,
            category: 'security',
            code: 'XSS_TEMPLATE',
            suggestion: 'Use escaped variables {{...}} instead of {{{...}}}',
          });
        }

        // jQuery html() with user input
        if (
          /\$\(.*\)\.html\s*\(/.test(line) &&
          (/\$\{|\+/.test(line) || /\bparams\b|\breq\b|\binput\b/.test(line))
        ) {
          issues.push({
            severity: 'error',
            message: 'Potential XSS: jQuery html() with unsanitized input',
            line: lineNum,
            category: 'security',
            code: 'XSS_JQUERY',
            suggestion: 'Use .text() or sanitize input before .html()',
          });
        }
      }

      // Python XSS patterns
      if (language.toLowerCase() === 'python') {
        // Flask/Django unsafe rendering
        if (/\|safe/.test(line) || /mark_safe/.test(line)) {
          issues.push({
            severity: 'warning',
            message:
              'Marking content as safe - ensure it is properly sanitized',
            line: lineNum,
            category: 'security',
            code: 'XSS_SAFE_MARKER',
            suggestion: 'Only mark content as safe if it has been sanitized',
          });
        }

        // String formatting in HTML
        if (
          /(render|response).*\.format\(|%(.*?)s/.test(line) &&
          /<[^>]*>/.test(line)
        ) {
          issues.push({
            severity: 'warning',
            message: 'HTML generation with string formatting - potential XSS',
            line: lineNum,
            category: 'security',
            code: 'XSS_STRING_FORMAT',
            suggestion: 'Use template engine with auto-escaping',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect hardcoded secrets and credentials
   */
  private detectHardcodedSecrets(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments and imports
      if (/^\s*(\/\/|#|import|from|require)/.test(line)) {
        continue;
      }

      // Check each secret pattern
      for (const secretPattern of this.SECRET_PATTERNS) {
        const match = line.match(secretPattern.pattern);
        if (match) {
          // Skip if it's a placeholder or environment variable reference
          if (this.isPlaceholder(line)) {
            continue;
          }

          issues.push({
            severity: 'error',
            message: `Hardcoded ${secretPattern.name} detected`,
            line: lineNum,
            category: 'security',
            code: 'HARDCODED_SECRET',
            suggestion: `Use environment variables: process.env.${secretPattern.name.toUpperCase().replace(/\s/g, '_')}`,
          });
        }
      }

      // Additional generic secret patterns
      const genericSecrets = [
        /const.*(?:key|token|secret|password).*=\s*['"][a-zA-Z0-9+/=]{20,}['"]/i,
        /Authorization:\s*['"]Bearer [a-zA-Z0-9_\-\.]{20,}['"]/,
      ];

      for (const pattern of genericSecrets) {
        if (pattern.test(line) && !this.isPlaceholder(line)) {
          issues.push({
            severity: 'error',
            message: 'Potential hardcoded secret or token detected',
            line: lineNum,
            category: 'security',
            code: 'HARDCODED_SECRET',
            suggestion: 'Move secrets to environment variables or secure vault',
          });
        }
      }

      // Check for exposed credentials in URLs
      if (/(?:https?|ftp):\/\/[^:]+:[^@]+@/.test(line)) {
        issues.push({
          severity: 'error',
          message: 'Credentials in URL - security risk',
          line: lineNum,
          category: 'security',
          code: 'CREDENTIALS_IN_URL',
          suggestion: 'Use authentication tokens or environment variables',
        });
      }
    }

    return issues;
  }

  /**
   * Detect unsafe eval() usage
   */
  private detectUnsafeEval(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript eval patterns
      if (['javascript', 'typescript'].includes(language.toLowerCase())) {
        // Direct eval usage
        if (/\beval\s*\(/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Unsafe eval() usage detected',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_EVAL',
            suggestion:
              'Avoid eval(). Use JSON.parse() for data, or refactor to avoid dynamic code execution',
          });
        }

        // Function constructor
        if (/new\s+Function\s*\(/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Function constructor detected (similar to eval)',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_FUNCTION_CONSTRUCTOR',
            suggestion:
              'Avoid Function constructor, refactor to use regular functions',
          });
        }

        // setTimeout/setInterval with string
        if (/(setTimeout|setInterval)\s*\(\s*['"`]/.test(line)) {
          issues.push({
            severity: 'warning',
            message: 'setTimeout/setInterval with string (implicit eval)',
            line: lineNum,
            category: 'security',
            code: 'IMPLICIT_EVAL',
            suggestion: 'Pass a function instead of a string',
          });
        }
      }

      // Python eval patterns
      if (language.toLowerCase() === 'python') {
        if (/\beval\s*\(/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Unsafe eval() usage detected',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_EVAL',
            suggestion:
              'Avoid eval(). Use ast.literal_eval() for safe evaluation',
          });
        }

        if (/\bexec\s*\(/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Unsafe exec() usage detected',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_EXEC',
            suggestion:
              'Avoid exec(). Refactor to avoid dynamic code execution',
          });
        }

        if (
          /\b__import__\s*\(/.test(line) &&
          /\bparams\b|\binput\b|\brequest\b/.test(line)
        ) {
          issues.push({
            severity: 'error',
            message: 'Dynamic import with user input',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_IMPORT',
            suggestion: 'Never import modules based on user input',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect command injection vulnerabilities
   */
  private detectCommandInjection(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript command injection
      if (['javascript', 'typescript'].includes(language.toLowerCase())) {
        // exec, spawn with string concatenation
        const execPatterns = [
          /exec\s*\(\s*['"`].*\$\{/,
          /exec\s*\(\s*['"`].*\+/,
          /spawn\s*\(\s*['"`].*\$\{/,
          /execSync\s*\(\s*['"`].*\$\{/,
        ];

        for (const pattern of execPatterns) {
          if (pattern.test(line)) {
            issues.push({
              severity: 'error',
              message:
                'Potential command injection: dynamic shell command execution',
              line: lineNum,
              category: 'security',
              code: 'COMMAND_INJECTION',
              suggestion:
                'Use spawn with array arguments instead of exec with concatenated strings',
            });
          }
        }

        // child_process.exec with user input
        if (
          /exec\s*\(/.test(line) &&
          /\breq\.|params\.|input\.|query\./.test(line)
        ) {
          issues.push({
            severity: 'error',
            message: 'Command execution with user input',
            line: lineNum,
            category: 'security',
            code: 'COMMAND_INJECTION',
            suggestion:
              'Validate and sanitize input, or use parameterized spawn()',
          });
        }
      }

      // Python command injection
      if (language.toLowerCase() === 'python') {
        // os.system with string formatting
        if (
          /os\.system\s*\(/.test(line) &&
          /\.format\(|%|\+|f['"]/.test(line)
        ) {
          issues.push({
            severity: 'error',
            message:
              'Potential command injection: os.system with string formatting',
            line: lineNum,
            category: 'security',
            code: 'COMMAND_INJECTION',
            suggestion:
              'Use subprocess with list arguments instead of os.system',
          });
        }

        // subprocess with shell=True
        if (/subprocess\.\w+\(.*shell\s*=\s*True/.test(line)) {
          issues.push({
            severity: 'warning',
            message:
              'subprocess with shell=True - potential command injection risk',
            line: lineNum,
            category: 'security',
            code: 'SHELL_INJECTION_RISK',
            suggestion: 'Use shell=False and pass command as list of arguments',
          });
        }

        // eval with os/subprocess
        if (/(os\.system|subprocess)\s*\(.*eval/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Command execution with eval - severe security risk',
            line: lineNum,
            category: 'security',
            code: 'EVAL_COMMAND_INJECTION',
            suggestion: 'Never combine eval with command execution',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect path traversal vulnerabilities
   */
  private detectPathTraversal(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // File operations with user input
      const fileOps = [
        'readFile',
        'writeFile',
        'open',
        'fs.',
        'path.join',
        '__file__',
        'File(',
      ];
      const userInputMarkers = [
        'req.',
        'params.',
        'query.',
        'input.',
        'request.',
        'body.',
      ];

      let hasFileOp = false;
      let hasUserInput = false;

      for (const op of fileOps) {
        if (line.includes(op)) {
          hasFileOp = true;
          break;
        }
      }

      for (const marker of userInputMarkers) {
        if (line.includes(marker)) {
          hasUserInput = true;
          break;
        }
      }

      if (hasFileOp && hasUserInput) {
        // Check if path validation is present
        if (
          !line.includes('normalize') &&
          !line.includes('resolve') &&
          !line.includes('sanitize')
        ) {
          issues.push({
            severity: 'error',
            message:
              'Potential path traversal: file operation with unsanitized user input',
            line: lineNum,
            category: 'security',
            code: 'PATH_TRAVERSAL',
            suggestion:
              'Validate and sanitize file paths, use path.normalize() and check against base directory',
          });
        }
      }

      // Direct path concatenation
      if (/(readFile|writeFile|open)\s*\(.*\+.*\breq\b/.test(line)) {
        issues.push({
          severity: 'error',
          message: 'Path concatenation with user input - path traversal risk',
          line: lineNum,
          category: 'security',
          code: 'PATH_TRAVERSAL',
          suggestion:
            'Use path.join() with validation, check for ".." in paths',
        });
      }

      // Check for .. in path operations
      if (hasFileOp && line.includes('..')) {
        issues.push({
          severity: 'warning',
          message: 'Path traversal sequence ".." detected in file operation',
          line: lineNum,
          category: 'security',
          code: 'PATH_TRAVERSAL_SEQUENCE',
          suggestion: 'Ensure path is validated and normalized',
        });
      }
    }

    return issues;
  }

  /**
   * Detect insecure cryptography
   */
  private detectInsecureCrypto(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    // Weak algorithms
    const weakAlgorithms = ['MD5', 'SHA1', 'DES', 'RC4', 'ECB'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for weak hash algorithms
      for (const algo of weakAlgorithms) {
        const pattern = new RegExp(`['"]${algo}['"]|${algo}\\(`, 'i');
        if (
          pattern.test(line) &&
          (line.includes('crypto') ||
            line.includes('hash') ||
            line.includes('digest'))
        ) {
          issues.push({
            severity: 'warning',
            message: `Weak cryptographic algorithm detected: ${algo}`,
            line: lineNum,
            category: 'security',
            code: 'WEAK_CRYPTO',
            suggestion: `Use stronger algorithms: SHA-256, SHA-384, or SHA-512 instead of ${algo}`,
          });
        }
      }

      // Check for hardcoded crypto keys
      if (/(crypto|cipher).*key.*=\s*['"][a-zA-Z0-9+/=]{16,}['"]/.test(line)) {
        issues.push({
          severity: 'error',
          message: 'Hardcoded cryptographic key detected',
          line: lineNum,
          category: 'security',
          code: 'HARDCODED_CRYPTO_KEY',
          suggestion:
            'Store keys securely in environment variables or key management service',
        });
      }

      // Check for weak password hashing
      if (
        /(password|passwd).*=.*\.digest\(/.test(line) &&
        !/(bcrypt|scrypt|argon2|pbkdf2)/.test(line)
      ) {
        issues.push({
          severity: 'warning',
          message:
            'Weak password hashing - consider using bcrypt, scrypt, or argon2',
          line: lineNum,
          category: 'security',
          code: 'WEAK_PASSWORD_HASH',
          suggestion: 'Use bcrypt, scrypt, or argon2 for password hashing',
        });
      }

      // Check for insecure random
      if (
        /Math\.random\(\)/.test(line) &&
        /(token|key|secret|password|salt)/.test(line)
      ) {
        issues.push({
          severity: 'error',
          message: 'Math.random() is not cryptographically secure',
          line: lineNum,
          category: 'security',
          code: 'INSECURE_RANDOM',
          suggestion:
            'Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive operations',
        });
      }
    }

    return issues;
  }

  /**
   * Detect insecure random number generation
   */
  private detectInsecureRandom(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript Math.random for security
      if (/Math\.random/.test(line)) {
        if (
          /(token|session|key|id|password|secret|nonce|csrf)/.test(
            line.toLowerCase(),
          )
        ) {
          issues.push({
            severity: 'error',
            message: 'Math.random() used for security-sensitive value',
            line: lineNum,
            category: 'security',
            code: 'INSECURE_RANDOM',
            suggestion: 'Use crypto.randomBytes() or crypto.getRandomValues()',
          });
        }
      }

      // Python random module for security
      if (language.toLowerCase() === 'python') {
        if (/import random|from random/.test(line) && i < lines.length - 10) {
          // Check next few lines for security usage
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            if (
              /(token|session|key|id|password|secret|nonce|csrf)/.test(
                lines[j].toLowerCase(),
              ) &&
              /random\./.test(lines[j])
            ) {
              issues.push({
                severity: 'error',
                message: 'random module used for security-sensitive value',
                line: j + 1,
                category: 'security',
                code: 'INSECURE_RANDOM',
                suggestion:
                  'Use secrets module for cryptographically strong random numbers',
              });
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Detect unsafe deserialization
   */
  private detectUnsafeDeserialization(
    code: string,
    language: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // JavaScript/TypeScript unsafe deserialization
      if (['javascript', 'typescript'].includes(language.toLowerCase())) {
        // eval with JSON-like data
        if (/eval\s*\(.*JSON|eval\s*\(.*parse/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Unsafe deserialization with eval',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_DESERIALIZATION',
            suggestion: 'Use JSON.parse() instead of eval()',
          });
        }

        // vm.runInContext/runInNewContext
        if (/vm\.runIn(NewContext|Context)/.test(line)) {
          issues.push({
            severity: 'warning',
            message: 'Potentially unsafe code execution with vm module',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_VM',
            suggestion: 'Ensure input is trusted and properly sandboxed',
          });
        }
      }

      // Python unsafe deserialization
      if (language.toLowerCase() === 'python') {
        // pickle.loads with untrusted data
        if (
          /pickle\.loads?\s*\(/.test(line) &&
          /\brequest\b|\binput\b|\bparams\b/.test(line)
        ) {
          issues.push({
            severity: 'error',
            message: 'Unsafe deserialization: pickle with untrusted data',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_PICKLE',
            suggestion:
              'Never unpickle untrusted data. Use JSON or other safe formats',
          });
        }

        // yaml.load without safe loader
        if (/yaml\.load\s*\(/.test(line) && !/yaml\.safe_load/.test(line)) {
          issues.push({
            severity: 'error',
            message: 'Unsafe YAML deserialization',
            line: lineNum,
            category: 'security',
            code: 'UNSAFE_YAML',
            suggestion: 'Use yaml.safe_load() instead of yaml.load()',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect XML External Entity (XXE) vulnerabilities
   */
  private detectXXE(code: string, language: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // XML parsing without disabling external entities
      if (/XML|xml/.test(line)) {
        // JavaScript xml2js, fast-xml-parser
        if (/(parseString|parse).*xml/i.test(line)) {
          // Check if external entities are disabled in nearby code
          let hasXxePrevention = false;
          for (
            let j = Math.max(0, i - 5);
            j < Math.min(i + 5, lines.length);
            j++
          ) {
            if (/noent|noExternal|external.*false/i.test(lines[j])) {
              hasXxePrevention = true;
              break;
            }
          }

          if (!hasXxePrevention) {
            issues.push({
              severity: 'warning',
              message: 'XML parsing without XXE protection',
              line: lineNum,
              category: 'security',
              code: 'XXE_VULNERABILITY',
              suggestion:
                'Disable external entity processing in XML parser configuration',
            });
          }
        }

        // Python lxml
        if (language.toLowerCase() === 'python' && /lxml|etree/.test(line)) {
          if (/parse|fromstring/i.test(line)) {
            let hasXxePrevention = false;
            for (
              let j = Math.max(0, i - 5);
              j < Math.min(i + 5, lines.length);
              j++
            ) {
              if (/resolve_entities.*False|no_network.*True/.test(lines[j])) {
                hasXxePrevention = true;
                break;
              }
            }

            if (!hasXxePrevention) {
              issues.push({
                severity: 'warning',
                message: 'XML parsing without XXE protection',
                line: lineNum,
                category: 'security',
                code: 'XXE_VULNERABILITY',
                suggestion:
                  'Use defusedxml library or configure parser to disable external entities',
              });
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check if a line contains a placeholder (not a real secret)
   */
  private isPlaceholder(line: string): boolean {
    const placeholders = [
      'your_',
      'example',
      'test',
      'demo',
      'placeholder',
      'xxx',
      'yyy',
      '***',
      'TODO',
      'FIXME',
      'process.env',
      'process.env.',
      'ENV[',
      'os.getenv',
      'os.environ',
      '${',
      '${',
    ];

    const lowerLine = line.toLowerCase();
    return placeholders.some((placeholder) =>
      lowerLine.includes(placeholder.toLowerCase()),
    );
  }
}
