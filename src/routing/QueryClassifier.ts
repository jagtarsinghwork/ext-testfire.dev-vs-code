import { Logger } from '../utils/Logger';

/**
 * Query type classifications
 */
export type QueryType =
  | 'code_generation'
  | 'explanation'
  | 'refactoring'
  | 'bug_finding'
  | 'optimization'
  | 'testing'
  | 'documentation'
  | 'general';

/**
 * Classification result with confidence score
 */
export interface ClassificationResult {
  type: QueryType;
  confidence: number;
  subType?: string;
  keywords: string[];
}

/**
 * Pattern-based query classifier using regex and heuristics
 */
export class QueryClassifier {
  private logger: Logger;

  /**
   * Query patterns mapped to query types
   */
  private patterns: Record<QueryType, RegExp[]> = {
    code_generation: [
      /\b(create|generate|write|build|implement|add|make)\b.*\b(function|class|component|module|api|endpoint|feature)\b/i,
      /\b(new|add)\b.*\b(file|page|route|screen|view)\b/i,
      /\bscaffold\b/i,
      /\bboilerplate\b/i,
      /\bhow\s+(to|do\s+i)\s+(create|write|implement)\b/i,
    ],
    explanation: [
      /\b(explain|describe|what\s+is|what\s+does|how\s+does|tell\s+me|clarify)\b/i,
      /\bwhat'?s\s+(the\s+)?(purpose|meaning|difference)\b/i,
      /\bwhy\s+(is|does|would)\b/i,
      /\b(understand|learn|help\s+me\s+understand)\b/i,
      /\bcan\s+you\s+explain\b/i,
    ],
    refactoring: [
      /\b(refactor|restructure|reorganize|improve|rewrite|clean\s+up|simplify)\b/i,
      /\b(extract|split|merge|combine|consolidate)\b.*\b(function|method|class|component)\b/i,
      /\b(rename|move|relocate)\b/i,
      /\bcode\s+smell\b/i,
      /\bdesign\s+pattern\b/i,
    ],
    bug_finding: [
      /\b(bug|error|issue|problem|wrong|broken|fail|crash|doesn'?t\s+work)\b/i,
      /\b(fix|debug|troubleshoot|diagnose|resolve)\b/i,
      /\b(find|check|look\s+for)\b.*\b(bug|error|issue|problem)\b/i,
      /\bwhy\s+(isn'?t|doesn'?t|won'?t)\b/i,
      /\bnot\s+working\b/i,
      /\b(undefined|null\s+reference|type\s+error|syntax\s+error)\b/i,
    ],
    optimization: [
      /\b(optimize|performance|faster|speed\s+up|slow|improve\s+performance)\b/i,
      /\b(reduce|minimize|decrease)\b.*\b(memory|time|complexity|latency)\b/i,
      /\b(efficient|efficiency|inefficient)\b/i,
      /\b(cache|caching|memoize|lazy\s+load)\b/i,
      /\bbig\s+o\b/i,
      /\bbottleneck\b/i,
    ],
    testing: [
      /\b(test|unit\s+test|integration\s+test|e2e|test\s+case)\b/i,
      /\b(mock|stub|spy|fixture)\b/i,
      /\b(jest|mocha|pytest|junit|testing\s+library)\b/i,
      /\bcode\s+coverage\b/i,
      /\b(assert|assertion|expect)\b/i,
      /\btest\s+driven\b/i,
    ],
    documentation: [
      /\b(document|documentation|comment|jsdoc|docstring|readme)\b/i,
      /\b(add|write|generate)\b.*\b(comment|doc|documentation)\b/i,
      /\bapi\s+doc\b/i,
      /\bannotate\b/i,
    ],
    general: [
      /\b(help|assist|support|guide)\b/i,
      /\bhow\s+to\b/i,
      /\bcan\s+you\b/i,
      /\bplease\b/i,
    ],
  };

  /**
   * Keyword weights for confidence scoring
   */
  private keywordWeights: Record<string, number> = {
    // High confidence keywords
    create: 0.9,
    generate: 0.9,
    implement: 0.9,
    refactor: 0.95,
    optimize: 0.95,
    bug: 0.85,
    fix: 0.85,
    test: 0.9,
    explain: 0.8,
    document: 0.85,

    // Medium confidence keywords
    write: 0.6,
    build: 0.6,
    add: 0.5,
    improve: 0.6,
    help: 0.4,
    why: 0.5,
    what: 0.5,
    how: 0.5,
  };

  constructor() {
    this.logger = new Logger('QueryClassifier');
  }

  /**
   * Classify a user query and return type with confidence score
   */
  classify(query: string): ClassificationResult {
    this.logger.debug('Classifying query', { query });

    const normalizedQuery = query.toLowerCase().trim();
    const scores: Partial<Record<QueryType, number>> = {};
    const matchedKeywords: string[] = [];

    // Score each query type based on pattern matches
    for (const [type, patterns] of Object.entries(this.patterns)) {
      let score = 0;
      let matches = 0;

      for (const pattern of patterns) {
        if (pattern.test(normalizedQuery)) {
          matches++;
          score += 1.0 / patterns.length; // Normalize by number of patterns
        }
      }

      if (matches > 0) {
        scores[type as QueryType] = Math.min(score, 1.0);
      }
    }

    // Boost score based on keyword presence and weights
    for (const [keyword, weight] of Object.entries(this.keywordWeights)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(normalizedQuery)) {
        matchedKeywords.push(keyword);

        // Boost the score of matching query types
        for (const type of Object.keys(scores)) {
          if (this.keywordMatchesType(keyword, type as QueryType)) {
            scores[type as QueryType] = Math.min(
              (scores[type as QueryType] || 0) + weight * 0.3,
              1.0,
            );
          }
        }
      }
    }

    // Apply heuristics
    const heuristicResult = this.applyHeuristics(normalizedQuery);
    if (heuristicResult) {
      scores[heuristicResult.type] = Math.max(
        scores[heuristicResult.type] || 0,
        heuristicResult.confidence,
      );
    }

    // Find the type with highest score
    let bestType: QueryType = 'general';
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as QueryType;
      }
    }

