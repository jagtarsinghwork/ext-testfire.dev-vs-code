# Change Log

All notable changes to the "testfire-dev" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-02-18

### Added - Core Personality Features

#### 🎨 Thorough Analysis

- Deep project file analysis before making suggestions
- Dependency graph examination for context-aware changes
- Pattern recognition across codebase
- Framework and structure detection
- Configurable thoroughness level (fast/balanced/thorough)

#### 🛡️ Cautious Workflow

- **Plan approval system**: Shows execution plans before autonomous tasks
- **Diff preview**: Side-by-side comparison before applying changes
- **Approval workflow**: Approve or reject individual changes
- **Multi-file preview**: Review all changes together
- **Automatic rollback**: Undo any applied changes

#### 🎓 Educational Mode

- **Explanation generator**: AI-powered explanations for all suggestions
- **Reasoning display**: Shows "why" behind every change
- **Pattern education**: Teaches design patterns and best practices
- **Confidence levels**: Displays AI confidence with rationale
- **On-demand explanations**: Request detailed explanations anytime

#### 📋 Task Tracking

- **Visual task lists**: See progress with status indicators (⏳🔄✅❌⏭️)
- **Hierarchical tasks**: Support for subtasks and dependencies
- **Real-time updates**: Live progress tracking during execution
- **Markdown export**: Export task lists as checklists
- **Task history**: Track completed and cancelled tasks

### Added - Infrastructure

- Enhanced message types for previews, explanations, and approvals
- `DiffGenerator` utility for generating unified diffs
- `TaskManager` class for tracking and managing tasks
- `ExplanationGenerator` for creating educational content
- Pending approvals tracking system
- Task status update handlers

### Added - Configuration

- `testfire.showPreviewBeforeApply`: Show diff preview before changes (default: true)
- `testfire.showPlanBeforeExecute`: Show plan before autonomous execution (default: true)
- `testfire.enableExplanations`: Generate educational explanations (default: true)
- `testfire.enableTaskTracking`: Show task progress in UI (default: true)
- `testfire.autoExplain`: Auto-generate explanations (default: false)
- `testfire.thoroughnessLevel`: Control analysis depth (default: balanced)

### Added - Message Types

- `approveMessage` / `rejectMessage`: Approve or reject suggested changes
- `requestExplanation`: Request detailed explanation for a suggestion
- `updateTaskStatus`: Update status of individual tasks
- `explanation`: Deliver generated explanation to UI
- `taskUpdate`: Update task progress in real-time

### Improved

- Chat interface with approval buttons and explanation requests
- Stream completion callback now generates previews and explanations
- Message handling extended to support new approval workflow
- File change management with atomic operations

### Technical

- Added TypeScript types for TaskItem, TaskList
- Enhanced ChatMessage, AgentPlan, and AIAction types
- Added MultiFileEdit preview support
- Improved type safety throughout

## [Unreleased]

- Initial release
