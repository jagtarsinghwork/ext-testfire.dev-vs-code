/**
 * Testing Module
 * Comprehensive test generation and analysis system
 */

// Test Generator
export {
  TestGenerator,
  generateTestsForFunction,
  FunctionInfo,
  ParameterInfo,
  TestGenerationOptions,
  GeneratedTest,
} from './TestGenerator';

// Test Templates
export {
  TestTemplate,
  jestTemplate,
  mochaTemplate,
  pytestTemplate,
  goTemplate,
  getTemplate,
  getAllTemplates,
  generateMockData,
  getTestPattern,
  testPatterns,
  mockDataGenerators,
  TestPattern,
  MockDataGenerator,
} from './TestTemplates';

// Test Analyzer
export {
  TestAnalyzer,
  analyzeTest,
  getTestQuality,
  findMissingTestCases,
  TestFileInfo,
  TestSuite,
  TestCase,
  TestStyle,
  CoverageInfo,
  TestQuality,
  TestIssue,
  MissingTestSuggestion,
} from './TestAnalyzer';
