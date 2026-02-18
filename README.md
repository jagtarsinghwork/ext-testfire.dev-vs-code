# 🔥 Testfire Dev VS Code Extension

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code Marketplace](https://vsmarketplacebadge.apphb.com/version/jagtarsinghwork.ext-testfire.dev-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=jagtarsinghwork.ext-testfire.dev-vs-code)
[![GitHub Stars](https://img.shields.io/github/stars/jagtarsinghwork/ext-testfire.dev-vs-code?style=social)](https://github.com/jagtarsinghwork/ext-testfire.dev-vs-code)

## 🚀 Next-Gen AI Coding with Local Ollama

Testfire Dev is an open-source Visual Studio Code extension that brings advanced AI code completion, chat, and code analysis to your editor—powered by your own local Ollama models (v0.1+). No cloud required. 100% privacy. Fast, free, and developer-friendly.

---

### ✨ Features

- AI code completion and chat (local Ollama)
- Works offline—no data leaves your machine
- Supports multiple models (Llama2, etc.)
- Easy setup and configuration
- Open source and MIT licensed

---

## 🛠️ Quick Start

1. **Install Ollama v0.1+** ([Ollama GitHub](https://github.com/jmorganca/ollama))
2. **Download a model:**

```sh
ollama pull llama2
```

3. **Start Ollama server:**

```sh
ollama serve
```

4. **Install this extension in VS Code**
5. **Configure the extension** (set endpoint to `http://localhost:11434`)
6. **Start coding with AI!**

For full setup, see [OLLAMA_LOCAL_SETUP.md](./OLLAMA_LOCAL_SETUP.md).

---

## 📚 Documentation

- [Ollama Local Setup Guide](./OLLAMA_LOCAL_SETUP.md)
- [Extension Features](./GIT_FEATURES.md)
- [Quick Start Routing](./QUICK_START_ROUTING.md)

---

## 🤝 Contributing

We welcome issues, feature requests, and pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) (or open an issue to get started).

---

## 📢 Keywords

AI, Ollama, VS Code, Code Completion, Llama2, Open Source, Local AI, Privacy, Developer Tools, Chat, Coding Assistant

---

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

## ⭐️ Star & Share

If you find this project useful, please star the repo and share it with your friends and colleagues!

---

## 🔗 Links

- [GitHub Repository](https://github.com/jagtarsinghwork/ext-testfire.dev-vs-code)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jagtarsinghwork.ext-testfire.dev-vs-code)
- [Ollama Documentation](https://github.com/jmorganca/ollama)

# TestFire AI Agent 🔥

**TestFire.dev** - An intelligent AI-powered coding assistant for VS Code with project awareness, multi-file editing, autonomous task execution, and Cursor-like chat interface.

## 🌟 Features

### 🎨 **Personality & Style**

TestFire is designed to be your trusted coding companion with these characteristics:

- **Thorough**: Examines all relevant files before suggesting changes, analyzing dependencies and patterns across your codebase
- **Cautious**: Shows you detailed plans and diff previews before making any changes, requiring your approval
- **Educational**: Explains reasoning behind suggestions and provides learning opportunities with each interaction
- **Consistent**: Learns and follows your project's existing patterns, coding style, and best practices

### 🚀 **Core Capabilities**

#### 💬 **Intelligent Chat Interface**

- Cursor-style chat panel with streaming responses
- Context-aware conversations that understand your project structure
- Multi-turn conversations with full context retention
- Real-time syntax highlighting in code blocks

#### 📁 **Multi-File Operations**

- Edit multiple files simultaneously with atomic operations
- Preview all changes with side-by-side diffs
- Accept or reject changes individually or in bulk
- Automatic backup and rollback support
- Undo/redo for all file operations

#### 🤖 **Autonomous Agent Mode**

- Execute complex, multi-step tasks autonomously
- Automatic planning with step-by-step breakdown
- Progress tracking with live updates
- Plan approval workflow before execution
- Task list visualization

#### 🔍 **Deep Project Understanding**

- Semantic code search with embeddings
- Dependency graph analysis
- Framework and pattern detection
- Git integration and change tracking
- File tree visualization

#### 📊 **Task Tracking & Progress**

- Visual task lists with status indicators (⏳ 🔄 ✅ ❌ ⏭️)
- Hierarchical subtasks support
- Real-time progress updates
- Export to markdown checklists
- Automatic cleanup of completed tasks

#### 🎓 **Educational Explanations**

- Automatic or on-demand explanations for suggestions
- "Why" behind code changes explained clearly
- Pattern and best practice identification
- Learning resources and recommendations
- Confidence levels with reasoning

### 🔌 **Available Tools**

This agent can:

- 📁 **Read and write files** in your workspace
- 🔍 **Search** across your codebase (text + semantic)
- ✏️ **Edit multiple files** simultaneously with diff previews
- ▶️ **Execute commands** in terminal
- 🌐 **Access web resources** (if needed)
- 📋 **Track tasks and todos** with visual progress
- 🔄 **Analyze dependencies** and code relationships
- 🎯 **Generate plans** before execution
- 💡 **Explain reasoning** for all suggestions

## 📦 Requirements

- **VS Code**: Version 1.109.0 or higher
- **AI Provider**: One of the following:
  - **Ollama** (local, recommended): [Install Ollama](https://ollama.ai)
  - **OpenAI API**: Requires API key
  - **Anthropic API**: Requires API key

### Recommended Models

- **Ollama**: `deepseek-coder:6.7b`, `codellama:13b`, or `qwen2.5-coder:7b`
- **OpenAI**: `gpt-4-turbo`, `gpt-4`, or `gpt-3.5-turbo`
- **Anthropic**: `claude-3-opus`, `claude-3-sonnet`, or `claude-3-haiku`

## 🎯 Quick Start

1. **Install the extension** from VS Code Marketplace
2. **Configure your AI provider**:
   - Open Settings (`Cmd+,` or `Ctrl+,`)
   - Search for "TestFire"
   - Set your provider, model, and API key (if needed)
3. **Open the chat**: Press `Cmd+Shift+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
4. **Start coding!** 🚀

## ⚙️ Extension Settings

This extension contributes the following settings:

### 🤖 **AI Provider Settings**

- `testfire.provider`: AI provider (`ollama`, `openai`, `anthropic`)
- `testfire.providerUrl`: Base URL for the AI provider API
- `testfire.model`: Model to use
- `testfire.apiKey`: API key (for OpenAI/Anthropic)
- `testfire.maxTokens`: Maximum tokens in AI response (default: 4096)
- `testfire.temperature`: Response creativity (0-2, default: 0.7)
- `testfire.embeddingModel`: Model for semantic search

### ⚡ **Feature Toggles**

- `testfire.enableHover`: AI-powered hover information (default: true)
- `testfire.enableCompletions`: AI code completions (default: true)
- `testfire.enableQuickFix`: AI quick fixes and code actions (default: true)

### 🎨 **Behavior Settings**

- `testfire.showPreviewBeforeApply`: Show diff preview and require approval (default: true)
- `testfire.showPlanBeforeExecute`: Show plan and require approval for autonomous tasks (default: true)
- `testfire.enableExplanations`: Generate educational explanations (default: true)
- `testfire.enableTaskTracking`: Show task progress in chat (default: true)
- `testfire.autoExplain`: Auto-generate explanations for all suggestions (default: false)
- `testfire.thoroughnessLevel`: Analysis depth (`fast`, `balanced`, `thorough`, default: `balanced`)

### 📊 **Performance Settings**

- `testfire.contextMaxChars`: Maximum context characters (default: 12000)
- `testfire.maxFileSizeKB`: Maximum file size to scan in KB (default: 100)

## 🎮 Usage Examples

### 💬 Chat Mode

```
You: "Explain how authentication works in this project"
AI: [Analyzes auth files, explains flow with diagrams]

You: "Add input validation to the login form"
AI: [Shows plan, previews changes, explains why validation is important]
```

### 🤖 Agent Mode

```
You: "Refactor the API layer to use async/await consistently"
AI:
📋 Plan:
  1. ⏳ Analyze current API patterns
  2. ⏳ Identify callback-based code
  3. ⏳ Convert to async/await
  4. ⏳ Update error handling
  5. ⏳ Add tests

[Approve] [Reject]

[After approval...]
  1. ✅ Analyzed 15 API files
  2. 🔄 Converting auth.js...
  3. ⏳ Pending...
```

### 🔍 Context-Aware Assistance

```
[Select code in editor]
You: "Improve this function's performance"
AI: [Analyzes selected code + related files]

    💡 Explanation: This function has O(n²) complexity due to nested loops.

    📊 Preview changes:
    ✅ Added memoization
    ✅ Reduced complexity to O(n)
    ✅ Added benchmark tests

    🎓 Why: Memoization caches results to avoid redundant calculations...

[Approve] [Reject] [Request More Explanation]
```

## ⚙️ Configuration Tips

For best results:

✅ **Keep related files open** in editor for better context  
✅ **Select relevant code** when asking questions  
✅ **Provide clear, specific task descriptions**  
✅ **Review and approve plans** before execution  
✅ **Give feedback** when suggestions aren't perfect  
✅ **Enable explanations** to learn while coding  
✅ **Use balanced thoroughness** for everyday work

The more you use it, the better it understands your coding style and project patterns!

## 📝 Commands

Access via Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- `TestFire: Open AI Chat` - Open the chat interface
- `TestFire: Ask AI (Custom Prompt)` - Quick AI query
- `TestFire: Explain Code` - Explain selected code
- `TestFire: Improve Code` - Get improvement suggestions
- `TestFire: Add Unit Tests` - Generate tests
- `TestFire: Find Bugs & Issues` - Analyze for bugs
- `TestFire: Refactor Code` - Refactor selected code
- `TestFire: Run AI Agent` - Execute autonomous task
- `TestFire: Analyze Project` - Full project analysis
- `TestFire: Generate Component` - Create new component
- `TestFire: Re-index Workspace` - Refresh project index

## 🔧 Troubleshooting

### Ollama Connection Issues

```bash
# Check if Ollama is running
ollama list

# Start Ollama (if not running)
ollama serve

# Pull your model
ollama pull deepseek-coder:6.7b
```

### Slow Responses

- Try a smaller model (e.g., `codellama:7b` instead of `13b`)
- Reduce `contextMaxChars` in settings
- Set `thoroughnessLevel` to `fast`

### Out of Memory

- Reduce `maxFileSizeKB` in settings
- Exclude large files via `.testfireignore`
- Close unnecessary files in editor

## 🆕 What's New

### v0.1.0 - Initial Release

🎉 **New Features:**

- ✨ Thorough analysis of project files before suggestions
- 🛡️ Cautious workflow with plan approval and diff previews
- 🎓 Educational explanations for all AI suggestions
- 📋 Task tracking with visual progress indicators
- 🔄 Multi-file editing with atomic operations
- 🤖 Autonomous agent mode for complex tasks
- 💬 Cursor-style chat interface
- 🔍 Semantic code search
- 📊 Dependency graph visualization
- 🌲 File tree integration

## 🤝 Contributing

Found a bug? Have a feature request? [Open an issue](https://github.com/yourusername/testfire-dev/issues)!

## 📄 License

MIT License - See LICENSE file for details

---

**Enjoy coding with TestFire! 🔥**
