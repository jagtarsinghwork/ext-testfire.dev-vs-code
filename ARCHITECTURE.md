# 🏗️ Model Selection & Routing System - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      VS Code Extension                           │
│                     (TestFire AI Agent)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │
                    ┌───────────▼───────────┐
                    │   AgentChatPanel      │
                    │   (UI + Controller)   │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Model Selection &    │
                    │   Routing System      │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌────────────────┐     ┌──────────────────┐
│QueryClassifier│      │  ModelRouter   │     │PerformanceTracker│
│               │      │                │     │                  │
│  Classify     │─────▶│   Route to     │────▶│   Track & Learn  │
│  Query Type   │      │   Best Model   │     │                  │
└───────────────┘      └────────┬───────┘     └──────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    AI Providers       │
                    │  (Ollama/OpenAI/      │
                    │   Anthropic)          │
                    └───────────┬───────────┘
                                │
                                ▼
                         [AI Response]
```

## Component Details

### 1. AgentChatPanel (UI Layer)

```
┌─────────────────────────────────────────────────────┐
│              AgentChatPanel (Webview)               │
├─────────────────────────────────────────────────────┤
│  Header:                                            │
│    [Logo] TestFire AI  [Model Selector ▼] [+ Files]│
│                                                     │
│  Status Bar:                                        │
│    ● Connected | Provider: Ollama | Model: deepseek│
│                                                     │
│  Chat Area:                                         │
│    User: Create a login component                  │
│    AI: [Response with code...]                     │
│                                                     │
│  Input:                                             │
│    [Type your message...] [Send]                   │
└─────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Display model selector dropdown
- Handle user input
- Show routing decisions (optional)
- Display AI responses
- Track user feedback

**New Methods:**
- `handleListModels()` - Fetch available models
- `handleSelectModel(model)` - Switch to model
- `loadAvailableModels()` - Load model list
- `registerProvider(provider)` - Add provider for routing

### 2. QueryClassifier (Classification Layer)

```
┌─────────────────────────────────────────────┐
│          QueryClassifier                    │
├─────────────────────────────────────────────┤
│  Input: User Query (string)                 │
│         ↓                                   │
│  Step 1: Pattern Matching                   │
│         • Regex patterns (100+)             │
│         • Keyword detection                 │
│         ↓                                   │
│  Step 2: Confidence Scoring                 │
│         • Pattern match weight              │
│         • Keyword weight                    │
│         • Heuristic boost                   │
│         ↓                                   │
│  Step 3: Sub-type Detection                 │
│         • API, UI, Database, etc.           │
│         ↓                                   │
│  Output: ClassificationResult               │
│         • type: QueryType                   │
│         • confidence: 0-1                   │
│         • subType?: string                  │
│         • keywords: string[]                │
└─────────────────────────────────────────────┘
```

**Query Types:**
```
code_generation  → Create, write, implement
explanation      → Explain, what is, why
refactoring      → Improve, clean up, restructure
bug_finding      → Fix, debug, find bug
optimization     → Optimize, faster, performance
testing          → Test, unit test, mock
documentation    → Document, comment, JSDoc
general          → Help, guide, assist
```

### 3. ModelRouter (Routing Layer)

```
┌─────────────────────────────────────────────────────┐
│              ModelRouter                            │
├─────────────────────────────────────────────────────┤
│  Input: Query + Classification                      │
│         ↓                                           │
│  Step 1: Get Available Models                       │
│         • Query providers (Ollama/OpenAI/Anthropic) │
│         • Check availability                        │
│         ↓                                           │
│  Step 2: Score Each Model                           │
│         ┌─────────────────────────────────────┐    │
│         │ Score = (Capability × 0.4) +        │    │
│         │         (Performance × 0.4) +       │    │
│         │         (Preference × 0.2)          │    │
│         └─────────────────────────────────────┘    │
│         ↓                                           │
│  Step 3: Select Best Model                          │
│         • Sort by score                             │
│         • Apply fallback logic                      │
│         • Generate alternatives                     │
│         ↓                                           │
│  Output: RoutingDecision                            │
│         • selectedModel                             │
│         • selectedProvider                          │
│         • reason                                    │
│         • confidence                                │
│         • alternatives[]                            │
└─────────────────────────────────────────────────────┘
```

