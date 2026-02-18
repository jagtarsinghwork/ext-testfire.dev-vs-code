import * as vscode from 'vscode';
import * as cp from 'child_process';
import { FileChange } from '../types';
import { FileChangeManager } from '../files/FileChangeManager';
import { Logger } from '../utils/Logger';

/**
 * Executes concrete tasks: file operations, running tests, checking for errors,
 * and suggesting fixes.
 */
export class TaskExecutor {
  private logger: Logger;

  constructor(
    private changeManager: FileChangeManager,
    private workspaceRoot: string
  ) {
    this.logger = new Logger('TaskExecutor');
  }

  /**
   * Apply a set of file changes.
   */
  async applyFileChanges(changes: FileChange[], description: string): Promise<string> {
    try {
      await this.changeManager.applyChanges(changes, description);
      return `Applied ${changes.length} file change(s): ${description}`;
    } catch (err: any) {
      return `Failed to apply changes: ${err.message}`;
    }
  }

  /**
   * Run the project's test suite and return results.
   */
  async runTests(testCommand?: string): Promise<{ success: boolean; output: string }> {
    const command = testCommand || await this.detectTestCommand();
    if (!command) {
      return { success: false, output: 'No test command found. Add a test script to package.json.' };
    }

    this.logger.info(`Running tests: ${command}`);

    try {
      const output = await this.execCommand(command, 60000);
      return { success: true, output: this.truncate(output, 3000) };
    } catch (err: any) {
      return { success: false, output: this.truncate(err.message, 3000) };
    }
  }

  /**
   * Run the linter and return results.
   */
  async runLint(lintCommand?: string): Promise<{ success: boolean; output: string }> {
    const command = lintCommand || await this.detectLintCommand();
    if (!command) {
      return { success: false, output: 'No lint command found.' };
    }

    try {
      const output = await this.execCommand(command, 30000);
      return { success: true, output: this.truncate(output, 2000) };
    } catch (err: any) {
      return { success: false, output: this.truncate(err.message, 2000) };
    }
  }

  /**
   * Run TypeScript type checking.
   */
  async runTypeCheck(): Promise<{ success: boolean; output: string }> {
    try {
      const output = await this.execCommand('npx tsc --noEmit', 30000);
      return { success: true, output: output || 'No type errors found.' };
    } catch (err: any) {
      return { success: false, output: this.truncate(err.message, 2000) };
    }
  }

  /**
   * Run a build command.
   */
  async runBuild(buildCommand?: string): Promise<{ success: boolean; output: string }> {
    const command = buildCommand || await this.detectBuildCommand();
    if (!command) {
      return { success: false, output: 'No build command found.' };
    }

    try {
      const output = await this.execCommand(command, 60000);
      return { success: true, output: this.truncate(output, 2000) };
    } catch (err: any) {
      return { success: false, output: this.truncate(err.message, 2000) };
    }
  }

  /**
   * Run any arbitrary shell command.
   */
  async runCommand(command: string, timeoutMs = 30000): Promise<{ success: boolean; output: string }> {
    try {
      const output = await this.execCommand(command, timeoutMs);
      return { success: true, output: this.truncate(output, 3000) };
    } catch (err: any) {
      return { success: false, output: this.truncate(err.message, 3000) };
    }
  }

  /**
   * Get VS Code diagnostics (errors/warnings) for the workspace.
   */
  getDiagnostics(): Array<{ file: string; message: string; severity: string; line: number }> {
    const results: Array<{ file: string; message: string; severity: string; line: number }> = [];

    const allDiagnostics = vscode.languages.getDiagnostics();
    for (const [uri, diagnostics] of allDiagnostics) {
      if (uri.scheme !== 'file') { continue; }
      for (const d of diagnostics) {
        if (d.severity <= vscode.DiagnosticSeverity.Warning) {
          results.push({
            file: vscode.workspace.asRelativePath(uri),
            message: d.message,
            severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
            line: d.range.start.line + 1,
          });
        }
      }
    }

    return results;
  }

  /**
   * Get error count from diagnostics.
   */
  getErrorCount(): number {
    return this.getDiagnostics().filter(d => d.severity === 'error').length;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async detectTestCommand(): Promise<string | null> {
    try {
      const output = await this.execCommand('node -e "const p=require(\'./package.json\'); console.log(p.scripts?.test || \'\')"', 5000);
      const testScript = output.trim();
      if (testScript && testScript !== 'undefined') {
        return 'npm test';
      }
    } catch { /* ignore */ }
    return null;
  }

  private async detectLintCommand(): Promise<string | null> {
    try {
      const output = await this.execCommand('node -e "const p=require(\'./package.json\'); console.log(p.scripts?.lint || \'\')"', 5000);
      const lintScript = output.trim();
      if (lintScript && lintScript !== 'undefined') {
        return 'npm run lint';
      }
    } catch { /* ignore */ }
    return null;
  }

  private async detectBuildCommand(): Promise<string | null> {
    try {
      const output = await this.execCommand('node -e "const p=require(\'./package.json\'); console.log(p.scripts?.build || \'\')"', 5000);
      const buildScript = output.trim();
      if (buildScript && buildScript !== 'undefined') {
        return 'npm run build';
      }
    } catch { /* ignore */ }
    return null;
  }

  private execCommand(command: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = cp.exec(command, {
        cwd: this.workspaceRoot,
        maxBuffer: 2 * 1024 * 1024,
        timeout: timeoutMs,
      }, (error, stdout, stderr) => {
        if (error) { reject(new Error(stderr + '\n' + stdout || error.message)); }
        else { resolve(stdout + (stderr ? '\n' + stderr : '')); }
      });
    });
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) { return text; }
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
