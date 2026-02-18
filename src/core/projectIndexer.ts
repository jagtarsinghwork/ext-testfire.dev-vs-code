import * as vscode from 'vscode';
import * as path from 'path';
import {
  FileInfo,
  FileTreeNode,
  DependencyGraph,
  FrameworkInfo,
} from '../types';

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
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file for indexing
const MAX_FILES = 5000;

export class ProjectIndexer {
  private files: Map<string, FileInfo> = new Map();
  private fileTree: FileTreeNode | null = null;
  private dependencyGraph: DependencyGraph = {
    nodes: new Map(),
    circularDeps: [],
  };
  private framework: FrameworkInfo | null = null;
  private watcher: vscode.FileSystemWatcher | null = null;
  private indexing = false;

  constructor(private workspaceRoot: string) {}

  async index(): Promise<void> {
    if (this.indexing) {
      return;
    }
    this.indexing = true;

    try {
      this.files.clear();
      this.dependencyGraph = { nodes: new Map(), circularDeps: [] };

      await this.scanDirectory(this.workspaceRoot);
      this.buildDependencyGraph();
      this.framework = await this.detectFramework();
      this.fileTree = await this.buildFileTree(this.workspaceRoot);
    } finally {
      this.indexing = false;
    }
  }

  startWatching(): vscode.Disposable {
    const pattern = new vscode.RelativePattern(this.workspaceRoot, '**/*');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate((uri) => this.onFileChanged(uri, 'create'));
    this.watcher.onDidChange((uri) => this.onFileChanged(uri, 'change'));
    this.watcher.onDidDelete((uri) => this.onFileDeleted(uri));

    return this.watcher;
  }

  getFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  getFile(relativePath: string): FileInfo | undefined {
    return this.files.get(relativePath);
  }

  getFileTree(): FileTreeNode | null {
    return this.fileTree;
  }

  getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  getFramework(): FrameworkInfo | null {
    return this.framework;
  }

