import * as vscode from 'vscode';
import { AIProvider, AIProviderType } from '../types';
import {
  QueryType,
  QueryClassifier,
  ClassificationResult,
} from './QueryClassifier';
import {
  PerformanceTracker,
  ModelPerformanceStats,
} from './PerformanceTracker';
import { Logger } from '../utils/Logger';

/**
 * Model capability profile
 */
export interface ModelCapability {
  model: string;
  provider: AIProviderType;
  // Strength scores for different task types (0-1)
  strengths: Partial<Record<QueryType, number>>;
  // Supported languages (higher score = better support)
  languages?: Record<string, number>;
  // Model characteristics
  maxTokens?: number;
  speed?: 'fast' | 'medium' | 'slow';
  costTier?: 'free' | 'low' | 'medium' | 'high';
  // Complexity handling
  complexityRating?: 'simple' | 'moderate' | 'advanced';
}

/**
 * Routing decision result
 */
export interface RoutingDecision {
  selectedModel: string;
  selectedProvider: AIProviderType;
  reason: string;
  confidence: number;
  alternatives?: Array<{
    model: string;
    provider: AIProviderType;
    score: number;
  }>;
  classification?: ClassificationResult;
}

/**
 * Routing options
 */
export interface RoutingOptions {
  preferredProvider?: AIProviderType;
  preferredModel?: string;
  codeComplexity?: 'low' | 'medium' | 'high';
  language?: string;
  prioritizeSpeed?: boolean;
  prioritizeCost?: boolean;
  forceModel?: string; // Override routing logic
}

/**
 * Smart router that selects optimal model based on query characteristics
 */
export class ModelRouter {
  private logger: Logger;
  private classifier: QueryClassifier;
  private performanceTracker: PerformanceTracker;
  private enableRouting: boolean = true;

  /**
   * Model capability matrix
   * These are baseline capabilities - actual performance is tracked by PerformanceTracker
   */
  private capabilities: ModelCapability[] = [
    // Ollama Models
    {
      model: 'deepseek-coder:6.7b',
      provider: 'ollama',
      strengths: {
        code_generation: 0.9,
        refactoring: 0.85,
        bug_finding: 0.8,
        optimization: 0.8,
        testing: 0.75,
        explanation: 0.7,
        documentation: 0.7,
      },
      languages: {
        javascript: 0.9,
        typescript: 0.9,
        python: 0.95,
        java: 0.85,
        go: 0.8,
        rust: 0.75,
      },
      speed: 'fast',
      costTier: 'free',
      complexityRating: 'moderate',
    },
    {
      model: 'codellama:13b',
      provider: 'ollama',
      strengths: {
        code_generation: 0.85,
        refactoring: 0.8,
        bug_finding: 0.75,
        explanation: 0.7,
        testing: 0.7,
      },
      speed: 'medium',
      costTier: 'free',
      complexityRating: 'moderate',
    },
    {
      model: 'qwen2.5-coder:latest',
      provider: 'ollama',
      strengths: {
        code_generation: 0.9,
        refactoring: 0.85,
        bug_finding: 0.8,
        optimization: 0.85,
        testing: 0.8,
      },
      speed: 'medium',
      costTier: 'free',
      complexityRating: 'moderate',
    },
    {
      model: 'llama3:latest',
      provider: 'ollama',
      strengths: {
        explanation: 0.9,
        documentation: 0.85,
        general: 0.9,
        code_generation: 0.6,
        refactoring: 0.6,
      },
      speed: 'medium',
      costTier: 'free',
      complexityRating: 'moderate',
    },

    // OpenAI Models
    {
      model: 'gpt-4',
      provider: 'openai',
      strengths: {
        code_generation: 0.95,
        refactoring: 0.95,
        bug_finding: 0.9,
        optimization: 0.9,
        testing: 0.9,
        explanation: 0.95,
        documentation: 0.9,
        general: 0.95,
      },
      speed: 'slow',
      costTier: 'high',
      complexityRating: 'advanced',
    },
    {
      model: 'gpt-3.5-turbo',
      provider: 'openai',
      strengths: {
        code_generation: 0.8,
        refactoring: 0.75,
        bug_finding: 0.75,
        explanation: 0.85,
        testing: 0.75,
        documentation: 0.8,
        general: 0.85,
      },
      speed: 'fast',
      costTier: 'low',
      complexityRating: 'moderate',
    },

    // Anthropic Models
    {
      model: 'claude-3-opus',
      provider: 'anthropic',
      strengths: {
        code_generation: 0.95,
        refactoring: 0.95,
        bug_finding: 0.9,
        optimization: 0.9,
        testing: 0.9,
        explanation: 0.98,
        documentation: 0.95,
        general: 0.95,
      },
      speed: 'slow',
      costTier: 'high',
      complexityRating: 'advanced',
    },
    {
      model: 'claude-3-sonnet',
      provider: 'anthropic',
      strengths: {
        code_generation: 0.9,
        refactoring: 0.88,
        bug_finding: 0.85,
        optimization: 0.85,
        testing: 0.85,
        explanation: 0.9,
        documentation: 0.88,
        general: 0.9,
      },
      speed: 'medium',
      costTier: 'medium',
      complexityRating: 'advanced',
    },
    {
      model: 'claude-3-haiku',
      provider: 'anthropic',
      strengths: {
        code_generation: 0.75,
        refactoring: 0.7,
        bug_finding: 0.7,
        explanation: 0.8,
        testing: 0.7,
        documentation: 0.75,
        general: 0.8,
      },
      speed: 'fast',
      costTier: 'low',
      complexityRating: 'moderate',
    },
  ];

