# Test Generation System

A comprehensive test generation and analysis system supporting multiple testing frameworks and languages.

## Features

### 🎯 Test Generation (`TestGenerator.ts`)

- **Multi-framework support**: Jest, Mocha, Pytest, Go testing
- **Auto-detection**: Automatically detects testing framework from project
- **Smart parsing**: Analyzes functions/classes to understand parameters and return types
- **Comprehensive coverage**:
  - Happy path tests
  - Edge case tests (empty, null, undefined, boundary values)
  - Error case tests
  - Mock/spy generation for dependencies
- **Pattern-based**: Supports AAA, BDD, and SETUP test patterns
- **AI-enhanced**: Template-based generation with intelligent suggestions

### 📋 Test Templates (`TestTemplates.ts`)

- **Pre-built templates** for:
  - Jest (JavaScript/TypeScript)
  - Mocha + Chai + Sinon (JavaScript/TypeScript)
  - Pytest (Python)
  - Go testing + testify
- **Common patterns**:
  - Arrange-Act-Assert (AAA)
  - Given-When-Then (BDD)
  - Setup-Exercise-Verify-Teardown
- **Mock data generators**: Automatic generation of test data
- **Flexible assertions**: Support for all common assertion types

### 🔍 Test Analysis (`TestAnalyzer.ts`)

- **Test quality scoring** (0-100):
  - Completeness (coverage)
  - Clarity (naming, structure)
  - Maintainability (DRY, hooks)
  - Reliability (assertions, flaky patterns)
- **Coverage analysis**: Parse and analyze coverage reports
- **Style learning**: Analyze existing tests to learn and match style
- **Missing test detection**: Identify untested functions
- **Flaky test detection**: Identify tests with time-based or random logic
- **Workspace statistics**: Overview of all tests in project

## Usage

### Generate Tests for a Function

```typescript
import { TestGenerator } from './testing';

const generator = new TestGenerator();

// Parse function from source code
const functionInfo = generator.parseFunctionInfo(sourceCode, filePath);

// Generate tests
const result = await generator.generateTests(functionInfo, {
  framework: 'jest', // or auto-detect
  pattern: 'AAA', // or 'BDD', 'SETUP'
  includeEdgeCases: true,
  includeErrorCases: true,
  includeMocks: true,
});

console.log(result.code); // Generated test code
console.log(result.testCount); // Number of tests generated
```

### Analyze Test Quality

```typescript
import { TestAnalyzer } from './testing';

const analyzer = new TestAnalyzer();

// Analyze a test file
const quality = await analyzer.analyzeTestQuality('path/to/test.spec.ts');

console.log(`Quality Score: ${quality.score}/100`);
console.log('Metrics:', quality.metrics);
console.log('Issues:', quality.issues);
console.log('Suggestions:', quality.suggestions);
```

### Find Missing Tests

```typescript
import { TestAnalyzer } from './testing';

const analyzer = new TestAnalyzer();

// Find functions that need tests
const missing = await analyzer.findMissingTests('path/to/source.ts');

for (const suggestion of missing) {
  console.log(`${suggestion.functionName} - ${suggestion.reason}`);
  console.log('Suggested tests:', suggestion.suggestedTests);
}
```

### Identify Flaky Tests

```typescript
import { TestAnalyzer } from './testing';

const analyzer = new TestAnalyzer();

// Find potentially flaky tests
const flakyTests = await analyzer.identifyFlakyTests('path/to/test.spec.ts');

for (const test of flakyTests) {
  console.log(`Flaky: ${test.name}`);
  console.log('Uses time/random:', test.sourceCode);
}
```

## Examples

### Generated Jest Test

```typescript
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@jest/globals';
import { calculateTotal } from './calculator';

describe('calculateTotal', () => {
  it('should return expected result with valid inputs', () => {
    // Arrange - Set up test data and conditions

    // Act - Execute the function/method being tested
    const result = calculateTotal(10, 20);

    // Assert - Verify the results
    expect(result).toBeDefined();
    expect(result).toEqual(30);
  });

  it('should handle calculateTotal = 0', () => {
    const result = calculateTotal(0, 20);

    expect(result).toBeDefined();
  });

  it('should handle calculateTotal < 0', () => {
    const result = calculateTotal(-1, 20);

    expect(result).toBeDefined();
  });

  it('should throw error with invalid parameter types', () => {
    const fn = () => calculateTotal('not-a-number', 'not-a-number');

    expect(fn).toThrow();
  });
});
```

### Test Quality Report