  getRelatedFiles(filePath: string, depth = 2): string[] {
    const related = new Set<string>();
    const visited = new Set<string>();
    this.collectRelated(filePath, depth, related, visited);
    related.delete(filePath);
    return Array.from(related);
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
  ): Array<{ file: FileInfo; matches: string[] }> {
    const results: Array<{ file: FileInfo; matches: string[] }> = [];
    const lower = query.toLowerCase();

    for (const file of this.files.values()) {
      if (results.length >= maxResults) {
        break;
      }

      const lines = file.content.split('\n');
      const matches: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lower)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          matches.push(
            lines
              .slice(start, end)
              .map((l, idx) => `${start + idx + 1}: ${l}`)
              .join('\n'),
          );
        }
      }

      if (matches.length > 0) {
        results.push({ file, matches: matches.slice(0, 5) });
      }
    }

    return results;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async scanDirectory(
    dir: string,
    count = { value: 0 },
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
        if (!IGNORED_DIRS.has(name) && !name.startsWith('.')) {
          await this.scanDirectory(fullPath, count);
        }
        continue;
      }

      if (type === vscode.FileType.File) {
        const ext = path.extname(name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) {
          continue;
        }

        try {
          const stat = await vscode.workspace.fs.stat(
            vscode.Uri.file(fullPath),
          );
          if (stat.size > MAX_FILE_SIZE) {
            continue;
          }

          const contentBytes = await vscode.workspace.fs.readFile(
            vscode.Uri.file(fullPath),
          );
          const content = Buffer.from(contentBytes).toString('utf-8');
          const relativePath = path.relative(this.workspaceRoot, fullPath);

          const fileInfo: FileInfo = {
            path: fullPath,
            relativePath,
            content,
            language: this.detectLanguage(name),
            lastModified: stat.mtime,
            size: stat.size,
            imports: this.extractImports(content, ext),
            exports: this.extractExports(content, ext),
          };

          this.files.set(relativePath, fileInfo);
          count.value++;
        } catch {
          // Skip files we can't read
        }
      }
    }
  }

  private buildDependencyGraph(): void {
    for (const [filePath, fileInfo] of this.files) {
      const deps: string[] = [];

      for (const imp of fileInfo.imports) {
        const resolved = this.resolveImport(imp, filePath);
        if (resolved) {
          deps.push(resolved);
        }
      }

      this.dependencyGraph.nodes.set(filePath, deps);
    }

    // Load package.json if exists
    const pkgJson = this.files.get('package.json');
    if (pkgJson) {
      try {
        this.dependencyGraph.packageJson = JSON.parse(pkgJson.content);
      } catch {
        /* ignore */
      }
    }
  }

  private resolveImport(importPath: string, fromFile: string): string | null {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.normalize(path.join(dir, importPath));

      // Try exact match, then common extensions
      const extensions = [
        '',
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.json',
        '/index.ts',
        '/index.js',
      ];
      for (const ext of extensions) {
        const candidate = resolved + ext;
        if (this.files.has(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private collectRelated(
    filePath: string,
    depth: number,
    related: Set<string>,
    visited: Set<string>,
  ): void {
    if (depth <= 0 || visited.has(filePath)) {
      return;
    }
    visited.add(filePath);

    // Forward dependencies (files this file imports)
    const deps = this.dependencyGraph.nodes.get(filePath) || [];
    for (const dep of deps) {
      related.add(dep);
      this.collectRelated(dep, depth - 1, related, visited);
    }

    // Reverse dependencies (files that import this file)
    for (const [file, fileDeps] of this.dependencyGraph.nodes) {
      if (fileDeps.includes(filePath)) {
        related.add(file);
        this.collectRelated(file, depth - 1, related, visited);
      }
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
        if (!IGNORED_DIRS.has(entryName) && !entryName.startsWith('.')) {
          const child = await this.buildFileTree(path.join(dir, entryName));
          node.children!.push(child);
        }
      } else {
        const ext = path.extname(entryName).toLowerCase();
        if (!IGNORED_EXTENSIONS.has(ext)) {
          node.children!.push({
            name: entryName,
            path: path.join(dir, entryName),
            type: 'file',
            language: this.detectLanguage(entryName),
          });
        }
      }
    }

    return node;
  }

  private async detectFramework(): Promise<FrameworkInfo | null> {
    const pkgJson = this.files.get('package.json');
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson.content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (allDeps['next']) {
          return {
            name: 'Next.js',
            version: allDeps['next'],
            type: 'fullstack',
            buildTool: 'next',
            testFramework: this.detectTestFramework(allDeps),
          };
        }
        if (allDeps['react']) {
          return {
            name: 'React',
            version: allDeps['react'],
            type: 'frontend',
            buildTool: allDeps['vite'] ? 'vite' : 'webpack',
            testFramework: this.detectTestFramework(allDeps),
          };
        }
        if (allDeps['vue']) {
          return {
            name: 'Vue',
            version: allDeps['vue'],
            type: 'frontend',
            buildTool: allDeps['vite'] ? 'vite' : 'webpack',
            testFramework: this.detectTestFramework(allDeps),
          };
        }
        if (allDeps['@angular/core']) {
          return {
            name: 'Angular',
            version: allDeps['@angular/core'],
            type: 'frontend',
            buildTool: 'angular-cli',
            testFramework: 'karma',
          };
        }
        if (allDeps['express']) {
          return {
            name: 'Express',
            version: allDeps['express'],
            type: 'backend',
            testFramework: this.detectTestFramework(allDeps),
          };
        }
        if (allDeps['fastify']) {
          return {
            name: 'Fastify',
            version: allDeps['fastify'],
            type: 'backend',
            testFramework: this.detectTestFramework(allDeps),
          };
        }
      } catch {
        /* ignore */
      }
    }

    // Python
    if (
      this.files.has('requirements.txt') ||
      this.files.has('pyproject.toml')
    ) {
      const req = this.files.get('requirements.txt')?.content || '';
      if (req.includes('django')) {
        return {
          name: 'Django',
          version: '',
          type: 'backend',
          testFramework: 'pytest',
        };
      }
      if (req.includes('flask')) {
        return {
          name: 'Flask',
          version: '',
          type: 'backend',
          testFramework: 'pytest',
        };
      }
      if (req.includes('fastapi')) {
        return {
          name: 'FastAPI',
          version: '',
          type: 'backend',
          testFramework: 'pytest',
        };
      }
    }

    return null;
  }

  private detectTestFramework(
    deps: Record<string, string>,
  ): string | undefined {
    if (deps['jest']) {
      return 'jest';
    }
    if (deps['vitest']) {
      return 'vitest';
    }
    if (deps['mocha']) {
      return 'mocha';
    }
    if (deps['@playwright/test']) {
      return 'playwright';
    }
    if (deps['cypress']) {
      return 'cypress';
    }
    return undefined;
  }

  private detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
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
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.sql': 'sql',
      '.sh': 'shellscript',
      '.bash': 'shellscript',
      '.toml': 'toml',
      '.xml': 'xml',
      '.graphql': 'graphql',
      '.vue': 'vue',
      '.svelte': 'svelte',
    };
    return map[ext] || 'plaintext';
  }

  private extractImports(content: string, ext: string): string[] {
    const imports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(ext)) {
      // ES imports
      const esRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
      let match;
      while ((match = esRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // require
      const reqRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
      while ((match = reqRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (ext === '.py') {
      const pyRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
      let match;
      while ((match = pyRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2]);
      }
    }

    return imports;
  }

  private extractExports(content: string, ext: string): string[] {
    const exports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const regex =
        /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  private async onFileChanged(
    uri: vscode.Uri,
    _type: 'create' | 'change',
  ): Promise<void> {
    const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
    const ext = path.extname(uri.fsPath).toLowerCase();

    if (IGNORED_EXTENSIONS.has(ext)) {
      return;
    }
    for (const dir of IGNORED_DIRS) {
      if (relativePath.startsWith(dir + path.sep)) {
        return;
      }
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) {
        return;
      }

      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString('utf-8');

      const fileInfo: FileInfo = {
        path: uri.fsPath,
        relativePath,
        content,
        language: this.detectLanguage(path.basename(uri.fsPath)),
        lastModified: stat.mtime,
        size: stat.size,
        imports: this.extractImports(content, ext),
        exports: this.extractExports(content, ext),
      };

      this.files.set(relativePath, fileInfo);
    } catch {
      /* ignore */
    }
  }

  private onFileDeleted(uri: vscode.Uri): void {
    const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
    this.files.delete(relativePath);
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
