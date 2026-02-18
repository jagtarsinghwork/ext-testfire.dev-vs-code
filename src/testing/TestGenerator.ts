/**
 * Test Generator
 * Generates unit tests for functions and classes with AI enhancement
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  TestTemplate,
  getTemplate,
  jestTemplate,
  mochaTemplate,
  pytestTemplate,
  goTemplate,
  generateMockData,
  testPatterns,
} from './TestTemplates';

/**
 * Represents a function or method to test
 */
export interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType?: string;
  isAsync: boolean;
  isMethod: boolean;
  className?: string;
  sourceCode: string;
  filePath: string;
  language: string;
  documentation?: string;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

/**
 * Test generation options
 */
export interface TestGenerationOptions {
  framework?: string;
  pattern?: 'AAA' | 'BDD' | 'SETUP';
  includeEdgeCases?: boolean;
  includeErrorCases?: boolean;
  includeMocks?: boolean;
  generateMockData?: boolean;
  aiEnhanced?: boolean;
  style?: 'descriptive' | 'concise';
}

/**
 * Generated test result
 */
export interface GeneratedTest {
  code: string;
  framework: string;
  testCount: number;
  hasSetup: boolean;
  hasMocks: boolean;
  description: string;
}

/**
 * Test Generator class
 */
export class TestGenerator {
  private workspaceRoot: string;
  private detectedFramework: string | null = null;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot =
      workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /**
   * Auto-detect testing framework from project
   */
  async detectFramework(): Promise<string> {
    if (this.detectedFramework) {
      return this.detectedFramework;
    }

    try {
      // Check package.json for JavaScript/TypeScript projects
      const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf-8'),
        );
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (deps['jest'] || deps['@jest/globals']) {
          this.detectedFramework = 'jest';
          return 'jest';
        }
        if (deps['mocha']) {
          this.detectedFramework = 'mocha';
          return 'mocha';
        }
      }