  constructor(
    private context: vscode.ExtensionContext,
    performanceTracker?: PerformanceTracker,
  ) {
    this.logger = new Logger('ModelRouter');
    this.classifier = new QueryClassifier();
    this.performanceTracker =
      performanceTracker || new PerformanceTracker(context);
    this.loadConfig();

    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('testfire.routing')) {
        this.loadConfig();
      }
    });
  }

  /**
   * Load routing configuration
   */
  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('testfire.routing');
    this.enableRouting = config.get('enabled', true);
    this.logger.debug('Routing config loaded', {
      enableRouting: this.enableRouting,
    });
  }

  /**
   * Route a query to the best model
   */
  async route(
    query: string,
    currentProvider: AIProvider,
    availableProviders: Map<AIProviderType, AIProvider>,
    options: RoutingOptions = {},
  ): Promise<RoutingDecision> {
    this.logger.debug('Routing query', {
      query: query.substring(0, 100),
      options,
    });

    // If routing is disabled or model is forced, return current/forced model
    if (!this.enableRouting || options.forceModel) {
      return {
        selectedModel: options.forceModel || currentProvider.config.model,
        selectedProvider: currentProvider.config.type,
        reason: options.forceModel
          ? 'User-specified model'
          : 'Routing disabled - using current model',
        confidence: 1.0,
      };
    }

    // Classify the query
    const classification = this.classifier.classify(query);
    this.logger.debug('Query classified', classification);

    // Get available models from providers
    const availableModels = await this.getAvailableModels(availableProviders);
    if (availableModels.length === 0) {
      return {
        selectedModel: currentProvider.config.model,
        selectedProvider: currentProvider.config.type,
        reason: 'No alternative models available',
        confidence: 0.5,
        classification,
      };
    }

    // Score each available model
    const scores = await this.scoreModels(
      availableModels,
      classification,
      options,
    );

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    // Select the best model
    const best = scores[0];
    const alternatives = scores.slice(1, 4); // Top 3 alternatives

    const decision: RoutingDecision = {
      selectedModel: best.model,
      selectedProvider: best.provider,
      reason: this.generateReason(best, classification, options),
      confidence: Math.min(best.score, 1.0),
      alternatives: alternatives.map((s) => ({
        model: s.model,
        provider: s.provider,
        score: s.score,
      })),
      classification,
    };

    this.logger.info('Routing decision', {
      model: decision.selectedModel,
      provider: decision.selectedProvider,
      confidence: decision.confidence,
      queryType: classification.type,
    });

    return decision;
  }

  /**
   * Get list of available models from providers
   */
  private async getAvailableModels(
    providers: Map<AIProviderType, AIProvider>,
  ): Promise<Array<{ model: string; provider: AIProviderType }>> {
    const available: Array<{ model: string; provider: AIProviderType }> = [];

    for (const [type, provider] of providers.entries()) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          const models = await provider.listModels();
          for (const model of models) {
            available.push({ model, provider: type });
          }
        }
      } catch (error: any) {
        this.logger.warn(`Failed to list models for ${type}`, {
          error: error.message,
        });
      }
    }

    return available;
  }

  /**
   * Score models based on query and options
   */
  private async scoreModels(
    availableModels: Array<{ model: string; provider: AIProviderType }>,
    classification: ClassificationResult,
    options: RoutingOptions,
  ): Promise<
    Array<{ model: string; provider: AIProviderType; score: number }>
  > {
    const scored: Array<{
      model: string;
      provider: AIProviderType;
      score: number;
    }> = [];

    for (const { model, provider } of availableModels) {
      let score = 0;

      // 1. Base capability score (40% weight)
      const capability = this.getModelCapability(model, provider);
      if (capability) {
        const capabilityScore =
          capability.strengths[classification.type] || 0.5;
        score += capabilityScore * 0.4;

        // Language bonus
        if (options.language && capability.languages?.[options.language]) {
          score += capability.languages[options.language] * 0.1;
        }

        // Speed preference
        if (options.prioritizeSpeed) {
          const speedScore =
            capability.speed === 'fast'
              ? 1.0
              : capability.speed === 'medium'
                ? 0.6
                : 0.3;
          score += speedScore * 0.1;
        }

        // Cost preference
        if (options.prioritizeCost) {
          const costScore =
            capability.costTier === 'free'
              ? 1.0
              : capability.costTier === 'low'
                ? 0.7
                : 0.4;
          score += costScore * 0.1;
        }

        // Complexity matching
        if (options.codeComplexity) {
          const complexityMatch = this.matchComplexity(
            options.codeComplexity,
            capability.complexityRating || 'moderate',
          );
          score += complexityMatch * 0.1;
        }
      } else {
        // Unknown model - default score
        score += 0.5 * 0.4;
      }

      // 2. Historical performance score (40% weight)
      const stats = this.performanceTracker.getStats(
        classification.type,
        model,
        provider,
      );
      if (stats && stats.totalTasks >= 3) {
        // Only use stats if we have enough data
        const perfScore =
          stats.successRate * 0.5 +
          stats.userSatisfactionRate * 0.3 -
          Math.min(stats.avgResponseTime / 30000, 0.2); // Penalty for slow response
        score += perfScore * 0.4;
      } else {
        // No historical data - use base capability
        score += (capability?.strengths[classification.type] || 0.5) * 0.4;
      }

      // 3. User preference bonus (20% weight)
      if (options.preferredProvider === provider) {
        score += 0.15;
      }
      if (options.preferredModel === model) {
        score += 0.05;
      }

      scored.push({ model, provider, score });
    }

    return scored;
  }

  /**
   * Get model capability profile
   */
  private getModelCapability(
    model: string,
    provider: AIProviderType,
  ): ModelCapability | null {
    return (
      this.capabilities.find(
        (c) =>
          c.model === model ||
          (model.startsWith(c.model.split(':')[0]) && c.provider === provider),
      ) || null
    );
  }

  /**
   * Match complexity between requirement and model
   */
  private matchComplexity(
    required: 'low' | 'medium' | 'high',
    modelRating: 'simple' | 'moderate' | 'advanced',
  ): number {
    const complexityMap = {
      low: { simple: 1.0, moderate: 0.8, advanced: 0.6 },
      medium: { simple: 0.5, moderate: 1.0, advanced: 0.9 },
      high: { simple: 0.2, moderate: 0.7, advanced: 1.0 },
    };
    return complexityMap[required][modelRating];
  }

  /**
   * Generate human-readable reason for selection
   */
  private generateReason(
    selected: { model: string; provider: AIProviderType; score: number },
    classification: ClassificationResult,
    options: RoutingOptions,
  ): string {
    const capability = this.getModelCapability(
      selected.model,
      selected.provider,
    );
    const stats = this.performanceTracker.getStats(
      classification.type,
      selected.model,
      selected.provider,
    );

    let reason = `Best for ${this.classifier.getTypeDescription(classification.type).toLowerCase()}`;

    if (stats && stats.totalTasks >= 3) {
      reason += ` (${Math.round(stats.successRate * 100)}% success rate`;
      if (stats.userSatisfactionRate > 0.7) {
        reason += ', high user satisfaction';
      }
      reason += ')';
    } else if (capability) {
      const strength = capability.strengths[classification.type];
      if (strength && strength > 0.85) {
        reason += ' (highly capable)';
      }
    }

    if (options.prioritizeSpeed && capability?.speed === 'fast') {
      reason += ', fast response';
    }

    if (options.prioritizeCost && capability?.costTier === 'free') {
      reason += ', cost-effective';
    }

    return reason;
  }

  /**
   * Register a custom model capability
   */
  registerModel(capability: ModelCapability): void {
    const existing = this.capabilities.findIndex(
      (c) => c.model === capability.model && c.provider === capability.provider,
    );

    if (existing >= 0) {
      this.capabilities[existing] = capability;
    } else {
      this.capabilities.push(capability);
    }

    this.logger.info('Registered model capability', {
      model: capability.model,
      provider: capability.provider,
    });
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    totalModels: number;
    enabledProviders: AIProviderType[];
    topPerformers: Record<
      QueryType,
      { model: string; provider: string } | null
    >;
  } {
    const queryTypes: QueryType[] = [
      'code_generation',
      'explanation',
      'refactoring',
      'bug_finding',
      'optimization',
      'testing',
      'documentation',
    ];

    const topPerformers: Record<
      string,
      { model: string; provider: string } | null
    > = {};
    for (const type of queryTypes) {
      const best = this.performanceTracker.getBestModel(type);
      topPerformers[type] = best;
    }

    return {
      totalModels: this.capabilities.length,
      enabledProviders: [...new Set(this.capabilities.map((c) => c.provider))],
      topPerformers: topPerformers as Record<
        QueryType,
        { model: string; provider: string } | null
      >,
    };
  }
}
