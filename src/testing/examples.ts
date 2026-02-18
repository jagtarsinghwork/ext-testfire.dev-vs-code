/**
 * Example: Using the Test Generation System
 */

import { TestGenerator, TestAnalyzer, generateTestsForFunction } from './index';

/**
 * Example 1: Generate tests for a function
 */
async function example1() {
  console.log('=== Example 1: Generate Tests ===\n');

  const sourceCode = `
    export async function calculateDiscount(price: number, discountPercent: number): Promise<number> {
        if (price < 0) {
            throw new Error('Price cannot be negative');
        }
        if (discountPercent < 0 || discountPercent > 100) {
            throw new Error('Discount must be between 0 and 100');
        }
        return price * (1 - discountPercent / 100);
    }
    `;

  const generator = new TestGenerator();
  const functionInfo = generator.parseFunctionInfo(sourceCode, 'calculator.ts');

  if (!functionInfo) {
    console.log('Failed to parse function');
    return;
  }

  console.log('Function Info:');
  console.log('- Name:', functionInfo.name);
  console.log(
    '- Parameters:',
    functionInfo.parameters.map((p) => `${p.name}: ${p.type}`).join(', '),
  );
  console.log('- Return Type:', functionInfo.returnType);
  console.log('- Is Async:', functionInfo.isAsync);
  console.log();

  // Generate tests with different options
  const result = await generator.generateTests(functionInfo, {
    framework: 'jest',
    pattern: 'AAA',
    includeEdgeCases: true,
    includeErrorCases: true,
    includeMocks: false,
  });

  console.log('Generated Tests:');
  console.log('- Framework:', result.framework);
  console.log('- Test Count:', result.testCount);
  console.log('- Has Mocks:', result.hasMocks);
  console.log();
  console.log('Code Preview:');
  console.log(result.code.substring(0, 500) + '...\n');
}

/**
 * Example 2: Analyze test quality
 */
async function example2() {
  console.log('=== Example 2: Analyze Test Quality ===\n');

  // Sample test file content
  const testContent = `
    import { describe, it, expect } from '@jest/globals';
    import { calculateDiscount } from './calculator';

    describe('calculateDiscount', () => {
        it('valid inputs', () => {
            const result = calculateDiscount(100, 10);
            expect(result).toBe(90);
        });

        it('should handle negative price', () => {
            expect(() => calculateDiscount(-100, 10)).toThrow();
        });

        it('should handle invalid discount', () => {
            expect(() => calculateDiscount(100, 150)).toThrow();
        });
    });
    `;

  // Create a temporary test file
  const fs = require('fs');
  const path = require('path');
  const tempFile = path.join(__dirname, 'temp-test.spec.ts');
  fs.writeFileSync(tempFile, testContent);

  try {
    const analyzer = new TestAnalyzer();
    const testInfo = await analyzer.analyzeTestFile(tempFile);

    console.log('Test File Analysis:');
    console.log('- Framework:', testInfo.framework);
    console.log('- Test Count:', testInfo.testCount);
    console.log('- Has Setup:', testInfo.hasSetup);
    console.log('- Has Mocks:', testInfo.hasMocks);
    console.log('- Style Pattern:', testInfo.style.pattern);
    console.log('- Naming Style:', testInfo.style.naming);
    console.log();

    const quality = await analyzer.analyzeTestQuality(tempFile);

    console.log('Quality Score:', quality.score, '/100');
    console.log('Metrics:');
    console.log(
      '- Completeness:',
      (quality.metrics.completeness * 100).toFixed(1) + '%',
    );
    console.log('- Clarity:', (quality.metrics.clarity * 100).toFixed(1) + '%');
    console.log(
      '- Maintainability:',
      (quality.metrics.maintainability * 100).toFixed(1) + '%',
    );
    console.log(
      '- Reliability:',
      (quality.metrics.reliability * 100).toFixed(1) + '%',
    );
    console.log();

    if (quality.issues.length > 0) {
      console.log('Issues:');
      quality.issues.forEach((issue) => {
        console.log(`- [${issue.severity}] ${issue.message}`);
      });
      console.log();
    }

    if (quality.suggestions.length > 0) {
      console.log('Suggestions:');
      quality.suggestions.forEach((suggestion) => {
        console.log(`- ${suggestion}`);
      });
      console.log();
    }
  } finally {
    // Clean up
    fs.unlinkSync(tempFile);
  }
}

/**
 * Example 3: Find missing tests
 */
