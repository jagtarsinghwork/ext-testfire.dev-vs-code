# Code Validation System

A comprehensive, multi-layer code validation framework for detecting syntax errors, logic bugs, and security vulnerabilities in TypeScript, JavaScript, Python, and other languages.

## 📋 Overview

The validation system consists of 4 main components:

1. **SyntaxValidator** - Validates code syntax
2. **LogicValidator** - Detects common bug patterns
3. **SecurityValidator** - Scans for security vulnerabilities
4. **ValidationOrchestrator** - Coordinates all validators and aggregates results

## 🚀 Quick Start

```typescript
import { validationOrchestrator } from './validation';

// Validate code
const result = await validationOrchestrator.validate(
  code,
  'typescript',
  'myFile.ts',
);

// Check if valid
if (result.valid) {
  console.log('✓ Code is valid!');
} else {
  console.log(`✗ Found ${result.totalIssues} issues`);
}

// Get summary
console.log(validationOrchestrator.getSummary(result));

// Get detailed report
console.log(validationOrchestrator.getDetailedReport(result));
```

## 🔍 Features

### SyntaxValidator

Validates syntax for multiple languages:

- **TypeScript/JavaScript**: Brace balance, quote balance, semicolons, arrow functions, async/await
- **Python**: Indentation, colons, f-strings, operators
- **JSON**: Strict JSON validation, trailing commas, quote types
- **HTML**: Tag matching, self-closing tags
- **CSS**: Brace balance, property syntax

#### Examples

```typescript
import { SyntaxValidator } from './validation';

const validator = new SyntaxValidator();

// JavaScript syntax check
const result = validator.validate(code, 'javascript', 'app.js');

// Python syntax check
const result = validator.validate(pythonCode, 'python', 'script.py');

// JSON syntax check
const result = validator.validate(jsonData, 'json', 'config.json');
```

### LogicValidator

Detects common bug patterns:

#### Multiplication Bug

```javascript
// ❌ BAD: Initialized to 1 but using +=
let result = 1;
for (let i = 0; i < arr.length; i++) {
  result += arr[i]; // Should be *= or result should start at 0
}

// ✅ GOOD: Correct initialization
let sum = 0;
for (let i = 0; i < arr.length; i++) {
  sum += arr[i];
}
```

#### Off-by-One Errors

```javascript
// ❌ BAD: Will access out of bounds
for (let i = 0; i <= arr.length; i++) {
  console.log(arr[i]); // arr[arr.length] is undefined
}

// ✅ GOOD: Correct loop condition
for (let i = 0; i < arr.length; i++) {
  console.log(arr[i]);
}
```

#### Null/Undefined Access

```javascript
// ❌ BAD: Potential null access
const user = findUser(id); // May return null
console.log(user.name); // Error if user is null

// ✅ GOOD: Null check
const user = findUser(id);
if (user) {
  console.log(user.name);
}
// or use optional chaining
console.log(user?.name);
```

#### Infinite Loops

```javascript
// ❌ BAD: Infinite loop
let i = 0;
while (i < 10) {
  console.log(i);
  // Missing i++
}

// ✅ GOOD: Proper loop
let i = 0;
while (i < 10) {
  console.log(i);
  i++;
}
```

#### Type Mismatches

```javascript
// ❌ BAD: Loose equality
if (x == 5) {
} // May cause type coercion

// ✅ GOOD: Strict equality
if (x === 5) {
}
```

### SecurityValidator

Scans for security vulnerabilities based on OWASP Top 10:

#### SQL Injection

```javascript
// ❌ BAD: SQL injection vulnerability
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.query(query);

// ✅ GOOD: Parameterized query
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

#### XSS (Cross-Site Scripting)

```javascript
// ❌ BAD: XSS vulnerability
element.innerHTML = userInput;

// ✅ GOOD: Use textContent or sanitize
element.textContent = userInput;
// or
element.innerHTML = DOMPurify.sanitize(userInput);
```

#### Hardcoded Secrets

```javascript
// ❌ BAD: Hardcoded API key
const API_KEY = 'sk-1234567890abcdef';

// ✅ GOOD: Use environment variables
const API_KEY = process.env.API_KEY;
```

#### Unsafe eval()

```javascript
// ❌ BAD: Unsafe eval
eval(userInput);

