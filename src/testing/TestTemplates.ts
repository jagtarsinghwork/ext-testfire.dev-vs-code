/**
 * Test Templates for various testing frameworks
 * Provides reusable templates for generating test code
 */

export interface TestTemplate {
  framework: string;
  language: string;
  imports: string;
  describeBlock: (name: string, tests: string) => string;
  testBlock: (name: string, body: string, isAsync?: boolean) => string;
  assertion: {
    equal: (actual: string, expected: string) => string;
    notEqual: (actual: string, expected: string) => string;
    toBe: (actual: string, expected: string) => string;
    toBeTruthy: (actual: string) => string;
    toBeFalsy: (actual: string) => string;
    toThrow: (fn: string, error?: string) => string;
    toContain: (actual: string, expected: string) => string;
    toBeNull: (actual: string) => string;
    toBeUndefined: (actual: string) => string;
    toBeDefined: (actual: string) => string;
    toHaveLength: (actual: string, length: number) => string;
    toMatchObject: (actual: string, expected: string) => string;
  };
  mock: {
    create: (name: string, implementation?: string) => string;
    spy: (object: string, method: string) => string;
    mockReturnValue: (mock: string, value: string) => string;
    mockResolvedValue: (mock: string, value: string) => string;
    mockRejectedValue: (mock: string, value: string) => string;
    verify: (mock: string, times?: number) => string;
    reset: (mock: string) => string;
  };
  setup: (code: string) => string;
  teardown: (code: string) => string;
  beforeEach: (code: string) => string;
  afterEach: (code: string) => string;
}

/**
 * Jest Template (JavaScript/TypeScript)
 */
export const jestTemplate: TestTemplate = {
  framework: 'jest',
  language: 'typescript',
  imports: `import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';`,

  describeBlock: (name: string, tests: string) =>
    `describe('${name}', () => {\n${tests}\n});`,

  testBlock: (name: string, body: string, isAsync = false) => {
    const asyncKeyword = isAsync ? 'async ' : '';
    return `  it('${name}', ${asyncKeyword}() => {\n${body}\n  });`;
  },

  assertion: {
    equal: (actual, expected) => `    expect(${actual}).toEqual(${expected});`,
    notEqual: (actual, expected) =>
      `    expect(${actual}).not.toEqual(${expected});`,
    toBe: (actual, expected) => `    expect(${actual}).toBe(${expected});`,
    toBeTruthy: (actual) => `    expect(${actual}).toBeTruthy();`,
    toBeFalsy: (actual) => `    expect(${actual}).toBeFalsy();`,
    toThrow: (fn, error) =>
      error
        ? `    expect(${fn}).toThrow(${error});`
        : `    expect(${fn}).toThrow();`,
    toContain: (actual, expected) =>
      `    expect(${actual}).toContain(${expected});`,
    toBeNull: (actual) => `    expect(${actual}).toBeNull();`,
    toBeUndefined: (actual) => `    expect(${actual}).toBeUndefined();`,
    toBeDefined: (actual) => `    expect(${actual}).toBeDefined();`,
    toHaveLength: (actual, length) =>
      `    expect(${actual}).toHaveLength(${length});`,
    toMatchObject: (actual, expected) =>
      `    expect(${actual}).toMatchObject(${expected});`,
  },

  mock: {
    create: (name, implementation) =>
      implementation
        ? `    const ${name} = jest.fn(${implementation});`
        : `    const ${name} = jest.fn();`,
    spy: (object, method) =>
      `    const spy = jest.spyOn(${object}, '${method}');`,
    mockReturnValue: (mock, value) => `    ${mock}.mockReturnValue(${value});`,
    mockResolvedValue: (mock, value) =>
      `    ${mock}.mockResolvedValue(${value});`,
    mockRejectedValue: (mock, value) =>
      `    ${mock}.mockRejectedValue(${value});`,
    verify: (mock, times) =>
      times !== undefined
        ? `    expect(${mock}).toHaveBeenCalledTimes(${times});`
        : `    expect(${mock}).toHaveBeenCalled();`,
    reset: (mock) => `    ${mock}.mockReset();`,
  },

  setup: (code) => `  beforeAll(() => {\n${code}\n  });`,
  teardown: (code) => `  afterAll(() => {\n${code}\n  });`,
  beforeEach: (code) => `  beforeEach(() => {\n${code}\n  });`,
  afterEach: (code) => `  afterEach(() => {\n${code}\n  });`,
};