```typescript
{
  score: 85,
  metrics: {
    completeness: 0.9,
    clarity: 0.85,
    maintainability: 0.8,
    reliability: 0.85
  },
  issues: [
    {
      severity: 'warning',
      message: 'Test may be flaky: "should wait for async operation"',
      testName: 'should wait for async operation',
      category: 'flaky'
    }
  ],
  suggestions: [
    'Use beforeEach/afterEach hooks to reduce code duplication',
    'Add more test cases to cover edge cases and error scenarios'
  ]
}
```

## Framework Detection

The system auto-detects testing frameworks by:

1. **package.json**: Checks for Jest, Mocha in dependencies
2. **requirements.txt**: Checks for pytest
3. **go.mod**: Identifies Go projects
4. **Existing tests**: Analyzes import statements
5. **Default**: Falls back to Jest for JS/TS

## Test Patterns

### Arrange-Act-Assert (AAA)

```typescript
it('should do something', () => {
  // Arrange - Set up test data
  const input = 'test';

  // Act - Execute the code
  const result = myFunction(input);

  // Assert - Verify results
  expect(result).toBe('expected');
});
```

### Given-When-Then (BDD)

```typescript
it('should do something', () => {
  // Given - Initial context
  const input = 'test';

  // When - Action occurs
  const result = myFunction(input);

  // Then - Expected outcome
  expect(result).toBe('expected');
});
```

## Mock Generation

Automatically generates mocks for:

- External API calls
- Database connections
- File system operations
- Third-party libraries

Example:

```typescript
it('should call dependencies correctly', () => {
  const mockDependency = jest.fn(() => 'mocked-value');

  const result = myFunction('test-value');

  expect(result).toBeDefined();
  expect(mockDependency).toHaveBeenCalled();
});
```

## Edge Cases Covered

- **Null/undefined**: Tests with missing parameters
- **Empty values**: Empty strings, arrays, objects
- **Boundary values**: Zero, negative numbers, max values
- **Type mismatches**: Wrong parameter types
- **Async errors**: Rejected promises, exceptions

## Best Practices

1. **Use consistent patterns**: Stick to one pattern (AAA, BDD, or SETUP)
2. **Descriptive names**: Test names should clearly describe what they test
3. **One assertion per test**: Focus each test on a single behavior
4. **Use setup/teardown**: Reduce duplication with hooks
5. **Isolate tests**: Each test should be independent
6. **Mock external dependencies**: Don't test external services
7. **Avoid flaky patterns**: No `setTimeout`, `Math.random()`, or current timestamps

## Integration with VS Code

The testing system can be integrated with VS Code commands:

```typescript
// In extension.ts
import { TestGenerator, TestAnalyzer } from './testing';

vscode.commands.registerCommand('extension.generateTests', async () => {
  const editor = vscode.window.activeTextEditor;
  const selection = editor.selection;
  const code = editor.document.getText(selection);

  const generator = new TestGenerator();
  const functionInfo = generator.parseFunctionInfo(
    code,
    editor.document.uri.fsPath,
  );
  const result = await generator.generateTests(functionInfo);

  // Display generated tests
  const doc = await vscode.workspace.openTextDocument({
    content: result.code,
    language: 'typescript',
  });
  await vscode.window.showTextDocument(doc);
});
```

## Architecture

```
src/testing/
├── TestGenerator.ts      # Core test generation logic
├── TestTemplates.ts      # Framework-specific templates
├── TestAnalyzer.ts       # Test quality analysis
├── index.ts             # Public exports
└── README.md            # Documentation
```

## TypeScript Types

All modules are fully typed with TypeScript interfaces:

- `FunctionInfo`: Parsed function metadata
- `TestGenerationOptions`: Configuration for generation
- `GeneratedTest`: Generated test result
- `TestTemplate`: Framework template structure
- `TestQuality`: Quality metrics and scoring
- `TestFileInfo`: Analyzed test file data

## Error Handling

All functions include comprehensive error handling:

- Invalid source code parsing
- Unsupported frameworks
- Missing files
- Malformed test files

Errors are logged and returned gracefully without crashing the extension.

## Performance

- **Caching**: Test file analysis results are cached
- **Lazy loading**: Templates loaded only when needed
- **Async operations**: All file I/O is async
- **Batch processing**: Can analyze multiple files efficiently

## Future Enhancements

- [ ] AI-powered test generation using language models
- [ ] Code coverage visualization
- [ ] Test generation from documentation
- [ ] Mutation testing support
- [ ] Integration test generation
- [ ] Visual test builder UI
- [ ] Test recording from runtime behavior
- [ ] Cross-language test translation

## License

Part of the TestFire VSCode extension.
