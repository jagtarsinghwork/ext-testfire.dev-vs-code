/**
 * Example usage and tests for the validation system
 */

import { validationOrchestrator } from './index';

// Example 1: JavaScript with syntax errors
const jsCodeWithSyntaxErrors = `
function calculateSum(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++ {
    sum += arr[i];
  }
  return sum
`;

// Example 2: JavaScript with multiplication bug
const jsCodeWithLogicBug = `
function multiply(numbers) {
  let result = 1;
  for (let i = 0; i < numbers.length; i++) {
    result += numbers[i];  // BUG: Should be *= for multiplication
  }
  return result;
}
`;

// Example 3: JavaScript with security vulnerabilities
const jsCodeWithSecurityIssues = `
const express = require('express');
const app = express();

// Hardcoded secret
const API_KEY = "sk-1234567890abcdefghijklmnopqrstuvwxyz";

app.get('/user', (req, res) => {
  const userId = req.query.id;
  
  // SQL injection vulnerability
  const query = "SELECT * FROM users WHERE id = " + userId;
  db.query(query, (err, results) => {
    res.send(results);
  });
});

app.get('/search', (req, res) => {
  const term = req.query.term;
  
  // XSS vulnerability
  document.getElementById('results').innerHTML = term;
});

app.post('/execute', (req, res) => {
  const code = req.body.code;
  
  // Unsafe eval
  const result = eval(code);
  res.send(result);
});
`;

// Example 4: Python with various issues
const pythonCodeWithIssues = `
import os

# Hardcoded password
password = "admin123"

def get_user_data(user_id):
    # SQL injection
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return db.execute(query)

def process_file(filename):
    # Path traversal vulnerability
    path = "/data/" + filename
    with open(path, 'r') as f:
        return f.read()

def calculate_product(numbers):
    # Multiplication bug
    result = 1
    for num in numbers
        result += num  # Missing colon and wrong operator
    return result

# Infinite loop
def wait_forever():
    while True:
        print("Waiting...")
        # Missing break condition
`;

// Example 5: Perfect TypeScript code
const perfectTypeScriptCode = `
import { User } from './types';

/**
 * Calculate the sum of an array of numbers
 */
export function calculateSum(numbers: number[]): number {
  if (!numbers || numbers.length === 0) {
    return 0;
  }
  
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i];
  }
  
  return sum;
}

/**
 * Safely get user by ID with null checking
 */
export async function getUserById(id: string): Promise<User | null> {
  if (!id) {
    return null;
  }
  
  try {
    const user = await db.users.findOne({ id });
    return user ?? null;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}
`;

/**
 * Run validation examples
 */
async function runExamples() {
  console.log('='.repeat(80));
  console.log('CODE VALIDATION SYSTEM - EXAMPLES');
  console.log('='.repeat(80));
  console.log('');

  // Example 1: Syntax errors
  console.log('Example 1: JavaScript with Syntax Errors');
  console.log('-'.repeat(80));
  const result1 = await validationOrchestrator.validate(
    jsCodeWithSyntaxErrors,
    'javascript',
    'syntax-errors.js',
  );
  console.log(validationOrchestrator.getSummary(result1));
  console.log('');

  // Example 2: Logic bugs
  console.log('Example 2: JavaScript with Logic Bug (Multiplication Bug)');
  console.log('-'.repeat(80));
  const result2 = await validationOrchestrator.validate(
    jsCodeWithLogicBug,
    'javascript',
    'logic-bug.js',
  );
  console.log(validationOrchestrator.getSummary(result2));
  console.log('');

  // Example 3: Security vulnerabilities
  console.log('Example 3: JavaScript with Security Vulnerabilities');
  console.log('-'.repeat(80));
  const result3 = await validationOrchestrator.validate(
    jsCodeWithSecurityIssues,
    'javascript',
    'security-issues.js',
  );
  console.log(validationOrchestrator.getSummary(result3));
  if (result3.criticalIssues > 0) {
    console.log('');
    console.log('Critical Issues:');
    for (const issue of result3.byPriority.critical.slice(0, 3)) {
      console.log(`  • ${issue.message}`);
      console.log(`    ${issue.suggestion}`);
    }
  }
  console.log('');

  // Example 4: Python with multiple issues
  console.log('Example 4: Python with Multiple Issues');
  console.log('-'.repeat(80));
  const result4 = await validationOrchestrator.validate(
    pythonCodeWithIssues,
    'python',
    'issues.py',
  );
  console.log(validationOrchestrator.getSummary(result4));
  console.log('');

  // Example 5: Perfect code
  console.log('Example 5: Perfect TypeScript Code');
  console.log('-'.repeat(80));
  const result5 = await validationOrchestrator.validate(
    perfectTypeScriptCode,
    'typescript',
    'perfect-code.ts',
  );
  console.log(validationOrchestrator.getSummary(result5));
  console.log('');

  // Batch validation example
  console.log('Example 6: Batch Validation');
  console.log('-'.repeat(80));
  const batchResults = await validationOrchestrator.validateBatch([
    {
      code: jsCodeWithSyntaxErrors,
      language: 'javascript',
      fileName: 'file1.js',
    },
    { code: jsCodeWithLogicBug, language: 'javascript', fileName: 'file2.js' },
    {
      code: perfectTypeScriptCode,
      language: 'typescript',
      fileName: 'file3.ts',
    },
  ]);

  console.log(`Validated ${batchResults.size} files:`);
  for (const [fileName, result] of batchResults) {
    console.log(
      `  ${fileName}: ${result.valid ? '✓' : '✗'} ` +
        `(Score: ${result.overallScore}/100, Issues: ${result.totalIssues})`,
    );
  }
  console.log('');

  // Quick validation example
  console.log('Example 7: Quick Validation (Syntax Only)');
  console.log('-'.repeat(80));
  const quickResult = validationOrchestrator.quickValidate(
    jsCodeWithSyntaxErrors,
    'javascript',
  );
  console.log(
    `Valid: ${quickResult.valid}, Errors: ${quickResult.errors.length}`,
  );
  console.log('');

  console.log('='.repeat(80));
  console.log('ALL EXAMPLES COMPLETED');
  console.log('='.repeat(80));
}

// Export for use in tests
export {
  runExamples,
  jsCodeWithSyntaxErrors,
  jsCodeWithLogicBug,
  jsCodeWithSecurityIssues,
  pythonCodeWithIssues,
  perfectTypeScriptCode,
};

// Run if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