async function example3() {
  console.log('=== Example 3: Find Missing Tests ===\n');

  // Sample source file with multiple functions
  const sourceContent = `
    export function add(a: number, b: number): number {
        return a + b;
    }

    export function subtract(a: number, b: number): number {
        return a - b;
    }

    export function multiply(a: number, b: number): number {
        return a * b;
    }

    export function divide(a: number, b: number): number {
        if (b === 0) throw new Error('Division by zero');
        return a / b;
    }
    `;

  const fs = require('fs');
  const path = require('path');
  const tempSourceFile = path.join(__dirname, 'temp-math.ts');
  fs.writeFileSync(tempSourceFile, sourceContent);

  try {
    const analyzer = new TestAnalyzer();
    const missing = await analyzer.findMissingTests(tempSourceFile);

    console.log(`Found ${missing.length} functions needing tests:\n`);

    for (const suggestion of missing) {
      console.log(`Function: ${suggestion.functionName}`);
      console.log(`Priority: ${suggestion.priority}`);
      console.log(`Reason: ${suggestion.reason}`);
      console.log('Suggested test cases:');
      suggestion.suggestedTests.forEach((test) => {
        console.log(`  - ${test}`);
      });
      console.log();
    }
  } finally {
    fs.unlinkSync(tempSourceFile);
  }
}

/**
 * Example 4: Detect flaky tests
 */
async function example4() {
  console.log('=== Example 4: Detect Flaky Tests ===\n');

  const flakyTestContent = `
    import { describe, it, expect } from '@jest/globals';

    describe('User Service', () => {
        it('should create user with timestamp', () => {
            const user = {
                id: Math.random(),
                name: 'John',
                createdAt: new Date()
            };
            expect(user.id).toBeDefined();
        });

        it('should wait for operation', async () => {
            setTimeout(() => {
                // This might be flaky
            }, 1000);
            expect(true).toBe(true);
        });

        it('should handle stable operation', () => {
            const result = 2 + 2;
            expect(result).toBe(4);
        });
    });
    `;

  const fs = require('fs');
  const path = require('path');
  const tempFile = path.join(__dirname, 'temp-flaky.spec.ts');
  fs.writeFileSync(tempFile, flakyTestContent);

  try {
    const analyzer = new TestAnalyzer();
    const flakyTests = await analyzer.identifyFlakyTests(tempFile);

    console.log(`Found ${flakyTests.length} potentially flaky tests:\n`);

    for (const test of flakyTests) {
      console.log(`Test: ${test.name}`);
      console.log('Issues:');
      if (test.sourceCode.includes('Math.random')) {
        console.log(
          '  - Uses Math.random() which produces non-deterministic values',
        );
      }
      if (test.sourceCode.includes('new Date()')) {
        console.log('  - Uses new Date() which depends on current time');
      }
      if (test.sourceCode.includes('setTimeout')) {
        console.log('  - Uses setTimeout() which can cause timing issues');
      }
      console.log();
    }
  } finally {
    fs.unlinkSync(tempFile);
  }
}

/**
 * Example 5: Workspace test statistics
 */
async function example5() {
  console.log('=== Example 5: Workspace Test Statistics ===\n');

  const analyzer = new TestAnalyzer();
  const stats = await analyzer.getTestStatistics();

  console.log('Workspace Test Overview:');
  console.log('- Total Tests:', stats.totalTests);
  console.log('- Total Test Suites:', stats.totalSuites);
  console.log();
  console.log('Frameworks:');
  Object.entries(stats.frameworks).forEach(([framework, count]) => {
    console.log(`  - ${framework}: ${count} files`);
  });
  console.log();
}

/**
 * Example 6: Generate tests with different patterns
 */
async function example6() {
  console.log('=== Example 6: Different Test Patterns ===\n');

  const sourceCode = `
    export function validateEmail(email: string): boolean {
        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
        return emailRegex.test(email);
    }
    `;

  const generator = new TestGenerator();
  const functionInfo = generator.parseFunctionInfo(sourceCode, 'validator.ts');

  if (!functionInfo) return;

  // Generate with AAA pattern
  console.log('AAA Pattern:');
  const aaaResult = await generator.generateTests(functionInfo, {
    pattern: 'AAA',
  });
  console.log(aaaResult.code.substring(0, 400) + '...\n');

  // Generate with BDD pattern
  console.log('BDD Pattern:');
  const bddResult = await generator.generateTests(functionInfo, {
    pattern: 'BDD',
  });
  console.log(bddResult.code.substring(0, 400) + '...\n');
}

/**
 * Example 7: Multi-framework test generation
 */
async function example7() {
  console.log('=== Example 7: Multi-Framework Generation ===\n');

  const sourceCode = `
    export function fibonacci(n: number): number {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
    `;

  const generator = new TestGenerator();
  const functionInfo = generator.parseFunctionInfo(sourceCode, 'math.ts');

  if (!functionInfo) return;

  // Jest
  console.log('Jest Framework:');
  const jestResult = await generator.generateTests(functionInfo, {
    framework: 'jest',
  });
  console.log(`- ${jestResult.testCount} tests generated`);
  console.log(jestResult.code.substring(0, 300) + '...\n');

  // Mocha
  console.log('Mocha Framework:');
  const mochaResult = await generator.generateTests(functionInfo, {
    framework: 'mocha',
  });
  console.log(`- ${mochaResult.testCount} tests generated`);
  console.log(mochaResult.code.substring(0, 300) + '...\n');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await example1();
    await example2();
    await example3();
    await example4();
    await example5();
    await example6();
    await example7();

    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export for use
export {
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
  example7,
  runAllExamples,
};

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