/**
 * Mocha Template (JavaScript/TypeScript)
 */
export const mochaTemplate: TestTemplate = {
  framework: 'mocha',
  language: 'typescript',
  imports: `import { describe, it, before, after, beforeEach, afterEach } from 'mocha';\nimport { expect } from 'chai';\nimport sinon from 'sinon';`,

  describeBlock: (name: string, tests: string) =>
    `describe('${name}', function() {\n${tests}\n});`,

  testBlock: (name: string, body: string, isAsync = false) => {
    const asyncKeyword = isAsync ? 'async ' : '';
    return `  it('${name}', ${asyncKeyword}function() {\n${body}\n  });`;
  },

  assertion: {
    equal: (actual, expected) => `    expect(${actual}).to.equal(${expected});`,
    notEqual: (actual, expected) =>
      `    expect(${actual}).to.not.equal(${expected});`,
    toBe: (actual, expected) => `    expect(${actual}).to.equal(${expected});`,
    toBeTruthy: (actual) => `    expect(${actual}).to.be.ok;`,
    toBeFalsy: (actual) => `    expect(${actual}).to.not.be.ok;`,
    toThrow: (fn, error) =>
      error
        ? `    expect(${fn}).to.throw(${error});`
        : `    expect(${fn}).to.throw();`,
    toContain: (actual, expected) =>
      `    expect(${actual}).to.include(${expected});`,
    toBeNull: (actual) => `    expect(${actual}).to.be.null;`,
    toBeUndefined: (actual) => `    expect(${actual}).to.be.undefined;`,
    toBeDefined: (actual) => `    expect(${actual}).to.not.be.undefined;`,
    toHaveLength: (actual, length) =>
      `    expect(${actual}).to.have.lengthOf(${length});`,
    toMatchObject: (actual, expected) =>
      `    expect(${actual}).to.deep.include(${expected});`,
  },

  mock: {
    create: (name, implementation) =>
      implementation
        ? `    const ${name} = sinon.stub().callsFake(${implementation});`
        : `    const ${name} = sinon.stub();`,
    spy: (object, method) =>
      `    const spy = sinon.spy(${object}, '${method}');`,
    mockReturnValue: (mock, value) => `    ${mock}.returns(${value});`,
    mockResolvedValue: (mock, value) => `    ${mock}.resolves(${value});`,
    mockRejectedValue: (mock, value) => `    ${mock}.rejects(${value});`,
    verify: (mock, times) =>
      times !== undefined
        ? `    expect(${mock}.callCount).to.equal(${times});`
        : `    expect(${mock}.called).to.be.true;`,
    reset: (mock) => `    ${mock}.reset();`,
  },

  setup: (code) => `  before(function() {\n${code}\n  });`,
  teardown: (code) => `  after(function() {\n${code}\n  });`,
  beforeEach: (code) => `  beforeEach(function() {\n${code}\n  });`,
  afterEach: (code) => `  afterEach(function() {\n${code}\n  });`,
};

/**
 * Pytest Template (Python)
 */
