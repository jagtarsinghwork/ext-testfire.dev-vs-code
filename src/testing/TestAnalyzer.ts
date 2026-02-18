/**
 * Test Analyzer
 * Analyzes existing tests, coverage, and suggests improvements
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FunctionInfo, ParameterInfo } from './TestGenerator';

/**
 * Test file information
 */
export interface TestFileInfo {
    filePath: string;
    framework: string;
    testCount: number;
    suites: TestSuite[];
    style: TestStyle;
    hasMocks: boolean;
    hasSetup: boolean;
    hasTeardown: boolean;
    coverage?: CoverageInfo;
}

export interface TestSuite {
    name: string;
    tests: TestCase[];
    beforeEach?: string;
    afterEach?: string;
    beforeAll?: string;
    afterAll?: string;
}

export interface TestCase {
    name: string;
    isAsync: boolean;
    hasAssertions: boolean;
    assertionCount: number;
    hasMocks: boolean;
    pattern?: 'AAA' | 'BDD' | 'SETUP';
    sourceCode: string;
    lineNumber: number;
}

export interface TestStyle {
    pattern: 'AAA' | 'BDD' | 'SETUP' | 'mixed';
    naming: 'descriptive' | 'concise';
    assertionStyle: string;
    mockingStyle?: string;
}

export interface CoverageInfo {
    linesCovered: number;
    totalLines: number;
    branchesCovered: number;
    totalBranches: number;
    functionsCovered: number;
    totalFunctions: number;
    percentage: number;
}

/**
 * Test quality metrics
 */
export interface TestQuality {
    score: number; // 0-100
    metrics: {
        completeness: number; // Has good coverage
        clarity: number; // Clear test names and structure
        maintainability: number; // DRY, setup/teardown usage
        reliability: number; // Proper assertions, no flaky patterns
    };
    issues: TestIssue[];
    suggestions: string[];
}

export interface TestIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    testName?: string;
    category: 'coverage' | 'quality' | 'flaky' | 'style' | 'performance';
}

/**
 * Missing test suggestion
 */
export interface MissingTestSuggestion {
    functionName: string;
    filePath: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    suggestedTests: string[];
}

/**
 * Test Analyzer class
 */
export class TestAnalyzer {
    private workspaceRoot: string;
    private testFilesCache: Map<string, TestFileInfo> = new Map();

