import * as vscode from 'vscode';
import { QueryType } from './QueryClassifier';
import { Logger } from '../utils/Logger';

/**
 * Performance metrics for a single task
 */
export interface TaskMetrics {
  taskId: string;
  queryType: QueryType;
  model: string;
  provider: string;
  startTime: number;
  endTime?: number;
  responseTime?: number;
  success: boolean;
  userFeedback?: 'accepted' | 'rejected' | 'modified';
  errorMessage?: string;
  tokensUsed?: number;
  codeComplexity?: 'low' | 'medium' | 'high';
  language?: string;
}

/**
 * Aggregated performance statistics
 */
export interface ModelPerformanceStats {
  model: string;
  provider: string;
  queryType: QueryType;
  totalTasks: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgResponseTime: number;
  acceptedCount: number;
  rejectedCount: number;
  modifiedCount: number;
  userSatisfactionRate: number;
  lastUpdated: number;
}

/**
 * Tracks model performance metrics to improve routing decisions
 */
export class PerformanceTracker {
  private logger: Logger;
  private metrics: Map<string, TaskMetrics[]> = new Map();
  private readonly MAX_METRICS_PER_KEY = 100;
  private readonly STATE_KEY = 'testfire.performanceMetrics';

  constructor(private context: vscode.ExtensionContext) {
    this.logger = new Logger('PerformanceTracker');
    this.loadFromState();
  }

  /**
   * Start tracking a new task
   */
  startTask(
    taskId: string,
    queryType: QueryType,
    model: string,
    provider: string,
    options?: {
      language?: string;
      codeComplexity?: 'low' | 'medium' | 'high';
    },
  ): void {
    const metric: TaskMetrics = {
      taskId,
      queryType,
      model,
      provider,
      startTime: Date.now(),
      success: false,
      ...options,
    };

    const key = this.getMetricKey(queryType, model, provider);
    const existing = this.metrics.get(key) || [];
    existing.push(metric);

    // Keep only recent metrics
    if (existing.length > this.MAX_METRICS_PER_KEY) {
      existing.shift();
    }

    this.metrics.set(key, existing);
    this.logger.debug(`Started tracking task ${taskId}`, {
      queryType,
      model,
      provider,
    });
  }

  /**
   * Mark task as completed successfully
   */
  completeTask(
    taskId: string,
    success: boolean,
    options?: {
      errorMessage?: string;
      tokensUsed?: number;
    },
  ): void {
    const metric = this.findMetric(taskId);
    if (!metric) {
      this.logger.warn(`Task ${taskId} not found for completion`);
      return;
    }

    metric.endTime = Date.now();
    metric.responseTime = metric.endTime - metric.startTime;
    metric.success = success;
    if (options) {
      Object.assign(metric, options);
    }

    this.saveToState();
    this.logger.debug(`Completed task ${taskId}`, {
      success,
      responseTime: metric.responseTime,
    });
  }

  /**
   * Record user feedback for a task
   */
  recordFeedback(
    taskId: string,
    feedback: 'accepted' | 'rejected' | 'modified',
  ): void {
    const metric = this.findMetric(taskId);
    if (!metric) {
      this.logger.warn(`Task ${taskId} not found for feedback`);
      return;
    }

    metric.userFeedback = feedback;
    this.saveToState();
    this.logger.debug(`Recorded feedback for task ${taskId}`, { feedback });
  }

