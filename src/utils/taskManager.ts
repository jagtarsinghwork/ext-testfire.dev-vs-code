import { TaskItem, TaskList } from '../types';

/**
 * Task Manager for tracking and managing tasks in the UI
 */
export class TaskManager {
  private tasks: Map<string, TaskList> = new Map();

  /**
   * Create a new task list
   */
  createTaskList(title: string, taskDescriptions: string[]): TaskList {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tasks: TaskItem[] = taskDescriptions.map((description, index) => ({
      id: `${id}-task-${index}`,
      description,
      status: 'pending',
      order: index,
    }));

    const taskList: TaskList = {
      id,
      title,
      tasks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
    };

    this.tasks.set(id, taskList);
    return taskList;
  }

  /**
   * Get a task list by ID
   */
  getTaskList(id: string): TaskList | undefined {
    return this.tasks.get(id);
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    listId: string,
    taskId: string,
    status: TaskItem['status'],
    result?: string,
    error?: string,
  ): boolean {
    const taskList = this.tasks.get(listId);
    if (!taskList) return false;

    const task = this.findTask(taskList.tasks, taskId);
    if (!task) return false;

    task.status = status;
    if (result) task.result = result;
    if (error) task.error = error;

    taskList.updatedAt = Date.now();

    // Update list status if all tasks completed
    if (this.areAllTasksComplete(taskList.tasks)) {
      taskList.status = 'completed';
    }

    return true;
  }

  /**
   * Find a task by ID (recursive for subtasks)
   */
  private findTask(tasks: TaskItem[], taskId: string): TaskItem | undefined {
    for (const task of tasks) {
      if (task.id === taskId) return task;
      if (task.subtasks) {
        const found = this.findTask(task.subtasks, taskId);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Check if all tasks are complete
   */
  private areAllTasksComplete(tasks: TaskItem[]): boolean {
    return tasks.every(
      (task) =>
        task.status === 'completed' ||
        task.status === 'skipped' ||
        task.status === 'failed',
    );
  }

  /**
   * Add a subtask to an existing task
   */
  addSubtask(
    listId: string,
    parentTaskId: string,
    description: string,
  ): TaskItem | null {
    const taskList = this.tasks.get(listId);
    if (!taskList) return null;

    const parentTask = this.findTask(taskList.tasks, parentTaskId);
    if (!parentTask) return null;

    const subtask: TaskItem = {
      id: `${parentTaskId}-sub-${Date.now()}`,
      description,
      status: 'pending',
      order: parentTask.subtasks?.length || 0,
    };

    if (!parentTask.subtasks) {
      parentTask.subtasks = [];
    }
    parentTask.subtasks.push(subtask);

    taskList.updatedAt = Date.now();
    return subtask;
  }

  /**
   * Get progress for a task list
   */
  getProgress(listId: string): {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
    percentage: number;
  } {
    const taskList = this.tasks.get(listId);
    if (!taskList) {
      return {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        pending: 0,
        percentage: 0,
      };
    }

    const stats = this.calculateStats(taskList.tasks);
    const percentage =
      stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return { ...stats, percentage };
  }

  /**
   * Calculate task statistics (recursive)
   */
  private calculateStats(tasks: TaskItem[]): {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
  } {
    let stats = {
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      pending: 0,
    };

    for (const task of tasks) {
      stats.total++;
      if (task.status === 'completed') stats.completed++;
      else if (task.status === 'failed') stats.failed++;
      else if (task.status === 'in-progress') stats.inProgress++;
      else if (task.status === 'pending') stats.pending++;

      if (task.subtasks) {
        const subStats = this.calculateStats(task.subtasks);
        stats.total += subStats.total;
        stats.completed += subStats.completed;
        stats.failed += subStats.failed;
        stats.inProgress += subStats.inProgress;
        stats.pending += subStats.pending;
      }
    }

    return stats;
  }

  /**
   * Cancel a task list
   */
  cancelTaskList(listId: string): boolean {
    const taskList = this.tasks.get(listId);
    if (!taskList) return false;

    taskList.status = 'cancelled';
    taskList.updatedAt = Date.now();

    // Mark all pending/in-progress tasks as skipped
    this.markTasksAsSkipped(taskList.tasks);

    return true;
  }

  /**
   * Mark tasks as skipped (recursive)
   */
  private markTasksAsSkipped(tasks: TaskItem[]): void {
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'in-progress') {
        task.status = 'skipped';
      }
      if (task.subtasks) {
        this.markTasksAsSkipped(task.subtasks);
      }
    }
  }

  /**
   * Get all active task lists
   */
  getActiveLists(): TaskList[] {
    return Array.from(this.tasks.values()).filter(
      (list) => list.status === 'active',
    );
  }

  /**
   * Clear completed task lists older than specified time
   */
  clearOldLists(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;

    for (const [id, list] of this.tasks.entries()) {
      if (list.status === 'completed' && now - list.updatedAt > maxAgeMs) {
        this.tasks.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Export task list as markdown checklist
   */
  exportAsMarkdown(listId: string): string {
    const taskList = this.tasks.get(listId);
    if (!taskList) return '';

    let markdown = `# ${taskList.title}\n\n`;
    markdown += this.tasksToMarkdown(taskList.tasks, 0);

    return markdown;
  }

  /**
   * Convert tasks to markdown (recursive)
   */
  private tasksToMarkdown(tasks: TaskItem[], indent: number): string {
    let markdown = '';
    const prefix = '  '.repeat(indent);

    for (const task of tasks) {
      const checkbox = task.status === 'completed' ? '[x]' : '[ ]';
      const icon = this.getTaskIcon(task.status);
      markdown += `${prefix}- ${checkbox} ${icon} ${task.description}`;

      if (task.error) {
        markdown += ` ❌ ${task.error}`;
      } else if (task.result) {
        markdown += ` ✓`;
      }

      markdown += '\n';

      if (task.subtasks && task.subtasks.length > 0) {
        markdown += this.tasksToMarkdown(task.subtasks, indent + 1);
      }
    }

    return markdown;
  }

  /**
   * Get emoji icon for task status
   */
  private getTaskIcon(status: TaskItem['status']): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'in-progress':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'skipped':
        return '⏭️';
      default:
        return '📋';
    }
  }
}

// Global task manager instance
export const taskManager = new TaskManager();