export const pytestTemplate: TestTemplate = {
  framework: 'pytest',
  language: 'python',
  imports: `import pytest\nfrom unittest.mock import Mock, patch, MagicMock`,

  describeBlock: (name: string, tests: string) =>
    `class Test${name.replace(/\s+/g, '')}:\n${tests}`,

  testBlock: (name: string, body: string, isAsync = false) => {
    const asyncKeyword = isAsync ? 'async ' : '';
    const methodName = name.toLowerCase().replace(/\s+/g, '_');
    return `    ${asyncKeyword}def test_${methodName}(self):\n${body}`;
  },

  assertion: {
    equal: (actual, expected) => `        assert ${actual} == ${expected}`,
    notEqual: (actual, expected) => `        assert ${actual} != ${expected}`,
    toBe: (actual, expected) => `        assert ${actual} is ${expected}`,
    toBeTruthy: (actual) => `        assert ${actual}`,
    toBeFalsy: (actual) => `        assert not ${actual}`,
    toThrow: (fn, error) =>
      error
        ? `        with pytest.raises(${error}):\n            ${fn}`
        : `        with pytest.raises(Exception):\n            ${fn}`,
    toContain: (actual, expected) => `        assert ${expected} in ${actual}`,
    toBeNull: (actual) => `        assert ${actual} is None`,
    toBeUndefined: (actual) => `        assert ${actual} is None`,
    toBeDefined: (actual) => `        assert ${actual} is not None`,
    toHaveLength: (actual, length) =>
      `        assert len(${actual}) == ${length}`,
    toMatchObject: (actual, expected) =>
      `        assert ${actual} == ${expected}`,
  },

  mock: {
    create: (name, implementation) =>
      implementation
        ? `        ${name} = Mock(side_effect=${implementation})`
        : `        ${name} = Mock()`,
    spy: (object, method) =>
      `        with patch.object(${object}, '${method}') as spy:`,
    mockReturnValue: (mock, value) => `        ${mock}.return_value = ${value}`,
    mockResolvedValue: (mock, value) =>
      `        ${mock}.return_value = ${value}`,
    mockRejectedValue: (mock, value) =>
      `        ${mock}.side_effect = ${value}`,
    verify: (mock, times) =>
      times !== undefined
        ? `        assert ${mock}.call_count == ${times}`
        : `        ${mock}.assert_called()`,
    reset: (mock) => `        ${mock}.reset_mock()`,
  },

  setup: (code) => `    @classmethod\n    def setup_class(cls):\n${code}`,
  teardown: (code) => `    @classmethod\n    def teardown_class(cls):\n${code}`,
  beforeEach: (code) => `    def setup_method(self):\n${code}`,
  afterEach: (code) => `    def teardown_method(self):\n${code}`,
};

/**
 * Go Testing Template
 */
export const goTemplate: TestTemplate = {
  framework: 'testing',
  language: 'go',
  imports: `import (\n\t"testing"\n\t"github.com/stretchr/testify/assert"\n\t"github.com/stretchr/testify/mock"\n)`,

  describeBlock: (name: string, tests: string) => tests,

  testBlock: (name: string, body: string) => {
    const methodName = name.replace(/\s+/g, '');
    return `func Test${methodName}(t *testing.T) {\n${body}\n}`;
  },

  assertion: {
    equal: (actual, expected) => `\tassert.Equal(t, ${expected}, ${actual})`,
    notEqual: (actual, expected) =>
      `\tassert.NotEqual(t, ${expected}, ${actual})`,
    toBe: (actual, expected) => `\tassert.Same(t, ${expected}, ${actual})`,
    toBeTruthy: (actual) => `\tassert.True(t, ${actual})`,
    toBeFalsy: (actual) => `\tassert.False(t, ${actual})`,
    toThrow: (fn, error) => `\tassert.Panics(t, func() { ${fn} })`,
    toContain: (actual, expected) =>
      `\tassert.Contains(t, ${actual}, ${expected})`,
    toBeNull: (actual) => `\tassert.Nil(t, ${actual})`,
    toBeUndefined: (actual) => `\tassert.Nil(t, ${actual})`,
    toBeDefined: (actual) => `\tassert.NotNil(t, ${actual})`,
    toHaveLength: (actual, length) => `\tassert.Len(t, ${actual}, ${length})`,
    toMatchObject: (actual, expected) =>
      `\tassert.Equal(t, ${expected}, ${actual})`,
  },

  mock: {
    create: (name) => `\t${name} := new(Mock${name})`,
    spy: (object, method) => `\t${object}.On("${method}")`,
    mockReturnValue: (mock, value) => `\t${mock}.Return(${value})`,
    mockResolvedValue: (mock, value) => `\t${mock}.Return(${value}, nil)`,
    mockRejectedValue: (mock, value) => `\t${mock}.Return(nil, ${value})`,
    verify: (mock, times) =>
      times !== undefined
        ? `\t${mock}.AssertNumberOfCalls(t, "${mock}", ${times})`
        : `\t${mock}.AssertCalled(t, "${mock}")`,
    reset: (mock) => `\t${mock}.ExpectedCalls = nil`,
  },

  setup: (code) => `func setup() {\n${code}\n}`,
  teardown: (code) => `func teardown() {\n${code}\n}`,
  beforeEach: (code) => `// Run before each test\n${code}`,
  afterEach: (code) => `// Run after each test\n${code}`,
};

