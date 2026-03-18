import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolResult } from '../types/agents';
import { ToolRegistry } from './ToolRegistry';
import { WorkspaceScanner } from '../workspace/WorkspaceScanner';
import { DependencyGraph } from '../workspace/DependencyGraph';
import { FrameworkDetector } from '../workspace/FrameworkDetector';
import { Logger } from '../utils/Logger';

const logger = new Logger('ProjectTools');

/**
 * Register project analysis tools.
 */
export function registerProjectTools(
  registry: ToolRegistry,
  workspaceRoot: string,
  scanner: WorkspaceScanner,
  depGraph: DependencyGraph,
  frameworkDetector: FrameworkDetector,
): void {
  registry.register(getProjectStructureDef, async (): Promise<ToolResult> => {
    try {
      const files = scanner.getFiles();
      const tree = scanner.getFileTree();
      const framework = frameworkDetector.detect(
        new Map(files.map((f) => [f.relativePath, f])),
      );

      return {
        success: true,
        data: {
          fileCount: files.length,
          framework: framework
            ? {
                name: framework.name,
                version: framework.version,
                type: framework.type,
              }
            : null,
          tree: tree ? formatTree(tree, 0, 3) : 'No tree available',
          languages: countLanguages(files),
        },
      };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  });

  registry.register(analyzeDependenciesDef, async (): Promise<ToolResult> => {
    try {
      const pkgPath = path.join(workspaceRoot, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { success: true, data: { message: 'No package.json found' } };
      }
      const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
      const deps = Object.entries(pkg.dependencies || {}).map(
        ([name, version]) => ({ name, version, type: 'production' }),
      );
      const devDeps = Object.entries(pkg.devDependencies || {}).map(
        ([name, version]) => ({ name, version, type: 'development' }),
      );

      const circularDeps = depGraph.getCircularDeps();
      const mostImported = depGraph.getMostImportedFiles(10);

      return {
        success: true,
        data: {
          dependencies: deps,
          devDependencies: devDeps,
          totalDeps: deps.length + devDeps.length,
          circularDependencies: circularDeps,
          mostImportedFiles: mostImported,
        },
      };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  });

  registry.register(getGitStatusDef, async (): Promise<ToolResult> => {
    try {
      const { execSync } = require('child_process');
      const status = execSync('git status --porcelain', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });
      const branch = execSync('git branch --show-current', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      const log = execSync('git log --oneline -10', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });

      const changes = status
        .split('\n')
        .filter(Boolean)
        .map((line: string) => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }));

      return {
        success: true,
        data: {
          branch,
          changes,
          changeCount: changes.length,
          recentCommits: log.split('\n').filter(Boolean).slice(0, 10),
        },
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: `Git not available: ${err.message}`,
      };
    }
  });

  registry.register(getOpenFilesDef, async (): Promise<ToolResult> => {
    const openDocs = vscode.workspace.textDocuments
      .filter((d) => d.uri.scheme === 'file')
      .map((d) => ({
        path: vscode.workspace.asRelativePath(d.uri),
        language: d.languageId,
        isDirty: d.isDirty,
        lineCount: d.lineCount,
      }));
    return { success: true, data: openDocs };
  });

  registry.register(getActiveFileDef, async (): Promise<ToolResult> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return { success: true, data: { message: 'No active editor' } };
    }
    const doc = editor.document;
    const selection = editor.selection;
    return {
      success: true,
      data: {
        path: vscode.workspace.asRelativePath(doc.uri),
        language: doc.languageId,
        lineCount: doc.lineCount,
        isDirty: doc.isDirty,
        hasSelection: !selection.isEmpty,
        selectedText: selection.isEmpty
          ? null
          : doc.getText(selection).substring(0, 2000),
        cursorLine: selection.active.line + 1,
      },
    };
  });
}

function formatTree(node: any, depth: number, maxDepth: number): string {
  if (depth >= maxDepth) {
    return '';
  }
  const indent = '  '.repeat(depth);
  let result = `${indent}${node.name}${node.type === 'directory' ? '/' : ''}\n`;
  if (node.children && depth < maxDepth) {
    for (const child of node.children.slice(0, 30)) {
      result += formatTree(child, depth + 1, maxDepth);
    }
    if (node.children.length > 30) {
      result += `${indent}  ... and ${node.children.length - 30} more\n`;
    }
  }
  return result;
}

function countLanguages(
  files: Array<{ language: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    counts[f.language] = (counts[f.language] || 0) + 1;
  }
  return counts;
}

// ─── Tool Definitions ────────────────────────────────────────────────────

const getProjectStructureDef: ToolDefinition = {
  name: 'get_project_structure',
  description:
    'Get project structure, framework, file counts, and language breakdown',
  category: 'project',
  parameters: [],
};

const analyzeDependenciesDef: ToolDefinition = {
  name: 'analyze_dependencies',
  description:
    'Analyze project dependencies, circular deps, and most-imported files',
  category: 'project',
  parameters: [],
};

const getGitStatusDef: ToolDefinition = {
  name: 'get_git_status',
  description: 'Get git branch, uncommitted changes, and recent commits',
  category: 'project',
  parameters: [],
};

const getOpenFilesDef: ToolDefinition = {
  name: 'get_open_files',
  description: 'List currently open files in VS Code',
  category: 'project',
  parameters: [],
};

const getActiveFileDef: ToolDefinition = {
  name: 'get_active_file',
  description: 'Get the currently active file, cursor position, and selection',
  category: 'project',
  parameters: [],
};
