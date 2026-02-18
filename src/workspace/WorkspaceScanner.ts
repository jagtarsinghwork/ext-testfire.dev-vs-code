import * as vscode from 'vscode';
import * as path from 'path';
import { FileInfo, FileTreeNode } from '../types';
import { Logger } from '../utils/Logger';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.svelte-kit',
  'target',
  '.gradle',
  '.idea',
  '.vs',
  'bin',
  'obj',
  '.pytest_cache',
  '.mypy_cache',
  'vendor',
  '.bundle',
  'tmp',
  '.tmp',
]);

const IGNORED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.webm',
  '.zip',
  '.tar',
  '.gz',
  '.lock',
  '.min.js',
  '.min.css',
  '.map',
  '.pdf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.o',
  '.a',
  '.class',
  '.pyc',
  '.pyo',
  '.DS_Store',
  '.sqlite',
  '.db',
]);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.mts': 'typescript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.dart': 'dart',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sass': 'sass',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.r': 'r',
  '.R': 'r',
  '.lua': 'lua',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.dockerfile': 'dockerfile',
  '.proto': 'protobuf',
};

const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_FILES = 5000;

export class WorkspaceScanner {
  private files: Map<string, FileInfo> = new Map();
  private fileTree: FileTreeNode | null = null;
  private watcher: vscode.FileSystemWatcher | null = null;
  private scanning = false;
  private customIgnorePatterns: string[] = [];
  private logger: Logger;

  constructor(private workspaceRoot: string) {
    this.logger = new Logger('WorkspaceScanner');
  }