// ✅ GOOD: Use JSON.parse for data
const data = JSON.parse(userInput);
```

#### Command Injection

```javascript
// ❌ BAD: Command injection
exec(`ls ${userInput}`);

// ✅ GOOD: Use parameterized spawn
spawn('ls', [userInput]);
```

#### Path Traversal

```javascript
// ❌ BAD: Path traversal
const filePath = `/data/${req.query.file}`;
fs.readFile(filePath);

// ✅ GOOD: Validate and normalize
const fileName = path.basename(req.query.file);
const filePath = path.join('/data', fileName);
fs.readFile(filePath);
```

## 📊 Validation Results

### ValidationResult Structure

```typescript
interface ValidationResult {
  valid: boolean; // Overall validity
  errors: ValidationIssue[]; // Error-level issues
  warnings: ValidationIssue[]; // Warning-level issues
  info: ValidationIssue[]; // Info-level issues
  processingTimeMs?: number; // Processing time
}
```

### AggregatedValidationResult Structure

```typescript
interface AggregatedValidationResult {
  valid: boolean; // No errors or critical issues
  overallScore: number; // 0-100, higher is better
  totalIssues: number; // Total issue count
  criticalIssues: number; // Critical issue count

  // Issues by severity
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];

  // Issues by category
  byCategory: {
    syntax: ValidationIssue[];
    logic: ValidationIssue[];
    security: ValidationIssue[];
    style: ValidationIssue[];
  };

  // Issues by priority
  byPriority: {
    critical: ValidationIssue[]; // Security errors, severe bugs
    high: ValidationIssue[]; // Syntax errors, important bugs
    medium: ValidationIssue[]; // Logic warnings, minor security
    low: ValidationIssue[]; // Info, style suggestions
  };

  processingTimeMs: number;
  validatorResults: {
    syntax: ValidationResult;
    logic: ValidationResult;
    security: ValidationResult;
  };
}
```

### ValidationIssue Structure

```typescript
interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string; // Issue description
  line?: number; // Line number
  column?: number; // Column number
  code?: string; // Issue code (e.g., 'SQL_INJECTION')
  category: 'syntax' | 'logic' | 'security' | 'style';
  suggestion?: string; // How to fix
}
```

## ⚙️ Configuration Options

```typescript
interface ValidationOptions {
  enableSyntax?: boolean; // Enable syntax validation (default: true)
  enableLogic?: boolean; // Enable logic validation (default: true)
  enableSecurity?: boolean; // Enable security validation (default: true)
  minSeverity?: 'error' | 'warning' | 'info'; // Filter by severity
  maxIssues?: number; // Limit number of issues (default: 1000)
  timeoutMs?: number; // Timeout per validator (default: 30000)
}
```

### Usage with Options

```typescript
const result = await validationOrchestrator.validate(
  code,
  'javascript',
  'app.js',
  {
    enableLogic: false, // Skip logic validation
    minSeverity: 'error', // Only show errors
    maxIssues: 50, // Limit to 50 issues
    timeoutMs: 10000, // 10 second timeout
  },
);
```

## 🔄 Batch Validation

Validate multiple files at once:

```typescript
const files = [
  { code: file1Code, language: 'typescript', fileName: 'app.ts' },
  { code: file2Code, language: 'javascript', fileName: 'utils.js' },
  { code: file3Code, language: 'python', fileName: 'script.py' },
];

const results = await validationOrchestrator.validateBatch(files);

// Iterate through results
for (const [fileName, result] of results) {
  console.log(`${fileName}: Score ${result.overallScore}/100`);
}
```

## ⚡ Quick Validation

For real-time feedback, use quick validation (syntax only):

```typescript
const result = validationOrchestrator.quickValidate(code, 'javascript');

if (!result.valid) {
  console.log('Syntax errors:', result.errors);
}
```

## 📈 Scoring System

The validation system provides an overall quality score (0-100):

- **100**: Perfect code with no issues
- **90-99**: Minor info-level issues
- **75-89**: Some warnings
- **50-74**: Multiple warnings or few errors
- **25-49**: Many errors or critical issues
- **0-24**: Severe issues, multiple critical problems

### Score Calculation

```
Score = 100
  - (critical issues × 20)
  - (errors × 5)
  - (warnings × 2)
  - (info × 0.5)
