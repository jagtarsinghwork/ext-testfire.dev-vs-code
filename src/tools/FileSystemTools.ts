import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolResult } from '../types/agents';
import { ToolRegistry, ToolHandler } from './ToolRegistry';
import { Logger } from '../utils/Logger';

const logger = new Logger('FileSystemTools');

/**
 * Register all file system tools with the tool registry.
 */
export function registerFileSystemTools(
  registry: ToolRegistry,
  workspaceRoot: string,
): void {
  registry.register(readFileDef, async (params): Promise<ToolResult> => {
    const filePath = resolveFilePath(params.path as string, workspaceRoot);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return {
        success: true,
        data: { content, path: filePath, size: content.length },
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Cannot read file: ${err.message}`,
      };
    }
  });

  registry.register(writeFileDef, async (params): Promise<ToolResult> => {
    const filePath = resolveFilePath(params.path as string, workspaceRoot);
    const content = params.content as string;
    try {
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return {
        success: true,
        data: { path: filePath, bytesWritten: content.length },
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Cannot write file: ${err.message}`,
      };
    }
  });

  registry.register(listFilesDef, async (params): Promise<ToolResult> => {
    const dirPath = resolveFilePath(
      (params.directory as string) || '.',
      workspaceRoot,
    );
    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      const files = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, e.name),
      }));
      return { success: true, data: files };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Cannot list directory: ${err.message}`,
      };
    }
  });

  registry.register(searchFilesDef, async (params): Promise<ToolResult> => {
    const pattern = params.pattern as string;
    const maxResults = (params.maxResults as number) || 50;
    try {
      const uris = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**',
        maxResults,
      );
      const results = uris.map((uri) => ({
        path: vscode.workspace.asRelativePath(uri),
        fullPath: uri.fsPath,
      }));
      return { success: true, data: results };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Search failed: ${err.message}`,
      };
    }
  });

  registry.register(getFileInfoDef, async (params): Promise<ToolResult> => {
    const filePath = resolveFilePath(params.path as string, workspaceRoot);
    try {
      const stats = await fs.promises.stat(filePath);
      const info: Record<string, unknown> = {
        path: filePath,
        relativePath: path.relative(workspaceRoot, filePath),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        modified: stats.mtime.toISOString(),
        created: stats.birthtime.toISOString(),
      };
      if (!stats.isDirectory()) {
        info.extension = path.extname(filePath);
        info.language = getLanguageId(filePath);
      }
      return { success: true, data: info };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Cannot get file info: ${err.message}`,
      };
    }
  });

  registry.register(grepSearchDef, async (params): Promise<ToolResult> => {
    const pattern = params.pattern as string;
    const includeGlob = (params.includeGlob as string) || '**/*';
    const maxResults = (params.maxResults as number) || 100;
    try {
      const results: Array<{ file: string; line: number; text: string }> = [];
      const uris = await vscode.workspace.findFiles(
        includeGlob,
        '**/node_modules/**',
        200,
      );
      const regex = new RegExp(pattern, 'gi');

      for (const uri of uris) {
        if (results.length >= maxResults) {
          break;
        }
        try {
          const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: vscode.workspace.asRelativePath(uri),
                line: i + 1,
                text: lines[i].trim().substring(0, 200),
              });
              if (results.length >= maxResults) {
                break;
              }
            }
            regex.lastIndex = 0;
          }
        } catch {
          /* skip unreadable files */
        }
      }
      return { success: true, data: results };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Grep failed: ${err.message}`,
      };
    }
  });
}

function resolveFilePath(p: string, root: string): string {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.resolve(root, p);
}

function getLanguageId(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.sh': 'shellscript',
  };
  return map[ext] || 'plaintext';
}

// ─── Tool Definitions ────────────────────────────────────────────────────

const readFileDef: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file',
  category: 'filesystem',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Relative or absolute file path',
      required: true,
    },
  ],
};

const writeFileDef: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file (creates directories if needed)',
  category: 'filesystem',
  requiresApproval: true,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Relative or absolute file path',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write',
      required: true,
    },
  ],
};

const listFilesDef: ToolDefinition = {
  name: 'list_files',
  description: 'List files and directories in a path',
  category: 'filesystem',
  parameters: [
    {
      name: 'directory',
      type: 'string',
      description: 'Directory path (default: workspace root)',
      required: false,
    },
  ],
};

const searchFilesDef: ToolDefinition = {
  name: 'search_files',
  description: 'Search for files matching a glob pattern',
  category: 'filesystem',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Glob pattern (e.g., **/*.ts)',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum results (default: 50)',
      required: false,
    },
  ],
};

const getFileInfoDef: ToolDefinition = {
  name: 'get_file_info',
  description: 'Get file metadata (size, modified date, language)',
  category: 'filesystem',
  parameters: [
    { name: 'path', type: 'string', description: 'File path', required: true },
  ],
};

const grepSearchDef: ToolDefinition = {
  name: 'grep_search',
  description: 'Search for a regex pattern across workspace files',
  category: 'filesystem',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Regex pattern to search for',
      required: true,
    },
    {
      name: 'includeGlob',
      type: 'string',
      description: 'Glob pattern for files to search (default: **/*)',
      required: false,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum results (default: 100)',
      required: false,
    },
  ],
};