**Model Capability Matrix:**
```
                Code  Bug   Explain  Optim  Test  Speed  Cost
                Gen   Fix                                     
GPT-4           0.95  0.90  0.95     0.90   0.90  slow   $$$
Claude-Opus     0.95  0.90  0.98     0.90   0.90  slow   $$$
DeepSeek-Coder  0.90  0.80  0.70     0.80   0.75  fast   FREE
GPT-3.5-Turbo   0.80  0.75  0.85     0.75   0.75  fast   $
Claude-Haiku    0.75  0.70  0.80     0.70   0.70  fast   $
```

### 4. PerformanceTracker (Learning Layer)

```
┌─────────────────────────────────────────────────────┐
│          PerformanceTracker                         │
├─────────────────────────────────────────────────────┤
│  Task Lifecycle:                                    │
│                                                     │
│  1. startTask()                                     │
│     • Create TaskMetrics                            │
│     • Record: model, provider, type, startTime     │
│     ↓                                               │
│  2. [AI processes request...]                       │
│     ↓                                               │
│  3. completeTask()                                  │
│     • Record: endTime, success, responseTime       │
│     ↓                                               │
│  4. recordFeedback()                                │
│     • Record: accepted/rejected/modified           │
│     ↓                                               │
│  5. Calculate Statistics:                           │
│     ┌─────────────────────────────────────────┐   │
│     │ successRate = successes / total         │   │
│     │ satisfactionRate = (accepted + 0.5 *    │   │
│     │                     modified) / total   │   │
│     │ avgResponseTime = sum(times) / count    │   │
│     └─────────────────────────────────────────┘   │
│     ↓                                               │
│  6. Store in Workspace State                        │
│     • Key: testfire.performanceMetrics             │
│     • Max: 100 metrics per model/type              │
└─────────────────────────────────────────────────────┘
```

**Performance Stats:**
```typescript
{
  model: 'gpt-4',
  provider: 'openai',
  queryType: 'code_generation',
  totalTasks: 45,
  successRate: 0.92,        // 92% success
  userSatisfactionRate: 0.85, // 85% user happy
  avgResponseTime: 3200      // 3.2 seconds
}
```

## Data Flow

### Scenario: User Sends Query

```
1. User types: "Create a React login component"
   │
   ▼
2. AgentChatPanel.handleUserMessage()
   │
   ▼
3. QueryClassifier.classify()
   │
   ├─→ Match patterns: /create.*component/
   ├─→ Detect keywords: ['create', 'component']
   ├─→ Calculate confidence: 0.90
   └─→ Return: { type: 'code_generation', subType: 'ui' }
   │
   ▼
4. ModelRouter.route()
   │
   ├─→ Get available models
   ├─→ Score each model:
   │   • DeepSeek: 0.88 (high capability, fast, free)
   │   • GPT-4: 0.92 (highest capability)
   │   • GPT-3.5: 0.75 (moderate capability)
   └─→ Select: DeepSeek-Coder (best balance)
   │
   ▼
5. PerformanceTracker.startTask('task_123', ...)
   │
   ▼
6. AIProvider.chat([messages])
   │
   ▼
7. Stream response to user
   │
   ▼
8. User accepts → PerformanceTracker.recordFeedback('accepted')
   │
   ▼
9. Update stats → Improve future routing
```

## Message Flow (Webview ↔ Extension)

```
┌──────────────┐                    ┌────────────────┐
│   Webview    │                    │   Extension    │
└──────┬───────┘                    └────────┬───────┘
       │                                     │
       │  1. ready                           │
       ├────────────────────────────────────▶│
       │                                     │
       │  2. modelList (models[])            │
       │◀────────────────────────────────────┤
       │                                     │
       │  3. selectModel('gpt-4')            │
       ├────────────────────────────────────▶│
       │                                     │
       │  4. modelChanged('gpt-4')           │
       │◀────────────────────────────────────┤
       │                                     │
       │  5. sendMessage('Create...')        │
       ├────────────────────────────────────▶│
       │                                     │
       │  6. streamToken('const...')         │
       │◀────────────────────────────────────┤
       │  7. streamToken('login...')         │
       │◀────────────────────────────────────┤
       │                                     │
       │  8. streamComplete(content)         │
       │◀────────────────────────────────────┤
       │                                     │
       │  9. approveMessage(msgId)           │
       ├────────────────────────────────────▶│
       │                                     │
       │ 10. (feedback recorded)             │
       │                                     │
```

