# Quick Start: Model Selection & Routing

## 1. Enable the Feature

Add to your VS Code `settings.json`:

```json
{
  "testfire.routing.enabled": true
}
```

## 2. Open Chat Panel

Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux), then type:

```
TestFire: Open AI Chat
```

## 3. Select a Model

In the chat header, you'll see a dropdown showing available models:

```
[T TestFire AI] [deepseek-coder:6.7b ▼] [+ Files] [New Chat]
```

Click the dropdown to see and select different models.

## 4. Try Smart Routing

The system automatically routes queries to the best model. Try these:

### Code Generation

```
Create a React component for a login form with email and password
```

→ Routes to models strong in code generation (DeepSeek-Coder, GPT-4)

### Bug Finding

```
Find the bug in this function that causes a memory leak
```

→ Routes to models strong in debugging (GPT-4, Claude-3-Opus)

### Explanation

```
Explain how async/await works in JavaScript
```

→ Routes to models strong in explanation (Claude-3-Opus, Llama3)

### Optimization

```
Optimize this database query for better performance
```

→ Routes to models strong in optimization (GPT-4, DeepSeek-Coder)

## 5. Provide Feedback

When you receive a response with code changes:

- ✅ **Accept** - Click "Apply" or approve the changes
- ❌ **Reject** - Ignore or reject the suggestion
- ✏️ **Modify** - Apply and make manual changes

This feedback improves future routing decisions!

## 6. Monitor Routing (Optional)

To see routing decisions in the output:

```json
{
  "testfire.routing.showDecisions": true
}
```

Open the Output panel (`View > Output`) and select "TestFire AI" to see logs like:

```
[ModelRouter] Routing decision: model=gpt-4, confidence=0.92, reason="Best for code generation (95% capability)"
```

## 7. Advanced Configuration

### Prioritize Speed

```json
{
  "testfire.routing.prioritizeSpeed": true
}
```

Routes to faster models (GPT-3.5, Claude-Haiku, local models)

### Prioritize Cost

```json
{
  "testfire.routing.prioritizeCost": true
}
```

Routes to free/cheap models (Ollama models, GPT-3.5)

### Disable Routing

```json
{
  "testfire.routing.enabled": false
}
```

Uses your manually selected model for all queries

## 8. Status Bar

The status bar shows:

```
● TestFire AI connected   Model: deepseek-coder:6.7b
```

- Green dot = Connected
- Red dot = Disconnected
- Model name updates when you switch or routing selects a different model

## Common Scenarios

### Scenario 1: "I want to use GPT-4 for everything"

1. Disable routing: `"testfire.routing.enabled": false`
2. Configure OpenAI provider
3. Select GPT-4 from dropdown

### Scenario 2: "I want fast local models"

1. Enable routing: `"testfire.routing.enabled": true`
2. Prioritize speed: `"testfire.routing.prioritizeSpeed": true`
3. Use Ollama with fast models (deepseek-coder, codellama)

### Scenario 3: "I want the best model for each task"

1. Enable routing: `"testfire.routing.enabled": true`
2. Configure multiple providers (Ollama + OpenAI/Anthropic)
3. Let the system choose automatically

### Scenario 4: "I want to see why decisions were made"

1. Enable routing: `"testfire.routing.enabled": true`
2. Show decisions: `"testfire.routing.showDecisions": true`
3. Check Output panel after each query

## Troubleshooting

### "Model selector is empty"

→ Provider not running or no models available
→ For Ollama: `ollama list` to check models

### "Routing isn't working"

→ Check `testfire.routing.enabled` is `true`
→ Need multiple providers/models for routing to work
→ Single provider = uses that provider's models

### "Selected model keeps changing"

→ Routing is choosing different models for different tasks
→ This is normal and expected behavior
→ Disable routing to lock to one model

### "No performance data yet"

→ System needs 3-5 completed tasks per type to show stats
→ Keep using the system and providing feedback
→ Performance tracking improves over time

## Next Steps

1. ✅ Try different query types
2. ✅ Provide feedback (accept/reject)
3. ✅ Check routing decisions in logs
4. ✅ Adjust settings based on your workflow
5. ✅ Watch performance improve over time

## Support

For issues or questions:

- Check the full docs: `src/routing/README.md`
- View implementation: `ROUTING_SUMMARY.md`
- Enable debug logging: `"testfire.routing.showDecisions": true`

Happy coding! 🚀
