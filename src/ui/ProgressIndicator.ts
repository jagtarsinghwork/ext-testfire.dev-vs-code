import * as vscode from 'vscode';
import { ProgressInfo } from '../types';

/**
 * Shows a progress indicator in the VS Code status bar and notification area.
 * Supports step-by-step progress, estimated time, and cancellation.
 */
export class ProgressIndicator {
  private statusBarItem: vscode.StatusBarItem;
  private currentProgress: ProgressInfo | null = null;
  private cancelCallback: (() => void) | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = 'testfire-dev.cancelCurrentTask';
  }

  /**
   * Show a progress notification with step tracking.
   */
  async showProgress(
    label: string,
    totalSteps: number,
    task: (progress: ProgressReporter) => Promise<void>,
    cancellable = true,
  ): Promise<void> {
    this.currentProgress = {
      taskId: `task_${Date.now()}`,
      label,
      currentStep: 0,
      totalSteps,
      stepLabel: 'Starting...',
      percentage: 0,
      startTime: Date.now(),
      cancellable,
    };

    this.updateStatusBar();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `TestFire: ${label}`,
        cancellable,
      },
      async (progress, token) => {
        if (cancellable) {
          token.onCancellationRequested(() => {
            this.cancelCallback?.();
          });
        }

        const reporter: ProgressReporter = {
          step: (stepNum: number, stepLabel: string) => {
            this.currentProgress!.currentStep = stepNum;
            this.currentProgress!.stepLabel = stepLabel;
            this.currentProgress!.percentage = Math.round(
              (stepNum / totalSteps) * 100,
            );

            // Estimate remaining time
            const elapsed = Date.now() - this.currentProgress!.startTime;
            const rate = stepNum / elapsed;
            const remaining = (totalSteps - stepNum) / rate;
            this.currentProgress!.estimatedEndTime = Date.now() + remaining;

            const increment = (1 / totalSteps) * 100;
            progress.report({
              increment,
              message: `Step ${stepNum}/${totalSteps}: ${stepLabel}`,
            });

            this.updateStatusBar();
          },
          message: (msg: string) => {
            progress.report({ message: msg });
          },
        };

        this.cancelCallback = () => {
          // Will be called on cancellation
        };

        try {
          await task(reporter);
        } finally {
          this.currentProgress = null;
          this.statusBarItem.hide();
        }
      },
    );
  }

  /**
   * Show a simple indeterminate progress (spinner).
   */
  async showSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `TestFire: ${label}`,
        cancellable: false,
      },
      async () => task(),
    );
  }

  /**
   * Show quick status bar message.
   */
  showStatusMessage(message: string, durationMs = 3000): void {
    this.statusBarItem.text = `$(zap) ${message}`;
    this.statusBarItem.show();
    setTimeout(() => {
      if (!this.currentProgress) {
        this.statusBarItem.hide();
      }
    }, durationMs);
  }

  getCurrentProgress(): ProgressInfo | null {
    return this.currentProgress;
  }

  getEstimatedTimeRemaining(): string | null {
    if (!this.currentProgress?.estimatedEndTime) {
      return null;
    }
    const remaining = this.currentProgress.estimatedEndTime - Date.now();
    if (remaining <= 0) {
      return 'Almost done...';
    }
    if (remaining < 60000) {
      return `${Math.round(remaining / 1000)}s remaining`;
    }
    return `${Math.round(remaining / 60000)}m remaining`;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }

  private updateStatusBar(): void {
    if (!this.currentProgress) {
      this.statusBarItem.hide();
      return;
    }

    const p = this.currentProgress;
    const timeLeft = this.getEstimatedTimeRemaining();
    const timeStr = timeLeft ? ` (${timeLeft})` : '';

    this.statusBarItem.text = `$(sync~spin) ${p.label}: ${p.currentStep}/${p.totalSteps}${timeStr}`;
    this.statusBarItem.tooltip = `${p.stepLabel}\n${p.percentage}% complete${p.cancellable ? '\nClick to cancel' : ''}`;
    this.statusBarItem.show();
  }
}

export interface ProgressReporter {
  step(stepNum: number, stepLabel: string): void;
  message(msg: string): void;
}