      // Check for Python pytest
      const requirementsPath = path.join(
        this.workspaceRoot,
        'requirements.txt',
      );
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf-8');
        if (requirements.includes('pytest')) {
          this.detectedFramework = 'pytest';
          return 'pytest';
        }
      }

      // Check for Go testing
      const goModPath = path.join(this.workspaceRoot, 'go.mod');
      if (fs.existsSync(goModPath)) {
        this.detectedFramework = 'testing';
        return 'testing';
      }

      // Check for existing test files
      const testFiles = await vscode.workspace.findFiles(
        '**/*.test.{ts,js,tsx,jsx}',
        '**/node_modules/**',
        5,
      );
      if (testFiles.length > 0) {
        const content = fs.readFileSync(testFiles[0].fsPath, 'utf-8');
        if (content.includes('jest') || content.includes('@jest/globals')) {
          this.detectedFramework = 'jest';
          return 'jest';
        }
        if (content.includes('mocha')) {
          this.detectedFramework = 'mocha';
          return 'mocha';
        }
      }

      // Default to Jest for JavaScript/TypeScript
      this.detectedFramework = 'jest';
      return 'jest';
    } catch (error) {
      console.error('Error detecting framework:', error);
      return 'jest';
    }
  }

  /**
   * Parse function/method from source code
   */
  parseFunctionInfo(sourceCode: string, filePath: string): FunctionInfo | null {
    try {
      const language = this.detectLanguage(filePath);

      // TypeScript/JavaScript function parsing
      if (language === 'typescript' || language === 'javascript') {
        return this.parseTypeScriptFunction(sourceCode, filePath, language);
      }

      // Python function parsing
      if (language === 'python') {
        return this.parsePythonFunction(sourceCode, filePath);
      }

      // Go function parsing
      if (language === 'go') {
        return this.parseGoFunction(sourceCode, filePath);
      }

      return null;
    } catch (error) {
      console.error('Error parsing function:', error);
      return null;
    }
  }

  /**
   * Parse TypeScript/JavaScript function
   */
  private parseTypeScriptFunction(
    sourceCode: string,
    filePath: string,
    language: string,
  ): FunctionInfo | null {
    // Match function declarations
    const functionRegex =
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\((.*?)\)(?:\s*:\s*([^{]+))?\s*{/s;
    const arrowRegex =
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\((.*?)\)(?:\s*:\s*([^=]+))?=>/s;
    const methodRegex =
      /(?:async\s+)?(\w+)\s*\((.*?)\)(?:\s*:\s*([^{]+))?\s*{/s;

    let match =
      functionRegex.exec(sourceCode) ||
      arrowRegex.exec(sourceCode) ||
      methodRegex.exec(sourceCode);

    if (!match) {
      return null;
    }

    const name = match[1];
    const paramsStr = match[2];
    const returnType = match[3]?.trim();
    const isAsync = sourceCode.includes('async');

    // Parse parameters
    const parameters: ParameterInfo[] = [];
    if (paramsStr.trim()) {
      const params = paramsStr.split(',').map((p) => p.trim());
      for (const param of params) {
        const paramMatch = /(\w+)(\?)?(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?/.exec(
          param,
        );
        if (paramMatch) {
          parameters.push({
            name: paramMatch[1],
            type: paramMatch[3]?.trim(),
            optional: !!paramMatch[2] || !!paramMatch[4],
            defaultValue: paramMatch[4]?.trim(),
          });
        }
      }
    }

    // Extract documentation
    const docMatch =
      /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?(?:async\s+)?(?:function|const)/.exec(
        sourceCode,
      );
    const documentation = docMatch ? docMatch[1].trim() : undefined;

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isMethod: false,
      sourceCode,
      filePath,
      language,
      documentation,
    };
  }

  /**
   * Parse Python function
   */
  private parsePythonFunction(
    sourceCode: string,
    filePath: string,
  ): FunctionInfo | null {
    const functionRegex =
      /(?:async\s+)?def\s+(\w+)\s*\((.*?)\)(?:\s*->\s*([^:]+))?:/s;
    const match = functionRegex.exec(sourceCode);

    if (!match) {
      return null;
    }

    const name = match[1];
    const paramsStr = match[2];
    const returnType = match[3]?.trim();
    const isAsync = sourceCode.includes('async def');

    // Parse parameters
    const parameters: ParameterInfo[] = [];
    if (paramsStr.trim() && paramsStr !== 'self') {
      const params = paramsStr
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== 'self');
      for (const param of params) {
        const paramMatch = /(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?/.exec(
          param,
        );
        if (paramMatch) {
          parameters.push({
            name: paramMatch[1],
            type: paramMatch[2]?.trim(),
            optional: !!paramMatch[3],
            defaultValue: paramMatch[3]?.trim(),
          });
        }
      }
    }

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isMethod: paramsStr.includes('self'),
      sourceCode,
      filePath,
      language: 'python',
    };
  }

  /**
   * Parse Go function
   */
  private parseGoFunction(
    sourceCode: string,
    filePath: string,
  ): FunctionInfo | null {
    const functionRegex =
      /func\s+(?:\(.*?\)\s+)?(\w+)\s*\((.*?)\)(?:\s*([^{]+))?/s;
    const match = functionRegex.exec(sourceCode);

    if (!match) {
      return null;
    }

    const name = match[1];
    const paramsStr = match[2];
    const returnType = match[3]?.trim();

    // Parse parameters
    const parameters: ParameterInfo[] = [];
    if (paramsStr.trim()) {
      const params = paramsStr.split(',').map((p) => p.trim());
      for (const param of params) {
        const parts = param.split(/\s+/);
        if (parts.length >= 2) {
          parameters.push({
            name: parts[0],
            type: parts.slice(1).join(' '),
          });
        }
      }
    }

    return {
      name,
      parameters,
      returnType,
      isAsync: false,
      isMethod: false,
      sourceCode,
      filePath,
      language: 'go',
    };
  }

  /**
   * Generate tests for a function
   */
  async generateTests(
    functionInfo: FunctionInfo,
    options: TestGenerationOptions = {},
  ): Promise<GeneratedTest> {
    const framework = options.framework || (await this.detectFramework());
    const template = getTemplate(framework);

    if (!template) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    const pattern = options.pattern || 'AAA';
    const includeEdgeCases = options.includeEdgeCases !== false;
    const includeErrorCases = options.includeErrorCases !== false;
    const includeMocks = options.includeMocks !== false;

    // Generate test cases
    const testCases: string[] = [];
    let testCount = 0;
    let hasMocks = false;

    // Happy path test
    testCases.push(this.generateHappyPathTest(functionInfo, template, pattern));
    testCount++;

    // Edge cases
    if (includeEdgeCases) {
      const edgeCases = this.generateEdgeCaseTests(
        functionInfo,
        template,
        pattern,
      );
      testCases.push(...edgeCases);
      testCount += edgeCases.length;
    }

    // Error cases
    if (includeErrorCases) {
      const errorCases = this.generateErrorCaseTests(
        functionInfo,
        template,
        pattern,
      );
      testCases.push(...errorCases);
      testCount += errorCases.length;
    }

    // Mock tests (if function has dependencies)
    if (includeMocks && this.hasDependencies(functionInfo)) {
      const mockTests = this.generateMockTests(functionInfo, template, pattern);
      testCases.push(...mockTests);
      testCount += mockTests.length;
      hasMocks = true;
    }

    // Combine tests
    const testsCode = testCases.join('\n\n');
    const describeBlock = template.describeBlock(functionInfo.name, testsCode);

    // Add imports
    const imports = this.generateImports(functionInfo, template, hasMocks);

    // Full test code
    const code = `${imports}\n\n${describeBlock}\n`;

    return {
      code,
      framework,
      testCount,
      hasSetup: false,
      hasMocks,
      description: `Generated ${testCount} tests for ${functionInfo.name}`,
    };
  }

  /**
   * Generate happy path test
   */
  private generateHappyPathTest(
    functionInfo: FunctionInfo,
    template: TestTemplate,
    pattern: string,
  ): string {
    const patternComment =
      testPatterns.find((p) => p.name.includes(pattern))?.structure || '';

    // Generate sample parameters
    const params = functionInfo.parameters.map((p) => {
      if (p.defaultValue) {
        return p.defaultValue;
      }
      return p.type
        ? this.generateSampleValue(p.type)
        : generateMockData('string');
    });

    const functionCall = `${functionInfo.name}(${params.join(', ')})`;
    const expectedResult = this.generateExpectedResult(functionInfo);

    let body = patternComment + '\n';

    if (functionInfo.isAsync) {
      body += `    const result = await ${functionCall};\n`;
    } else {
      body += `    const result = ${functionCall};\n`;
    }

    body += `\n${template.assertion.toBeDefined('result')}`;

    if (expectedResult) {
      body += `\n${template.assertion.equal('result', expectedResult)}`;
    }

    return template.testBlock(
      `should return expected result with valid inputs`,
      body,
      functionInfo.isAsync,
    );
  }

  /**
   * Generate edge case tests
   */
  private generateEdgeCaseTests(
    functionInfo: FunctionInfo,
    template: TestTemplate,
    pattern: string,
  ): string[] {
    const tests: string[] = [];

    // Empty/null/undefined parameters
    if (functionInfo.parameters.length > 0) {
      const nullTests = this.generateNullParameterTests(functionInfo, template);
      tests.push(...nullTests);

      // Boundary value tests
      const boundaryTests = this.generateBoundaryTests(functionInfo, template);
      tests.push(...boundaryTests);
    }

    // Empty return
    if (
      functionInfo.returnType?.includes('[]') ||
      functionInfo.returnType?.includes('Array')
    ) {
      let body = `    const result = ${functionInfo.name}();\n`;
      body += `\n${template.assertion.toHaveLength('result', 0)}`;

      tests.push(
        template.testBlock(
          'should handle empty arrays',
          body,
          functionInfo.isAsync,
        ),
      );
    }

    return tests;
  }

  /**
   * Generate null parameter tests
   */
  private generateNullParameterTests(
    functionInfo: FunctionInfo,
    template: TestTemplate,
  ): string[] {
    const tests: string[] = [];

    for (let i = 0; i < functionInfo.parameters.length; i++) {
      const param = functionInfo.parameters[i];
      if (!param.optional) {
        const params = functionInfo.parameters.map((p, idx) => {
          if (idx === i) {
            return 'null';
          }
          return p.type
            ? this.generateSampleValue(p.type)
            : generateMockData('string');
        });

        let body = `    const fn = () => ${functionInfo.name}(${params.join(', ')});\n`;
        body += `\n${template.assertion.toThrow('fn')}`;

        tests.push(
          template.testBlock(
            `should throw error when ${param.name} is null`,
            body,
            false,
          ),
        );
      }
    }

    return tests;
  }

  /**
   * Generate boundary tests
   */
  private generateBoundaryTests(
    functionInfo: FunctionInfo,
    template: TestTemplate,
  ): string[] {
    const tests: string[] = [];

    for (const param of functionInfo.parameters) {
      if (param.type?.includes('number') || param.type?.includes('int')) {
        // Test with zero
        const paramsZero = functionInfo.parameters.map((p) =>
          p.name === param.name
            ? '0'
            : this.generateSampleValue(p.type || 'any'),
        );

        let body = `    const result = ${functionInfo.name}(${paramsZero.join(', ')});\n`;
        body += `\n${template.assertion.toBeDefined('result')}`;

        tests.push(
          template.testBlock(
            `should handle ${param.name} = 0`,
            body,
            functionInfo.isAsync,
          ),
        );

        // Test with negative
        const paramsNegative = functionInfo.parameters.map((p) =>
          p.name === param.name
            ? '-1'
            : this.generateSampleValue(p.type || 'any'),
        );

        body = `    const result = ${functionInfo.name}(${paramsNegative.join(', ')});\n`;
        body += `\n${template.assertion.toBeDefined('result')}`;

        tests.push(
          template.testBlock(
            `should handle ${param.name} < 0`,
            body,
            functionInfo.isAsync,
          ),
        );
      }

      if (param.type?.includes('string')) {
        // Test with empty string
        const paramsEmpty = functionInfo.parameters.map((p) =>
          p.name === param.name
            ? "''"
            : this.generateSampleValue(p.type || 'any'),
        );

        let body = `    const result = ${functionInfo.name}(${paramsEmpty.join(', ')});\n`;
        body += `\n${template.assertion.toBeDefined('result')}`;

        tests.push(
          template.testBlock(
            `should handle empty ${param.name}`,
            body,
            functionInfo.isAsync,
          ),
        );
      }
    }

    return tests;
  }

  /**
   * Generate error case tests
   */
  private generateErrorCaseTests(
    functionInfo: FunctionInfo,
    template: TestTemplate,
    pattern: string,
  ): string[] {
    const tests: string[] = [];

    // Invalid parameter types
    if (functionInfo.parameters.length > 0) {
      const invalidParams = functionInfo.parameters.map((p) => {
        if (p.type?.includes('number')) {
          return "'not-a-number'";
        }
        if (p.type?.includes('string')) {
          return '12345';
        }
        return 'undefined';
      });

      let body = `    const fn = () => ${functionInfo.name}(${invalidParams.join(', ')});\n`;
      body += `\n${template.assertion.toThrow('fn')}`;

      tests.push(
        template.testBlock(
          'should throw error with invalid parameter types',
          body,
          false,
        ),
      );
    }

    return tests;
  }

  /**
   * Generate mock tests
   */
  private generateMockTests(
    functionInfo: FunctionInfo,
    template: TestTemplate,
    pattern: string,
  ): string[] {
    const tests: string[] = [];

    // Create mock for external dependency
    let body =
      template.mock.create('mockDependency', '() => "mocked-value"') + '\n';

    const params = functionInfo.parameters.map((p) =>
      this.generateSampleValue(p.type || 'any'),
    );

    body += `\n    const result = ${functionInfo.name}(${params.join(', ')});\n`;
    body += `\n${template.assertion.toBeDefined('result')}`;
    body += `\n${template.mock.verify('mockDependency')}`;

    tests.push(
      template.testBlock(
        'should call dependencies correctly',
        body,
        functionInfo.isAsync,
      ),
    );

    return tests;
  }

  /**
   * Generate imports
   */
  private generateImports(
    functionInfo: FunctionInfo,
    template: TestTemplate,
    hasMocks: boolean,
  ): string {
    let imports = template.imports + '\n';

    // Import function being tested
    const relativePath = this.getRelativeImportPath(functionInfo.filePath);
    imports += `import { ${functionInfo.name} } from '${relativePath}';\n`;

    return imports;
  }

  /**
   * Helper methods
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
    };
    return langMap[ext] || 'typescript';
  }

  private generateSampleValue(type: string): string {
    if (type.includes('string')) return "'test-value'";
    if (type.includes('number') || type.includes('int')) return '42';
    if (type.includes('boolean') || type.includes('bool')) return 'true';
    if (type.includes('[]') || type.includes('Array')) return '[]';
    if (type.includes('object') || type.includes('{}')) return '{}';
    return "'sample'";
  }

  private generateExpectedResult(functionInfo: FunctionInfo): string | null {
    if (!functionInfo.returnType) return null;
    if (functionInfo.returnType.includes('void')) return null;
    if (functionInfo.returnType.includes('string')) return "'expected-result'";
    if (functionInfo.returnType.includes('number')) return '42';
    if (functionInfo.returnType.includes('boolean')) return 'true';
    return null;
  }

  private hasDependencies(functionInfo: FunctionInfo): boolean {
    // Check if function uses external dependencies
    return (
      functionInfo.sourceCode.includes('import') ||
      functionInfo.sourceCode.includes('require') ||
      functionInfo.sourceCode.includes('fetch') ||
      functionInfo.sourceCode.includes('axios')
    );
  }

  private getRelativeImportPath(filePath: string): string {
    const relativePath = path
      .relative(path.dirname(filePath), filePath)
      .replace(/\.(ts|js|tsx|jsx)$/, '');

    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  }
}

/**
 * Convenience function to generate tests
 */
export async function generateTestsForFunction(
  sourceCode: string,
  filePath: string,
  options?: TestGenerationOptions,
): Promise<GeneratedTest | null> {
  const generator = new TestGenerator();
  const functionInfo = generator.parseFunctionInfo(sourceCode, filePath);

  if (!functionInfo) {
    return null;
  }

  return await generator.generateTests(functionInfo, options);
}
