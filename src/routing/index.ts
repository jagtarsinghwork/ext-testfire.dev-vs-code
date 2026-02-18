/**
 * Model Selection and Smart Routing System
 *
 * This module provides intelligent model selection and routing capabilities:
 * - QueryClassifier: Classifies user queries into task types
 * - ModelRouter: Routes queries to optimal models based on capabilities and performance
 * - PerformanceTracker: Tracks model performance to improve routing over time
 */

export {
  QueryClassifier,
  QueryType,
  ClassificationResult,
} from './QueryClassifier';
export {
  ModelRouter,
  ModelCapability,
  RoutingDecision,
  RoutingOptions,
} from './ModelRouter';
export {
  PerformanceTracker,
  TaskMetrics,
  ModelPerformanceStats,
} from './PerformanceTracker';
