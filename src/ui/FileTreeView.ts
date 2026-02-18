import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner } from '../workspace/WorkspaceScanner';
import { GitTracker } from '../workspace/GitTracker';

/**
 * VS Code TreeView provider that shows all project files in the sidebar
 * with git status indicators and the ability to open/highlight relevant files.
 */
export class FileTreeView implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private highlightedFiles: Set<string> = new Set();
  private gitChanges: Map<string, string> = new Map();

  constructor(
    private scanner: WorkspaceScanner,
    private git: GitTracker,
    private workspaceRoot: string
  ) {}

  refresh(): void {
    this.loadGitStatus();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Highlight files that are relevant to the current AI context.
   */
  setHighlightedFiles(files: string[]): void {
    this.highlightedFiles = new Set(files);
    this._onDidChangeTreeData.fire();
  }

  clearHighlights(): void {
    this.highlightedFiles.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!element) {
      // Root level: show top-level dirs and files
      return this.getDirectoryChildren(this.workspaceRoot);
    }

    if (element.isDirectory) {
      return this.getDirectoryChildren(element.fullPath);
    }

    return [];
  }

  private async getDirectoryChildren(dirPath: string): Promise<FileTreeItem[]> {
    const items: FileTreeItem[] = [];

    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a[1] !== b[1]) { return a[1] === vscode.FileType.Directory ? -1 : 1; }
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        if (WorkspaceScanner.isIgnoredDir(name) && type === vscode.FileType.Directory) { continue; }
        if (WorkspaceScanner.isIgnoredFile(name) && type === vscode.FileType.File) { continue; }

        const fullPath = path.join(dirPath, name);
        const relativePath = path.relative(this.workspaceRoot, fullPath);
        const isDir = type === vscode.FileType.Directory;
        const isHighlighted = this.highlightedFiles.has(relativePath);
        const gitStatus = this.gitChanges.get(relativePath);

        items.push(new FileTreeItem(
          name, fullPath, relativePath, isDir, isHighlighted, gitStatus
        ));
      }
    } catch { /* ignore */ }

    return items;
  }

  private async loadGitStatus(): Promise<void> {
    this.gitChanges.clear();
    try {
      const changes = await this.git.getUncommittedChanges();
      for (const change of changes) {
        this.gitChanges.set(change.file, change.status);
      }
    } catch { /* ignore */ }
  }
}

class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly fullPath: string,
    public readonly relativePath: string,
    public readonly isDirectory: boolean,
    public readonly isHighlighted: boolean,
    public readonly gitStatus?: string
  ) {
    super(
      name,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(fullPath)],
      };
      this.resourceUri = vscode.Uri.file(fullPath);
    }

    // Set icon based on state
    if (isHighlighted) {
      this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    }

    // Git status decoration
    if (gitStatus) {
      const statusLabels: Record<string, string> = {
        'modified': 'M', 'added': 'A', 'deleted': 'D',
        'renamed': 'R', 'untracked': 'U',
      };
      this.description = statusLabels[gitStatus] || '';
    }

    // Context value for menus
    this.contextValue = isDirectory ? 'directory' : 'file';

    // Tooltip
    this.tooltip = relativePath + (gitStatus ? ` (${gitStatus})` : '') + (isHighlighted ? ' [in context]' : '');
  }
}