## Configuration Flow

```
┌───────────────────────────────────────────────┐
│         VS Code Settings (settings.json)      │
├───────────────────────────────────────────────┤
│  {                                            │
│    "testfire.routing.enabled": true,         │
│    "testfire.routing.showDecisions": false,  │
│    "testfire.routing.prioritizeSpeed": false,│
│    "testfire.routing.prioritizeCost": true   │
│  }                                            │
└───────────────┬───────────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │  ModelRouter  │
        │  .loadConfig()│
        └───────┬───────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
[Enabled?] [Show Log?] [Priority]
    │           │           │
    └───────────┴───────────┘
                │
                ▼
        [Routing Behavior]
```

## Storage Architecture

```
┌────────────────────────────────────────────┐
│     VS Code Workspace State                │
├────────────────────────────────────────────┤
│  Key: testfire.performanceMetrics          │
│  Value: {                                  │
│    "code_generation:gpt-4:openai": [       │
│      { taskId, startTime, endTime, ... },  │
│      { taskId, startTime, endTime, ... },  │
│      ...                                   │
│    ],                                      │
│    "bug_finding:deepseek:ollama": [...]    │
│  }                                         │
│                                            │
│  Key: testfire.selectedModel               │
│  Value: "deepseek-coder:6.7b"             │
└────────────────────────────────────────────┘
```

## Performance Characteristics

| Component | Latency | Memory | Disk |
|-----------|---------|--------|------|
| QueryClassifier | <10ms | ~1KB | 0 |
| ModelRouter | <50ms | ~5KB | 0 |
| PerformanceTracker | <5ms | ~10KB | ~10KB |
| Total Overhead | <65ms | ~16KB | ~10KB |

## Scalability

| Metric | Current | Max |
|--------|---------|-----|
| Query Types | 8 | Unlimited |
| Models in Matrix | 9 | Unlimited |
| Providers | 3 | Unlimited |
| Metrics per Key | 100 | Configurable |
| Total Storage | ~10KB | ~100KB |

## Extension Points

### 1. Add Custom Model
```typescript
router.registerModel({
  model: 'custom-model',
  provider: 'ollama',
  strengths: { code_generation: 0.9 },
  // ...
});
```

### 2. Add Custom Query Type
```typescript
classifier.patterns['custom_type'] = [
  /my pattern/i
];
```

### 3. Add Custom Provider
```typescript
panel.registerProvider(customProvider);
```

## Error Handling

```
┌─────────────────────────────────────┐
│        Error Scenarios              │
├─────────────────────────────────────┤
│  1. Provider unavailable            │
│     → Use cached model list         │
│     → Show warning in UI            │
│                                     │
│  2. Routing fails                   │
│     → Fallback to current model     │
│     → Log error                     │
│                                     │
│  3. Model not available             │
│     → Use alternative from list     │
│     → Update capability matrix      │
│                                     │
│  4. Performance tracking fails      │
│     → Continue without tracking     │
│     → Log warning                   │
└─────────────────────────────────────┘
```

## Testing Strategy

```
Unit Tests:
├── QueryClassifier
│   ├── Pattern matching
│   ├── Confidence scoring
│   └── Sub-type detection
│
├── ModelRouter
│   ├── Scoring algorithm
│   ├── Model selection
│   └── Fallback logic
│
└── PerformanceTracker
    ├── Metric calculation
    ├── Storage/retrieval
    └── Stats aggregation

Integration Tests:
├── UI ↔ Extension messages
├── Routing flow end-to-end
└── Feedback loop

Manual Tests:
├── Model selector UI
├── Query classification
├── Routing decisions
└── Performance improvement
```

## Security Considerations

- ✅ No external API calls (except AI providers)
- ✅ All data stored in VS Code workspace state
- ✅ No sensitive data logged
- ✅ User control via configuration
- ✅ Optional routing (can be disabled)

---

**Architecture Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready
