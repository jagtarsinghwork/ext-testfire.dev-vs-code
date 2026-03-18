import * as cp from 'child_process';
import * as path from 'path';
import { ToolDefinition, ToolResult } from '../types/agents';
import { ToolRegistry } from './ToolRegistry';
import { Logger } from '../utils/Logger';

const logger = new Logger('TerminalTools');

// Commands/patterns that are not allowed for safety
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/i,
  /\bsudo\b/i,
  /\bchmod\s+777/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b:\(\)\s*\{/, // fork bomb
  /\bformat\b.*\b[a-z]:/i,
  /\b(curl|wget)\b.*\|\s*(sh|bash)/i,
];

/**
 * Register terminal/command execution tools.
 * Commands are sandboxed to the workspace directory with safety checks.
 */
export function registerTerminalTools(
  registry: ToolRegistry,
  workspaceRoot: string,
): void {
  registry.register(runCommandDef, async (params): Promise<ToolResult> => {
    const cmd = params.command as string;
    const timeoutMs = (params.timeout as number) || 30000;

    if (!isSafeCommand(cmd)) {
      return {
        success: false,
        data: null,
        error: 'Command blocked for safety. Dangerous patterns detected.',
      };
    }

    try {
      const result = await execCommand(cmd, workspaceRoot, timeoutMs);
      return { success: true, data: result };
    } catch (err: any) {
      return {
        success: false,
        data: { stdout: '', stderr: err.message, exitCode: 1 },
        error: err.message,
      };
    }
  });

  registry.register(runGitCommandDef, async (params): Promise<ToolResult> => {
    const gitCmd = params.command as string;
    // Only allow git commands
    const fullCmd = gitCmd.startsWith('git ') ? gitCmd : `git ${gitCmd}`;

    // Block destructive git operations
    if (/\b(push\s+--force|reset\s+--hard|clean\s+-fd)\b/i.test(fullCmd)) {
      return {
        success: false,
        data: null,
        error: 'Destructive git command blocked. Requires manual execution.',
      };
    }

    try {
      const result = await execCommand(fullCmd, workspaceRoot, 30000);
      return { success: true, data: result };
    } catch (err: any) {
      return {
        success: false,
        data: { stdout: '', stderr: err.message, exitCode: 1 },
        error: err.message,
      };
    }
  });

  registry.register(runNpmCommandDef, async (params): Promise<ToolResult> => {
    const npmCmd = params.command as string;
    const fullCmd = npmCmd.startsWith('npm ') ? npmCmd : `npm ${npmCmd}`;

    try {
      const result = await execCommand(fullCmd, workspaceRoot, 60000);
      return { success: true, data: result };
    } catch (err: any) {
      return {
        success: false,
        data: { stdout: '', stderr: err.message, exitCode: 1 },
        error: err.message,
      };
    }
  });

  registry.register(getRunningProcessesDef, async (): Promise<ToolResult> => {
    try {
      const result = await execCommand(
        'ps aux | head -20',
        workspaceRoot,
        5000,
      );
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  });
}

function isSafeCommand(cmd: string): boolean {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return false;
    }
  }
  return true;
}

function execCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = cp.exec(
      command,
      {
        cwd,
        maxBuffer: 2 * 1024 * 1024,
        timeout: timeoutMs,
        env: { ...process.env, NODE_ENV: 'development' },
      },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        } else {
          resolve({
            stdout: truncate(stdout, 5000),
            stderr: truncate(stderr, 2000),
            exitCode: error ? error.code || 1 : 0,
          });
        }
      },
    );
  });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen) + '\n... (truncated)';
}

// ─── Tool Definitions ────────────────────────────────────────────────────

const runCommandDef: ToolDefinition = {
  name: 'run_command',
  description: 'Run a shell command in the workspace directory (sandboxed)',
  category: 'terminal',
  requiresApproval: true,
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'Shell command to execute',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in ms (default: 30000)',
      required: false,
    },
  ],
};

const runGitCommandDef: ToolDefinition = {
  name: 'run_git_command',
  description: 'Run a git command (destructive operations are blocked)',
  category: 'terminal',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'Git command (e.g., "status", "log --oneline -5")',
      required: true,
    },
  ],
};

const runNpmCommandDef: ToolDefinition = {
  name: 'run_npm_command',
  description: 'Run an npm command (e.g., install, test, run build)',
  category: 'terminal',
  requiresApproval: true,
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'NPM command (e.g., "test", "run build")',
      required: true,
    },
  ],
};

const getRunningProcessesDef: ToolDefinition = {
  name: 'get_running_processes',
  description: 'List running processes (top 20)',
  category: 'terminal',
  parameters: [],
};