  /**
   * Get performance statistics for a specific model and query type
   */
  getStats(
    queryType: QueryType,
    model: string,
    provider: string,
  ): ModelPerformanceStats | null {
    const key = this.getMetricKey(queryType, model, provider);
    const metrics = this.metrics.get(key);

    if (!metrics || metrics.length === 0) {
      return null;
    }

    const completedMetrics = metrics.filter((m) => m.endTime);
    if (completedMetrics.length === 0) {
      return null;
    }

    const successCount = completedMetrics.filter((m) => m.success).length;
    const failureCount = completedMetrics.length - successCount;
    const acceptedCount = completedMetrics.filter(
      (m) => m.userFeedback === 'accepted',
    ).length;
    const rejectedCount = completedMetrics.filter(
      (m) => m.userFeedback === 'rejected',
    ).length;
    const modifiedCount = completedMetrics.filter(
      (m) => m.userFeedback === 'modified',
    ).length;
    const feedbackCount = acceptedCount + rejectedCount + modifiedCount;

    const avgResponseTime =
      completedMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
      completedMetrics.length;

    return {
      model,
      provider,
      queryType,
      totalTasks: completedMetrics.length,
      successCount,
      failureCount,
      successRate: successCount / completedMetrics.length,
      avgResponseTime,
      acceptedCount,
      rejectedCount,
      modifiedCount,
      userSatisfactionRate:
        feedbackCount > 0
          ? (acceptedCount + modifiedCount * 0.5) / feedbackCount
          : 0.5, // Default to neutral if no feedback
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get performance comparison across all models for a query type
   */
  getComparison(queryType: QueryType): ModelPerformanceStats[] {
    const stats: ModelPerformanceStats[] = [];

    for (const [key, _metrics] of this.metrics.entries()) {
      const [qt, model, provider] = this.parseMetricKey(key);
      if (qt === queryType) {
        const stat = this.getStats(queryType, model, provider);
        if (stat && stat.totalTasks >= 3) {
          // Minimum 3 tasks for comparison
          stats.push(stat);
        }
      }
    }

    // Sort by a weighted score (success rate + satisfaction - response time penalty)
    return stats.sort((a, b) => {
      const scoreA =
        a.successRate * 0.4 +
        a.userSatisfactionRate * 0.4 -
        (a.avgResponseTime / 10000) * 0.2;
      const scoreB =
        b.successRate * 0.4 +
        b.userSatisfactionRate * 0.4 -
        (b.avgResponseTime / 10000) * 0.2;
      return scoreB - scoreA;
    });
  }

  /**
   * Get best performing model for a query type
   */
  getBestModel(
    queryType: QueryType,
  ): { model: string; provider: string; score: number } | null {
    const comparison = this.getComparison(queryType);
    if (comparison.length === 0) {
      return null;
    }

    const best = comparison[0];
    const score =
      best.successRate * 0.4 +
      best.userSatisfactionRate * 0.4 -
      (best.avgResponseTime / 10000) * 0.2;

    return {
      model: best.model,
      provider: best.provider,
      score,
    };
  }

  /**
   * Get all stored metrics (for debugging/analysis)
   */
  getAllMetrics(): TaskMetrics[] {
    const allMetrics: TaskMetrics[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.saveToState();
    this.logger.info('Cleared all performance metrics');
  }

  /**
   * Get metrics summary for reporting
   */
  getSummary(): {
    totalTasks: number;
    totalModels: number;
    queryTypes: Record<QueryType, number>;
    topModels: Array<{ model: string; provider: string; tasks: number }>;
  } {
    const allMetrics = this.getAllMetrics();
    const queryTypes: Record<string, number> = {};
    const modelCounts: Map<string, number> = new Map();

    for (const metric of allMetrics) {
      queryTypes[metric.queryType] = (queryTypes[metric.queryType] || 0) + 1;
      const modelKey = `${metric.provider}:${metric.model}`;
      modelCounts.set(modelKey, (modelCounts.get(modelKey) || 0) + 1);
    }

    const topModels = Array.from(modelCounts.entries())
      .map(([key, tasks]) => {
        const [provider, model] = key.split(':');
        return { model, provider, tasks };
      })
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 5);

    return {
      totalTasks: allMetrics.length,
      totalModels: modelCounts.size,
      queryTypes: queryTypes as Record<QueryType, number>,
      topModels,
    };
  }

  /**
   * Load metrics from workspace state
   */
  private loadFromState(): void {
    try {
      const stored = this.context.workspaceState.get<
        Record<string, TaskMetrics[]>
      >(this.STATE_KEY);
      if (stored) {
        this.metrics = new Map(Object.entries(stored));
        this.logger.info('Loaded performance metrics from state', {
          keys: this.metrics.size,
        });
      }
    } catch (error: any) {
      this.logger.error('Failed to load performance metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Save metrics to workspace state
   */
  private saveToState(): void {
    try {
      const toStore = Object.fromEntries(this.metrics.entries());
      this.context.workspaceState.update(this.STATE_KEY, toStore);
    } catch (error: any) {
      this.logger.error('Failed to save performance metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Find a metric by task ID
   */
  private findMetric(taskId: string): TaskMetrics | null {
    for (const metrics of this.metrics.values()) {
      const found = metrics.find((m) => m.taskId === taskId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Generate unique key for metric storage
   */
  private getMetricKey(
    queryType: QueryType,
    model: string,
    provider: string,
  ): string {
    return `${queryType}:${model}:${provider}`;
  }

  /**
   * Parse metric key back to components
   */
  private parseMetricKey(key: string): [QueryType, string, string] {
    const [queryType, model, provider] = key.split(':');
    return [queryType as QueryType, model, provider];
  }
}