/**
 * Common Test Patterns
 */
export interface TestPattern {
  name: string;
  description: string;
  structure: string;
}

export const testPatterns: TestPattern[] = [
  {
    name: 'Arrange-Act-Assert (AAA)',
    description: 'Classic pattern for organizing test code',
    structure: `    // Arrange - Set up test data and conditions
    
    // Act - Execute the function/method being tested
    
    // Assert - Verify the results`,
  },
  {
    name: 'Given-When-Then (BDD)',
    description: 'Behavior-driven development pattern',
    structure: `    // Given - Initial context
    
    // When - Action occurs
    
    // Then - Expected outcome`,
  },
  {
    name: 'Setup-Exercise-Verify-Teardown',
    description: 'Complete test lifecycle pattern',
    structure: `    // Setup - Prepare test environment
    
    // Exercise - Run the code under test
    
    // Verify - Check the results
    
    // Teardown - Clean up resources`,
  },
];

/**
 * Mock Data Generators
 */
export interface MockDataGenerator {
  type: string;
  generate: () => string;
}

export const mockDataGenerators: Record<string, MockDataGenerator> = {
  string: {
    type: 'string',
    generate: () => `'test-string-${Math.random().toString(36).substring(7)}'`,
  },
  number: {
    type: 'number',
    generate: () => `${Math.floor(Math.random() * 1000)}`,
  },
  boolean: {
    type: 'boolean',
    generate: () => `${Math.random() > 0.5}`,
  },
  array: {
    type: 'array',
    generate: () =>
      `[${mockDataGenerators.string.generate()}, ${mockDataGenerators.string.generate()}]`,
  },
  object: {
    type: 'object',
    generate: () =>
      `{ id: ${mockDataGenerators.number.generate()}, name: ${mockDataGenerators.string.generate()} }`,
  },
  date: {
    type: 'date',
    generate: () => `new Date('2024-01-01')`,
  },
  null: {
    type: 'null',
    generate: () => 'null',
  },
  undefined: {
    type: 'undefined',
    generate: () => 'undefined',
  },
};

/**
 * Get template by framework name
 */
export function getTemplate(framework: string): TestTemplate | null {
  const templates: Record<string, TestTemplate> = {
    jest: jestTemplate,
    mocha: mochaTemplate,
    pytest: pytestTemplate,
    go: goTemplate,
    testing: goTemplate,
  };

  return templates[framework.toLowerCase()] || null;
}

/**
 * Get all available templates
 */
export function getAllTemplates(): TestTemplate[] {
  return [jestTemplate, mochaTemplate, pytestTemplate, goTemplate];
}

/**
 * Generate mock data based on type
 */
export function generateMockData(type: string): string {
  const generator = mockDataGenerators[type.toLowerCase()];
  return generator
    ? generator.generate()
    : mockDataGenerators.string.generate();
}

/**
 * Get test pattern by name
 */
export function getTestPattern(name: string): TestPattern | undefined {
  return testPatterns.find((p) =>
    p.name.toLowerCase().includes(name.toLowerCase()),
  );
}