    constructor(workspaceRoot?: string) {
        this.workspaceRoot = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    /**
     * Analyze a test file
     */
    async analyzeTestFile(filePath: string): Promise<TestFileInfo> {
        try {
            // Check cache
            if (this.testFilesCache.has(filePath)) {
                return this.testFilesCache.get(filePath)!;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const framework = this.detectFramework(content);
            const suites = this.parseTestSuites(content, framework);
            const style = this.analyzeTestStyle(content, suites);
            const testCount = suites.reduce((sum, suite) => sum + suite.tests.length, 0);
            const hasMocks = this.hasMocks(content);
            const hasSetup = this.hasSetup(content);
            const hasTeardown = this.hasTeardown(content);

            const info: TestFileInfo = {
                filePath,
                framework,
                testCount,
                suites,
                style,
                hasMocks,
                hasSetup,
                hasTeardown,
            };

            this.testFilesCache.set(filePath, info);
            return info;
        } catch (error) {
            console.error('Error analyzing test file:', error);
            throw error;
        }
    }

    /**
     * Analyze test quality
     */
    async analyzeTestQuality(filePath: string): Promise<TestQuality> {
        const testInfo = await this.analyzeTestFile(filePath);
        
        const issues: TestIssue[] = [];
        const suggestions: string[] = [];

        // Check completeness
        const completeness = this.calculateCompleteness(testInfo, issues, suggestions);

        // Check clarity
        const clarity = this.calculateClarity(testInfo, issues, suggestions);

        // Check maintainability
        const maintainability = this.calculateMaintainability(testInfo, issues, suggestions);

        // Check reliability
        const reliability = this.calculateReliability(testInfo, issues, suggestions);

        // Calculate overall score
        const score = Math.round(
            (completeness * 0.3 + clarity * 0.2 + maintainability * 0.25 + reliability * 0.25) * 100
        );

        return {
            score,
            metrics: {
                completeness,
                clarity,
                maintainability,
                reliability,
            },
            issues,
            suggestions,
        };
    }

    /**
     * Find missing test cases
     */
    async findMissingTests(sourceFilePath: string): Promise<MissingTestSuggestion[]> {
        const suggestions: MissingTestSuggestion[] = [];

        try {
            // Find corresponding test file
            const testFilePath = this.findTestFile(sourceFilePath);
            
            // Parse source file for functions
            const sourceFunctions = await this.parseFunctionsFromFile(sourceFilePath);
            
            // Parse existing tests
            let existingTests: TestFileInfo | null = null;
            if (testFilePath && fs.existsSync(testFilePath)) {
                existingTests = await this.analyzeTestFile(testFilePath);
            }

            // Find untested functions
            for (const func of sourceFunctions) {
                const isTestedSufficiently = existingTests 
                    ? this.isFunctionTestedSufficiently(func, existingTests)
                    : false;

                if (!isTestedSufficiently) {
                    const suggestedTests = this.generateTestSuggestions(func);
                    suggestions.push({
                        functionName: func.name,
                        filePath: sourceFilePath,
                        reason: existingTests 
                            ? 'Insufficient test coverage'
                            : 'No tests found',
                        priority: this.calculateTestPriority(func),
                        suggestedTests,
                    });
                }
            }

            return suggestions;
        } catch (error) {
            console.error('Error finding missing tests:', error);
            return suggestions;
        }
    }

    /**
     * Identify flaky tests
     */
    async identifyFlakyTests(filePath: string): Promise<TestCase[]> {
        const testInfo = await this.analyzeTestFile(filePath);
        const flakyTests: TestCase[] = [];

        for (const suite of testInfo.suites) {
            for (const test of suite.tests) {
                if (this.isFlakyTest(test)) {
                    flakyTests.push(test);
                }
            }
        }

        return flakyTests;
    }

    /**
     * Analyze test coverage
     */
    async analyzeCoverage(sourceFilePath: string): Promise<CoverageInfo | null> {
        try {
            // Try to read coverage data from common locations
            const coveragePaths = [
                path.join(this.workspaceRoot, 'coverage', 'coverage-final.json'),
                path.join(this.workspaceRoot, '.coverage'),
                path.join(this.workspaceRoot, 'coverage.json'),
            ];

            for (const coveragePath of coveragePaths) {
                if (fs.existsSync(coveragePath)) {
                    const coverage = await this.parseCoverageFile(coveragePath, sourceFilePath);
                    if (coverage) {
                        return coverage;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Error analyzing coverage:', error);
            return null;
        }
    }

    /**
     * Learn test style from existing tests
     */
    async learnTestStyle(testFilePath: string): Promise<TestStyle> {
        const testInfo = await this.analyzeTestFile(testFilePath);
        return testInfo.style;
    }

    /**
     * Get test statistics for workspace
     */
    async getTestStatistics(): Promise<{
        totalTests: number;
        totalSuites: number;
        frameworks: Record<string, number>;
        coverage?: number;
    }> {
        const testFiles = await vscode.workspace.findFiles(
            '**/*.{test,spec}.{ts,js,tsx,jsx,py,go}',
            '**/node_modules/**'
        );

        let totalTests = 0;
        let totalSuites = 0;
        const frameworks: Record<string, number> = {};

        for (const file of testFiles) {
            try {
                const info = await this.analyzeTestFile(file.fsPath);
                totalTests += info.testCount;
                totalSuites += info.suites.length;
                frameworks[info.framework] = (frameworks[info.framework] || 0) + 1;
            } catch (error) {
                // Skip files that can't be analyzed
            }
        }

        return {
            totalTests,
            totalSuites,
            frameworks,
        };
    }

    /**
     * Private helper methods
     */

    private detectFramework(content: string): string {
        if (content.includes('@jest/globals') || content.includes("from 'jest'")) {
            return 'jest';
        }
        if (content.includes("from 'mocha'") || content.includes('describe(')) {
            return 'mocha';
        }
        if (content.includes('import pytest') || content.includes('def test_')) {
            return 'pytest';
        }
        if (content.includes('import "testing"')) {
            return 'testing';
        }
        return 'unknown';
    }

    private parseTestSuites(content: string, framework: string): TestSuite[] {
        const suites: TestSuite[] = [];

        if (framework === 'jest' || framework === 'mocha') {
            // Parse describe blocks
            const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:function\s*)?\(\)\s*(?:=>)?\s*{([\s\S]*?)}\s*\)/g;
            let match;

            while ((match = describeRegex.exec(content)) !== null) {
                const suiteName = match[1];
                const suiteContent = match[2];
                
                const tests = this.parseTestCases(suiteContent, framework);
                const beforeEach = this.extractHook(suiteContent, 'beforeEach');
                const afterEach = this.extractHook(suiteContent, 'afterEach');
                const beforeAll = this.extractHook(suiteContent, 'beforeAll') || this.extractHook(suiteContent, 'before');
                const afterAll = this.extractHook(suiteContent, 'afterAll') || this.extractHook(suiteContent, 'after');

                suites.push({
                    name: suiteName,
                    tests,
                    beforeEach,
                    afterEach,
                    beforeAll,
                    afterAll,
                });
            }
        } else if (framework === 'pytest') {
            // Parse Python test classes
            const classRegex = /class\s+Test(\w+):\s*([\s\S]*?)(?=\nclass\s|\n\S|\Z)/g;
            let match;

            while ((match = classRegex.exec(content)) !== null) {
                const suiteName = match[1];
                const suiteContent = match[2];
                
                const tests = this.parsePythonTestCases(suiteContent);

                suites.push({
                    name: suiteName,
                    tests,
                });
            }
        }

        return suites;
    }

    private parseTestCases(content: string, framework: string): TestCase[] {
        const tests: TestCase[] = [];
        const testRegex = /it\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(async\s+)?(?:function\s*)?\(\)\s*(?:=>)?\s*{([\s\S]*?)}\s*\)/g;
        let match;

        while ((match = testRegex.exec(content)) !== null) {
            const name = match[1];
            const isAsync = !!match[2];
            const sourceCode = match[3];
            const assertionCount = this.countAssertions(sourceCode, framework);

            tests.push({
                name,
                isAsync,
                hasAssertions: assertionCount > 0,
                assertionCount,
                hasMocks: this.hasMocksInCode(sourceCode),
                pattern: this.detectTestPattern(sourceCode),
                sourceCode,
                lineNumber: 0, // Would need more sophisticated parsing for accurate line numbers
            });
        }

        return tests;
    }

    private parsePythonTestCases(content: string): TestCase[] {
        const tests: TestCase[] = [];
        const testRegex = /def\s+(test_\w+)\s*\([^)]*\):\s*([\s\S]*?)(?=\n    def\s|\n\S|\Z)/g;
        let match;

        while ((match = testRegex.exec(content)) !== null) {
            const name = match[1];
            const sourceCode = match[2];
            const assertionCount = (sourceCode.match(/assert\s/g) || []).length;

            tests.push({
                name,
                isAsync: sourceCode.includes('async def'),
                hasAssertions: assertionCount > 0,
                assertionCount,
                hasMocks: sourceCode.includes('Mock') || sourceCode.includes('patch'),
                sourceCode,
                lineNumber: 0,
            });
        }

        return tests;
    }

    private extractHook(content: string, hookName: string): string | undefined {
        const hookRegex = new RegExp(`${hookName}\\s*\\([^)]*\\)\\s*(?:=>)?\\s*{([\\s\\S]*?)}`, 'g');
        const match = hookRegex.exec(content);
        return match ? match[1].trim() : undefined;
    }

    private countAssertions(code: string, framework: string): number {
        if (framework === 'jest') {
            return (code.match(/expect\s*\(/g) || []).length;
        }
        if (framework === 'mocha') {
            return (code.match(/expect\s*\(/g) || []).length + (code.match(/assert\./g) || []).length;
        }
        if (framework === 'pytest') {
            return (code.match(/assert\s/g) || []).length;
        }
        return 0;
    }

    private hasMocksInCode(code: string): boolean {
        return code.includes('jest.fn') ||
               code.includes('jest.mock') ||
               code.includes('jest.spyOn') ||
               code.includes('sinon.') ||
               code.includes('Mock(') ||
               code.includes('patch(');
    }

    private detectTestPattern(code: string): 'AAA' | 'BDD' | 'SETUP' | undefined {
        // Look for pattern comments
        if (code.includes('Arrange') && code.includes('Act') && code.includes('Assert')) {
            return 'AAA';
        }
        if (code.includes('Given') && code.includes('When') && code.includes('Then')) {
            return 'BDD';
        }
        if (code.includes('Setup') && code.includes('Exercise') && code.includes('Verify')) {
            return 'SETUP';
        }

        // Heuristic detection
        const lines = code.split('\n').filter(l => l.trim());
        if (lines.length >= 3) {
            // Simple AAA pattern detection
            const hasSetup = lines.slice(0, Math.floor(lines.length / 3)).some(l => l.includes('const') || l.includes('let'));
            const hasAction = lines.slice(Math.floor(lines.length / 3), Math.floor(2 * lines.length / 3)).some(l => !l.includes('expect'));
            const hasAssert = lines.slice(Math.floor(2 * lines.length / 3)).some(l => l.includes('expect') || l.includes('assert'));
            
            if (hasSetup && hasAction && hasAssert) {
                return 'AAA';
            }
        }

        return undefined;
    }

    private analyzeTestStyle(content: string, suites: TestSuite[]): TestStyle {
        // Detect pattern
        const patterns = new Set<string>();
        for (const suite of suites) {
            for (const test of suite.tests) {
                if (test.pattern) {
                    patterns.add(test.pattern);
                }
            }
        }
        const pattern = patterns.size === 1 ? Array.from(patterns)[0] as any : 'mixed';

        // Detect naming style
        const testNames = suites.flatMap(s => s.tests.map(t => t.name));
        const avgLength = testNames.reduce((sum, name) => sum + name.length, 0) / testNames.length;
        const naming = avgLength > 30 ? 'descriptive' : 'concise';

        // Detect assertion style
        let assertionStyle = 'unknown';
        if (content.includes('expect(')) {
            assertionStyle = 'expect';
        } else if (content.includes('assert.')) {
            assertionStyle = 'assert';
        }

        // Detect mocking style
        let mockingStyle: string | undefined;
        if (content.includes('jest.fn')) {
            mockingStyle = 'jest';
        } else if (content.includes('sinon.')) {
            mockingStyle = 'sinon';
        } else if (content.includes('Mock(')) {
            mockingStyle = 'unittest.mock';
        }

        return {
            pattern,
            naming,
            assertionStyle,
            mockingStyle,
        };
    }

    private hasMocks(content: string): boolean {
        return content.includes('jest.fn') ||
               content.includes('jest.mock') ||
               content.includes('sinon') ||
               content.includes('Mock(') ||
               content.includes('patch(');
    }

    private hasSetup(content: string): boolean {
        return content.includes('beforeEach') ||
               content.includes('beforeAll') ||
               content.includes('before(') ||
               content.includes('setup_method') ||
               content.includes('setup_class');
    }

    private hasTeardown(content: string): boolean {
        return content.includes('afterEach') ||
               content.includes('afterAll') ||
               content.includes('after(') ||
               content.includes('teardown_method') ||
               content.includes('teardown_class');
    }

    private calculateCompleteness(testInfo: TestFileInfo, issues: TestIssue[], suggestions: string[]): number {
        let score = 1.0;

        // Penalize low test count
        if (testInfo.testCount < 3) {
            score -= 0.3;
            issues.push({
                severity: 'warning',
                message: 'Test file has very few tests',
                category: 'coverage',
            });
            suggestions.push('Add more test cases to cover edge cases and error scenarios');
        }

        // Check for missing setup/teardown
        if (!testInfo.hasSetup && testInfo.hasMocks) {
            score -= 0.1;
            suggestions.push('Consider adding beforeEach/afterEach hooks to clean up mocks');
        }

        return Math.max(0, score);
    }

    private calculateClarity(testInfo: TestFileInfo, issues: TestIssue[], suggestions: string[]): number {
        let score = 1.0;

        for (const suite of testInfo.suites) {
            for (const test of suite.tests) {
                // Check test naming
                if (test.name.length < 10) {
                    score -= 0.05;
                    issues.push({
                        severity: 'info',
                        message: `Test name too short: "${test.name}"`,
                        testName: test.name,
                        category: 'style',
                    });
                }

                // Check for assertions
                if (!test.hasAssertions) {
                    score -= 0.2;
                    issues.push({
                        severity: 'error',
                        message: `Test has no assertions: "${test.name}"`,
                        testName: test.name,
                        category: 'quality',
                    });
                }
            }
        }

        if (testInfo.style.pattern === 'mixed') {
            score -= 0.1;
            suggestions.push('Use a consistent test pattern (AAA, BDD, or SETUP) across all tests');
        }

        return Math.max(0, score);
    }

    private calculateMaintainability(testInfo: TestFileInfo, issues: TestIssue[], suggestions: string[]): number {
        let score = 1.0;

        // Check for setup/teardown usage
        const needsSetup = testInfo.suites.some(s => 
            s.tests.length > 3 && !s.beforeEach && !s.beforeAll
        );

        if (needsSetup) {
            score -= 0.2;
            suggestions.push('Use beforeEach/afterEach hooks to reduce code duplication');
        }

        // Check test isolation
        for (const suite of testInfo.suites) {
            for (const test of suite.tests) {
                if (test.sourceCode.includes('global.') || test.sourceCode.includes('window.')) {
                    score -= 0.1;
                    issues.push({
                        severity: 'warning',
                        message: `Test may affect global state: "${test.name}"`,
                        testName: test.name,
                        category: 'quality',
                    });
                }
            }
        }

        return Math.max(0, score);
    }

    private calculateReliability(testInfo: TestFileInfo, issues: TestIssue[], suggestions: string[]): number {
        let score = 1.0;

        for (const suite of testInfo.suites) {
            for (const test of suite.tests) {
                // Check for flaky patterns
                if (this.isFlakyTest(test)) {
                    score -= 0.3;
                    issues.push({
                        severity: 'warning',
                        message: `Test may be flaky: "${test.name}"`,
                        testName: test.name,
                        category: 'flaky',
                    });
                }

                // Check for proper async handling
                if (test.isAsync && !test.sourceCode.includes('await')) {
                    score -= 0.2;
                    issues.push({
                        severity: 'error',
                        message: `Async test missing await: "${test.name}"`,
                        testName: test.name,
                        category: 'quality',
                    });
                }
            }
        }

        return Math.max(0, score);
    }

    private isFlakyTest(test: TestCase): boolean {
        const flakyPatterns = [
            /setTimeout/i,
            /setInterval/i,
            /Math\.random/i,
            /Date\.now/i,
            /new Date\(\)/i,
            /performance\.now/i,
        ];

        return flakyPatterns.some(pattern => pattern.test(test.sourceCode));
    }

    private async parseFunctionsFromFile(filePath: string): Promise<FunctionInfo[]> {
        const functions: FunctionInfo[] = [];
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const language = this.detectLanguageFromPath(filePath);

            // Simple function parsing (could be enhanced with actual AST parsing)
            if (language === 'typescript' || language === 'javascript') {
                const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;
                let match;
                while ((match = functionRegex.exec(content)) !== null) {
                    functions.push({
                        name: match[1],
                        parameters: [],
                        isAsync: content.includes('async'),
                        isMethod: false,
                        sourceCode: content,
                        filePath,
                        language,
                    });
                }
            }

            return functions;
        } catch (error) {
            console.error('Error parsing functions:', error);
            return functions;
        }
    }

    private detectLanguageFromPath(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.go': 'go',
        };
        return langMap[ext] || 'unknown';
    }

    private findTestFile(sourceFilePath: string): string | null {
        const dir = path.dirname(sourceFilePath);
        const basename = path.basename(sourceFilePath, path.extname(sourceFilePath));
        const ext = path.extname(sourceFilePath);

        // Common test file patterns
        const patterns = [
            path.join(dir, `${basename}.test${ext}`),
            path.join(dir, `${basename}.spec${ext}`),
            path.join(dir, '__tests__', `${basename}${ext}`),
            path.join(dir, '__tests__', `${basename}.test${ext}`),
        ];

        for (const pattern of patterns) {
            if (fs.existsSync(pattern)) {
                return pattern;
            }
        }

        return null;
    }

    private isFunctionTestedSufficiently(func: FunctionInfo, testInfo: TestFileInfo): boolean {
        // Check if function name appears in test names
        const functionNameLower = func.name.toLowerCase();
        const relatedTests = testInfo.suites.flatMap(s => s.tests)
            .filter(t => t.name.toLowerCase().includes(functionNameLower));

        // Need at least 3 tests (happy path, edge case, error case)
        return relatedTests.length >= 3;
    }

    private generateTestSuggestions(func: FunctionInfo): string[] {
        const suggestions = [
            `should return expected result with valid inputs`,
            `should handle edge cases (empty/null/undefined)`,
            `should throw error with invalid inputs`,
        ];

        if (func.isAsync) {
            suggestions.push(`should handle async errors correctly`);
        }

        if (func.parameters.length > 0) {
            suggestions.push(`should validate input parameters`);
        }

        return suggestions;
    }

    private calculateTestPriority(func: FunctionInfo): 'high' | 'medium' | 'low' {
        // Public functions are higher priority
        if (func.sourceCode.includes('export')) {
            return 'high';
        }

        // Functions with many parameters need more testing
        if (func.parameters.length > 3) {
            return 'high';
        }

        // Async functions are medium priority
        if (func.isAsync) {
            return 'medium';
        }

        return 'low';
    }

    private async parseCoverageFile(coveragePath: string, sourceFilePath: string): Promise<CoverageInfo | null> {
        try {
            const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
            
            // Parse coverage data (format varies by tool)
            // This is a simplified example
            const fileCoverage = coverageData[sourceFilePath];
            if (!fileCoverage) {
                return null;
            }

            return {
                linesCovered: fileCoverage.s?.covered || 0,
                totalLines: fileCoverage.s?.total || 0,
                branchesCovered: fileCoverage.b?.covered || 0,
                totalBranches: fileCoverage.b?.total || 0,
                functionsCovered: fileCoverage.f?.covered || 0,
                totalFunctions: fileCoverage.f?.total || 0,
                percentage: fileCoverage.percentage || 0,
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.testFilesCache.clear();
    }
}

/**
 * Convenience functions
 */

export async function analyzeTest(filePath: string): Promise<TestFileInfo> {
    const analyzer = new TestAnalyzer();
    return await analyzer.analyzeTestFile(filePath);
}

export async function getTestQuality(filePath: string): Promise<TestQuality> {
    const analyzer = new TestAnalyzer();
    return await analyzer.analyzeTestQuality(filePath);
}

export async function findMissingTestCases(sourceFilePath: string): Promise<MissingTestSuggestion[]> {
    const analyzer = new TestAnalyzer();
    return await analyzer.findMissingTests(sourceFilePath);
}