    // Default to general if confidence is too low
    const confidence = bestScore > 0.3 ? bestScore : 0.5;
    if (bestScore < 0.3) {
      bestType = 'general';
    }

    const result: ClassificationResult = {
      type: bestType,
      confidence,
      keywords: matchedKeywords,
    };

    // Detect sub-types
    result.subType = this.detectSubType(normalizedQuery, bestType);

    this.logger.debug('Classification result', result);
    return result;
  }

  /**
   * Check if a keyword matches a query type
   */
  private keywordMatchesType(keyword: string, type: QueryType): boolean {
    const typeKeywords: Record<QueryType, string[]> = {
      code_generation: [
        'create',
        'generate',
        'write',
        'build',
        'implement',
        'add',
      ],
      explanation: ['explain', 'what', 'why', 'how', 'describe'],
      refactoring: ['refactor', 'improve', 'clean', 'restructure'],
      bug_finding: ['bug', 'fix', 'error', 'debug'],
      optimization: ['optimize', 'performance', 'faster', 'efficient'],
      testing: ['test', 'mock', 'assert'],
      documentation: ['document', 'comment'],
      general: ['help', 'assist'],
    };

    return typeKeywords[type]?.includes(keyword.toLowerCase()) || false;
  }

  /**
   * Apply additional heuristics for better classification
   */
  private applyHeuristics(
    query: string,
  ): { type: QueryType; confidence: number } | null {
    // Questions about code are likely explanations
    if (/^\s*(what|why|how|when|where)\b/i.test(query)) {
      return { type: 'explanation', confidence: 0.7 };
    }

    // Commands to create/write are code generation
    if (/^\s*(create|write|generate|add|make)\b/i.test(query)) {
      return { type: 'code_generation', confidence: 0.75 };
    }

    // Commands to fix/debug are bug finding
    if (/^\s*(fix|debug|resolve|solve)\b/i.test(query)) {
      return { type: 'bug_finding', confidence: 0.75 };
    }

    // Mentions of test frameworks are testing
    if (
      /\b(jest|mocha|pytest|junit|vitest|cypress|playwright)\b/i.test(query)
    ) {
      return { type: 'testing', confidence: 0.8 };
    }

    // Performance-related terms
    if (/\b(slow|lag|freeze|hang|timeout)\b/i.test(query)) {
      return { type: 'optimization', confidence: 0.7 };
    }

    // Code quality terms
    if (/\b(clean|messy|readable|maintainable|solid|dry)\b/i.test(query)) {
      return { type: 'refactoring', confidence: 0.7 };
    }

    return null;
  }

  /**
   * Detect sub-types within a query type
   */
  private detectSubType(query: string, type: QueryType): string | undefined {
    switch (type) {
      case 'code_generation':
        if (/\b(api|endpoint|route)\b/i.test(query)) return 'api';
        if (/\b(ui|component|view|page)\b/i.test(query)) return 'ui';
        if (/\b(database|model|schema)\b/i.test(query)) return 'database';
        if (/\b(util|helper|function)\b/i.test(query)) return 'utility';
        break;

      case 'testing':
        if (/\bunit\b/i.test(query)) return 'unit';
        if (/\bintegration\b/i.test(query)) return 'integration';
        if (/\be2e|end.to.end\b/i.test(query)) return 'e2e';
        break;

      case 'optimization':
        if (/\bmemory\b/i.test(query)) return 'memory';
        if (/\btime|speed|faster\b/i.test(query)) return 'time';
        if (/\bnetwork|api|request\b/i.test(query)) return 'network';
        break;

      case 'refactoring':
        if (/\bextract\b/i.test(query)) return 'extract';
        if (/\bsplit\b/i.test(query)) return 'split';
        if (/\bmerge|combine\b/i.test(query)) return 'merge';
        if (/\brename\b/i.test(query)) return 'rename';
        break;
    }

    return undefined;
  }

  /**
   * Get human-readable description of query type
   */
  getTypeDescription(type: QueryType): string {
    const descriptions: Record<QueryType, string> = {
      code_generation: 'Creating new code',
      explanation: 'Explaining concepts',
      refactoring: 'Improving code structure',
      bug_finding: 'Finding and fixing bugs',
      optimization: 'Optimizing performance',
      testing: 'Writing tests',
      documentation: 'Adding documentation',
      general: 'General assistance',
    };

    return descriptions[type] || 'General task';
  }
}