  /**
   * Full scan of the workspace. Builds the file index and file tree.
   */
  async scan(): Promise<void> {
    if (this.scanning) {
      return;
    }
    this.scanning = true;
    this.logger.info('Starting workspace scan...');

    try {
      this.files.clear();
      const count = { value: 0 };
      await this.scanDirectory(this.workspaceRoot, count);
      this.fileTree = await this.buildFileTree(this.workspaceRoot);
      this.logger.info(`Scan complete: ${count.value} files indexed`);
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Start watching for file changes and auto-update the index.
   */
  startWatching(): vscode.Disposable {
    const pattern = new vscode.RelativePattern(this.workspaceRoot, '**/*');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate((uri) => this.handleFileEvent(uri, 'create'));
    this.watcher.onDidChange((uri) => this.handleFileEvent(uri, 'change'));
    this.watcher.onDidDelete((uri) => this.handleFileDelete(uri));
    return this.watcher;
  }

  setIgnorePatterns(patterns: string[]): void {
    this.customIgnorePatterns = patterns;
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  getFilesMap(): Map<string, FileInfo> {
    return this.files;
  }

  getFile(relativePath: string): FileInfo | undefined {
    return this.files.get(relativePath);
  }

  getFileTree(): FileTreeNode | null {
    return this.fileTree;
  }

  getFileCount(): number {
    return this.files.size;
  }

  getFilesByLanguage(language: string): FileInfo[] {
    return this.getFiles().filter((f) => f.language === language);
  }

  searchFiles(query: string, maxResults = 20): FileInfo[] {
    const lower = query.toLowerCase();
    const results: FileInfo[] = [];
    for (const file of this.files.values()) {
      if (results.length >= maxResults) {
        break;
      }
      if (file.relativePath.toLowerCase().includes(lower)) {
        results.push(file);
      }
    }
    return results;
  }

  searchContent(
    query: string,
    maxResults = 20,
  ): Array<{ file: FileInfo; lines: string[] }> {
    const lower = query.toLowerCase();
    const results: Array<{ file: FileInfo; lines: string[] }> = [];
    for (const file of this.files.values()) {
      if (results.length >= maxResults) {
        break;
      }
      const fileLines = file.content.split('\n');
      const matchedLines: string[] = [];
      for (let i = 0; i < fileLines.length; i++) {
        if (fileLines[i].toLowerCase().includes(lower)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(fileLines.length, i + 2);
          matchedLines.push(
            fileLines
              .slice(start, end)
              .map((l, idx) => `${start + idx + 1}: ${l}`)
              .join('\n'),
          );
        }
      }
      if (matchedLines.length > 0) {
        results.push({ file, lines: matchedLines.slice(0, 5) });
      }
    }
    return results;
  }

  // ─── Static helpers ───────────────────────────────────────────────────────

  static detectLanguage(filename: string): string {
    const base = path.basename(filename).toLowerCase();
    if (base === 'dockerfile') {
      return 'dockerfile';
    }
    if (base === 'makefile') {
      return 'makefile';
    }
    const ext = path.extname(filename).toLowerCase();
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  static isIgnoredDir(name: string): boolean {
    return IGNORED_DIRS.has(name) || name.startsWith('.');
  }

  static isIgnoredFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return IGNORED_EXTENSIONS.has(ext);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async scanDirectory(
    dir: string,
    count: { value: number },
  ): Promise<void> {
    if (count.value >= MAX_FILES) {
      return;
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    } catch {
      return;
    }

    for (const [name, type] of entries) {
      if (count.value >= MAX_FILES) {
        return;
      }
      const fullPath = path.join(dir, name);

      if (type === vscode.FileType.Directory) {
        if (
          !WorkspaceScanner.isIgnoredDir(name) &&
          !this.isCustomIgnored(name)
        ) {
          await this.scanDirectory(fullPath, count);
        }
        continue;
      }

      if (type === vscode.FileType.File) {
        if (WorkspaceScanner.isIgnoredFile(name)) {
          continue;
        }
        await this.indexFile(fullPath);
        count.value++;
      }
    }
  }

  private async indexFile(fullPath: string): Promise<FileInfo | null> {
    try {
      const uri = vscode.Uri.file(fullPath);
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) {
        return null;
      }

      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString('utf-8');
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      const language = WorkspaceScanner.detectLanguage(path.basename(fullPath));

      const fileInfo: FileInfo = {
        path: fullPath,
        relativePath,
        content,
        language,
        lastModified: stat.mtime,
        size: stat.size,
        imports: this.extractImports(
          content,
          path.extname(fullPath).toLowerCase(),
        ),
        exports: this.extractExports(
          content,
          path.extname(fullPath).toLowerCase(),
        ),
      };

      this.files.set(relativePath, fileInfo);
      return fileInfo;
    } catch {
      return null;
    }
  }

  private async buildFileTree(dir: string): Promise<FileTreeNode> {
    const name = path.basename(dir);
    const node: FileTreeNode = {
      name,
      path: dir,
      type: 'directory',
      children: [],
    };

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    } catch {
      return node;
    }

    entries.sort((a, b) => {
      if (a[1] !== b[1]) {
        return a[1] === vscode.FileType.Directory ? -1 : 1;
      }
      return a[0].localeCompare(b[0]);
    });

    for (const [entryName, type] of entries) {
      if (type === vscode.FileType.Directory) {
        if (!WorkspaceScanner.isIgnoredDir(entryName)) {
          node.children!.push(
            await this.buildFileTree(path.join(dir, entryName)),
          );
        }
      } else if (!WorkspaceScanner.isIgnoredFile(entryName)) {
        node.children!.push({
          name: entryName,
          path: path.join(dir, entryName),
          type: 'file',
          language: WorkspaceScanner.detectLanguage(entryName),
        });
      }
    }
    return node;
  }

  extractImports(content: string, ext: string): string[] {
    const imports: string[] = [];
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(ext)) {
      const esRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
      let m;
      while ((m = esRegex.exec(content))) {
        imports.push(m[1]);
      }
      const reqRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
      while ((m = reqRegex.exec(content))) {
        imports.push(m[1]);
      }
    } else if (ext === '.py') {
      const pyRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
      let m;
      while ((m = pyRegex.exec(content))) {
        imports.push(m[1] || m[2]);
      }
    } else if (ext === '.go') {
      const goRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"(.+?)")/g;
      let m;
      while ((m = goRegex.exec(content))) {
        if (m[2]) {
          imports.push(m[2]);
        } else if (m[1]) {
          const lines = m[1].split('\n');
          for (const line of lines) {
            const pkg = line.match(/"(.+?)"/);
            if (pkg) {
              imports.push(pkg[1]);
            }
          }
        }
      }
    }
    return imports;
  }

  extractExports(content: string, ext: string): string[] {
    const exports: string[] = [];
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const regex =
        /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum|abstract\s+class)\s+(\w+)/g;
      let m;
      while ((m = regex.exec(content))) {
        exports.push(m[1]);
      }
    }
    return exports;
  }

  private isCustomIgnored(name: string): boolean {
    return this.customIgnorePatterns.some((p) => name.match(new RegExp(p)));
  }

  private async handleFileEvent(
    uri: vscode.Uri,
    _event: 'create' | 'change',
  ): Promise<void> {
    const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
    if (WorkspaceScanner.isIgnoredFile(path.basename(uri.fsPath))) {
      return;
    }
    for (const dir of IGNORED_DIRS) {
      if (relativePath.startsWith(dir + path.sep)) {
        return;
      }
    }
    await this.indexFile(uri.fsPath);
  }

  private handleFileDelete(uri: vscode.Uri): void {
    const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
    this.files.delete(relativePath);
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
