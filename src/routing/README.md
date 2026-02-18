# Smart Model Selection and Routing System

This module provides intelligent model selection and routing capabilities for TestFire AI.

## Overview

The routing system automatically selects the best AI model for each task based on:

- **Query type classification** (code generation, bug finding, refactoring, etc.)
- **Model capabilities** (which models are good at what tasks)
- **Historical performance** (success rates, user satisfaction, response times)
- **User preferences** (preferred providers, models, speed vs quality trade-offs)

## Components

### 1. QueryClassifier

Classifies user queries into task types using pattern matching and heuristics.

**Query Types:**

- `code_generation` - Creating new code, functions, components
- `explanation` - Explaining concepts, code, or decisions
- `refactoring` - Improving code structure and quality
- `bug_finding` - Finding and fixing bugs
- `optimization` - Performance improvements
- `testing` - Writing tests
- `documentation` - Adding comments and docs
- `general` - General assistance

**Example:**

```typescript
import { QueryClassifier } from './routing';

const classifier = new QueryClassifier();
const result = classifier.classify('Create a React component for user login');

// Result:
// {
//   type: 'code_generation',
//   confidence: 0.9,
//   subType: 'ui',
//   keywords: ['create', 'component']
// }
```

### 2. ModelRouter

Routes queries to the optimal model based on capabilities and performance.

**Features:**

- Pre-configured capability matrix for popular models
- Historical performance tracking integration
- Fallback logic for unavailable models
- Support for Ollama, OpenAI, and Anthropic providers

**Example:**

```typescript
import { ModelRouter } from './routing';

const router = new ModelRouter(context);
const decision = await router.route(
  'Optimize this database query',
  currentProvider,
  availableProviders,
  {
    language: 'sql',
    prioritizeSpeed: false,
  },
);

// Decision:
// {
//   selectedModel: 'gpt-4',
//   selectedProvider: 'openai',
//   reason: 'Best for optimizing performance (95% success rate, high user satisfaction)',
//   confidence: 0.92,
//   alternatives: [...]
// }
```

**Model Capability Matrix:**

| Model          | Code Gen | Refactor | Bug Fix | Optimization | Testing | Explanation |
| -------------- | -------- | -------- | ------- | ------------ | ------- | ----------- |
| GPT-4          | 0.95     | 0.95     | 0.90    | 0.90         | 0.90    | 0.95        |
| Claude-3-Opus  | 0.95     | 0.95     | 0.90    | 0.90         | 0.90    | 0.98        |
| DeepSeek-Coder | 0.90     | 0.85     | 0.80    | 0.80         | 0.75    | 0.70        |
| GPT-3.5-Turbo  | 0.80     | 0.75     | 0.75    | 0.75         | 0.75    | 0.85        |

### 3. PerformanceTracker

Tracks model performance metrics to improve routing decisions over time.

**Tracked Metrics:**

- Success/failure rates
- Response times
- User feedback (accepted/rejected/modified)
- Task completion rates

**Example:**

```typescript
import { PerformanceTracker } from './routing';

const tracker = new PerformanceTracker(context);

// Start tracking a task
tracker.startTask('task_123', 'code_generation', 'gpt-4', 'openai', {
  language: 'typescript',
  codeComplexity: 'medium',
});

// Mark as completed
tracker.completeTask('task_123', true);

// Record user feedback
tracker.recordFeedback('task_123', 'accepted');

// Get statistics
const stats = tracker.getStats('code_generation', 'gpt-4', 'openai');
// {
//   successRate: 0.92,
//   userSatisfactionRate: 0.85,
//   avgResponseTime: 3500,
//   totalTasks: 45
// }
```

## Configuration

Add these settings to your VS Code `settings.json`:

```json
{
  // Enable/disable smart routing
  "testfire.routing.enabled": true,

  // Show routing decisions in output
  "testfire.routing.showDecisions": false,

  // Prioritize faster models
  "testfire.routing.prioritizeSpeed": false,

  // Prioritize cost-effective models
  "testfire.routing.prioritizeCost": true
}
```

## Usage in Extension

The routing system is integrated into `AgentChatPanel`:

```typescript
// In handleUserMessage():
const routingDecision = await this.modelRouter.route(
  content,
  this.provider,
  this.availableProviders,
  {
    language: this.contextBuilder.getSelectedCode()?.language,
    prioritizeSpeed: config.get('prioritizeSpeed', false),
  },
);

// Use routed provider
const routedProvider = this.availableProviders.get(
  routingDecision.selectedProvider,
);
if (routedProvider) {
  routedProvider.config.model = routingDecision.selectedModel;
  // ... use routedProvider for chat
}
```

## Model Selection UI

The chat panel includes a model selector dropdown in the header:

1. **List Models** - Shows available models from current provider
2. **Select Model** - Switch models on-the-fly
3. **Status Bar** - Displays current model
4. **Persistence** - Model preference saved to workspace state

## Performance Data Storage

Performance metrics are stored in VS Code workspace state:

- Key: `testfire.performanceMetrics`
- Persists across sessions
- Maximum 100 metrics per model/task type combination
- Automatically cleaned up to prevent bloat

## Routing Algorithm

The routing decision uses a weighted scoring system:

```
Final Score = (Base Capability × 0.4) +
              (Historical Performance × 0.4) +
              (User Preference × 0.2)

Where:
  Base Capability = Model's strength for task type (0-1)
  Historical Performance = Success rate × 0.5 +
                          User satisfaction × 0.3 -
                          Response time penalty × 0.2
  User Preference = Provider match × 0.15 +
                    Model match × 0.05
```

## Extending the System

### Register Custom Models

```typescript
router.registerModel({
  model: 'custom-model:latest',
  provider: 'ollama',
  strengths: {
    code_generation: 0.85,
    refactoring: 0.8,
    explanation: 0.75,
  },
  languages: {
    python: 0.9,
    javascript: 0.85,
  },
  speed: 'fast',
  costTier: 'free',
  complexityRating: 'moderate',
});
```

### Add Custom Query Patterns

```typescript
// Extend QueryClassifier
classifier.patterns['custom_type'] = [
  /\b(my|custom|pattern)\b/i,
  /\bspecial\s+task\b/i,
];
```

## Best Practices

1. **Let routing learn** - The system improves over time as it collects performance data
2. **Provide feedback** - Accept/reject responses to improve satisfaction tracking
3. **Configure preferences** - Set speed/cost priorities based on your needs
4. **Monitor performance** - Check output logs when `showDecisions` is enabled
5. **Register custom models** - Add your own models with appropriate capability scores

## Troubleshooting

### Routing not working?

1. Check that `testfire.routing.enabled` is `true`
2. Ensure multiple providers are available
3. Verify models are listed in the dropdown
4. Check output logs for routing decisions

### Models not appearing?

1. Verify provider is running (e.g., Ollama: `ollama list`)
2. Check API keys for OpenAI/Anthropic
3. Refresh the model list (close and reopen chat panel)

### Poor routing decisions?

1. System needs more data - wait for 5-10 tasks per type
2. Provide explicit feedback (accept/reject)
3. Check model capability scores - adjust if needed
4. Verify query classification is accurate

## API Reference

See individual module files for detailed API documentation:

- [QueryClassifier.ts](./QueryClassifier.ts)
- [ModelRouter.ts](./ModelRouter.ts)
- [PerformanceTracker.ts](./PerformanceTracker.ts)