```

## 🎯 Priority Levels

Issues are automatically prioritized:

- **Critical**: Security errors, severe bugs (SQL injection, hardcoded secrets, infinite loops)
- **High**: Syntax errors, important logic bugs
- **Medium**: Logic warnings, minor security issues
- **Low**: Info messages, style suggestions

## 🔗 Integration Examples

### With FileChangeManager

```typescript
import { validationOrchestrator } from './validation';
import { FileChangeManager } from '../files/FileChangeManager';

class ValidatingFileChangeManager extends FileChangeManager {
  async applyChange(change: FileChange): Promise<void> {
    // Validate before applying
    const result = await validationOrchestrator.validate(
      change.content,
      change.language,
      change.filePath,
    );

    if (!result.valid) {
      throw new Error(
        `Validation failed: ${result.errors.length} errors found`,
      );
    }

    await super.applyChange(change);
  }
}
```

### With VS Code Extension

```typescript
import * as vscode from 'vscode';
import { validationOrchestrator } from './validation';

// Validate on save
vscode.workspace.onWillSaveTextDocument(async (event) => {
  const document = event.document;

  const result = await validationOrchestrator.validate(
    document.getText(),
    document.languageId,
    document.fileName,
  );

  // Show errors in Problems panel
  diagnosticCollection.set(
    document.uri,
    result.errors.map(
      (issue) =>
        new vscode.Diagnostic(
          new vscode.Range(issue.line - 1, 0, issue.line - 1, 100),
          issue.message,
          vscode.DiagnosticSeverity.Error,
        ),
    ),
  );
});
```

## 🧪 Running Examples

```bash
# Compile TypeScript
npm run compile

# Run examples
node dist/validation/examples.js
```

## 📝 Supported Languages

- ✅ TypeScript
- ✅ JavaScript (ES5, ES6+)
- ✅ Python
- ✅ JSON
- ✅ HTML
- ✅ CSS
- ✅ Markdown (basic)

## 🛡️ OWASP Coverage

The security validator covers these OWASP Top 10 categories:

- **A01:2021** - Broken Access Control (path traversal)
- **A02:2021** - Cryptographic Failures (weak algorithms, hardcoded keys)
- **A03:2021** - Injection (SQL, command, XSS)
- **A05:2021** - Security Misconfiguration (XXE)
- **A07:2021** - Identification and Authentication Failures (hardcoded secrets)
- **A08:2021** - Software and Data Integrity Failures (unsafe deserialization)

## 🔧 Extending the System

### Add Custom Validator

```typescript
class CustomValidator {
  validate(code: string, language: string): ValidationResult {
    // Your validation logic
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };
  }
}
```

### Add Custom Pattern to LogicValidator

```typescript
const customPattern: BugPattern = {
  name: 'my-custom-check',
  description: 'My custom check',
  severity: 'warning',
  detector: (code, language) => {
    const issues: ValidationIssue[] = [];
    // Detection logic
    return issues;
  },
};
```

## 📚 API Reference

### ValidationOrchestrator

- `validate(code, language, fileName?, options?)` - Full validation
- `validateBatch(files, options?)` - Batch validation
- `quickValidate(code, language)` - Syntax-only validation
- `getSummary(result)` - Get summary string
- `getDetailedReport(result)` - Get detailed report

### SyntaxValidator

- `validate(code, language, fileName?)` - Syntax validation

### LogicValidator

- `validate(code, language, fileName?)` - Logic validation

### SecurityValidator

- `validate(code, language, fileName?)` - Security validation

## 🐛 Bug Detection Coverage

- [x] Multiplication bug (result = 1 with +=)
- [x] Off-by-one errors in loops
- [x] Null/undefined access
- [x] Infinite loops
- [x] Type mismatches (== vs ===)
- [x] Dead code after return
- [x] Assignment in conditions
- [x] Async/await issues
- [x] Unhandled Promise rejections

## 🔒 Security Checks

- [x] SQL injection
- [x] XSS vulnerabilities
- [x] Hardcoded secrets
- [x] Unsafe eval()
- [x] Command injection
- [x] Path traversal
- [x] Weak cryptography
- [x] Insecure random
- [x] Unsafe deserialization
- [x] XXE vulnerabilities

## 📄 License

Part of the TestFire AI extension.

## 🤝 Contributing

Contributions welcome! Please ensure:

1. All validators maintain proper error handling
2. Tests cover new detection patterns
3. Documentation is updated
4. TypeScript types are properly defined
