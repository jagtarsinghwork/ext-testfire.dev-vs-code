import * as path from 'path';
import { DependencyGraph as DependencyGraphType, FileInfo } from '../types';
import { Logger } from '../utils/Logger';

export class DependencyGraph {
  private graph: Map<string, string[]> = new Map();
  private reverseGraph: Map<string, string[]> = new Map();
  private packageDeps: Record<string, unknown> = {};
  private circularDeps: string[][] = [];
  private logger: Logger;

  constructor(private workspaceRoot: string) {
    this.logger = new Logger('DependencyGraph');
  }

  /**
   * Build the full dependency graph from indexed files.
   */
  build(files: Map<string, FileInfo>): void {
    this.graph.clear();
    this.reverseGraph.clear();
    this.circularDeps = [];

    // Build forward graph
    for (const [filePath, fileInfo] of files) {
      const resolved: string[] = [];
      for (const imp of fileInfo.imports) {
        const target = this.resolveImport(imp, filePath, files);
        if (target) { resolved.push(target); }
      }
      this.graph.set(filePath, resolved);
    }

    // Build reverse graph
    for (const [file, deps] of this.graph) {
      for (const dep of deps) {
        if (!this.reverseGraph.has(dep)) { this.reverseGraph.set(dep, []); }
        this.reverseGraph.get(dep)!.push(file);
      }
    }

    // Parse package.json
    const pkgFile = files.get('package.json');
    if (pkgFile) {
      try { this.packageDeps = JSON.parse(pkgFile.content); }
      catch { /* ignore */ }
    }

    // Detect circular dependencies
    this.detectCircularDeps();
    if (this.circularDeps.length > 0) {
      this.logger.warn(`Found ${this.circularDeps.length} circular dependency chains`);
    }
  }

  /**
   * Get files that the given file imports.
   */
  getDependencies(filePath: string): string[] {
    return this.graph.get(filePath) || [];
  }

  /**
   * Get files that import the given file.
   */
  getDependents(filePath: string): string[] {
    return this.reverseGraph.get(filePath) || [];
  }

  /**
   * Get all related files (imports + importers) up to a given depth.
   */
  getRelatedFiles(filePath: string, depth = 2): string[] {
    const related = new Set<string>();
    const visited = new Set<string>();
    this.collectRelated(filePath, depth, related, visited);
    related.delete(filePath);
    return Array.from(related);
  }

  /**
   * Get all detected circular dependencies.
   */
  getCircularDeps(): string[][] {
    return this.circularDeps;
  }

  /**
   * Get the full graph data for serialization.
   */
  getData(): DependencyGraphType {
    return {
      nodes: this.graph,
      packageJson: this.packageDeps,
      circularDeps: this.circularDeps,
    };
  }

  /**
   * Get NPM/pip dependencies from package.json / requirements.txt.
   */
  getPackageDependencies(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
    const pkg = this.packageDeps as any;
    return {
      dependencies: pkg?.dependencies || {},
      devDependencies: pkg?.devDependencies || {},
    };
  }

  /**
   * Find files with the most dependents (most imported).
   */
  getMostImportedFiles(limit = 10): Array<{ file: string; count: number }> {
    const counts: Array<{ file: string; count: number }> = [];
    for (const [file, dependents] of this.reverseGraph) {
      counts.push({ file, count: dependents.length });
    }
    counts.sort((a, b) => b.count - a.count);
    return counts.slice(0, limit);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private resolveImport(importPath: string, fromFile: string, files: Map<string, FileInfo>): string | null {
    if (!importPath.startsWith('.')) { return null; } // Skip node_modules/external

    const dir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(dir, importPath));
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (files.has(candidate)) { return candidate; }
    }
    return null;
  }

  private collectRelated(filePath: string, depth: number, related: Set<string>, visited: Set<string>): void {
    if (depth <= 0 || visited.has(filePath)) { return; }
    visited.add(filePath);

    for (const dep of this.getDependencies(filePath)) {
      related.add(dep);
      this.collectRelated(dep, depth - 1, related, visited);
    }
    for (const dep of this.getDependents(filePath)) {
      related.add(dep);
      this.collectRelated(dep, depth - 1, related, visited);
    }
  }

  private detectCircularDeps(): void {
    const visited = new Set<string>();
    const stack = new Set<string>();

    for (const node of this.graph.keys()) {
      if (!visited.has(node)) {
        this.dfsCircular(node, visited, stack, []);
      }
    }
  }

  private dfsCircular(node: string, visited: Set<string>, stack: Set<string>, currentPath: string[]): void {
    visited.add(node);
    stack.add(node);
    currentPath.push(node);

    const deps = this.graph.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        this.dfsCircular(dep, visited, stack, [...currentPath]);
      } else if (stack.has(dep)) {
        // Found a cycle
        const cycleStart = currentPath.indexOf(dep);
        if (cycleStart !== -1) {
          const cycle = currentPath.slice(cycleStart);
          cycle.push(dep); // close the cycle
          // Avoid duplicate cycles
          const key = [...cycle].sort().join('|');
          if (!this.circularDeps.some(c => [...c].sort().join('|') === key)) {
            this.circularDeps.push(cycle);
          }
        }
      }
    }

    stack.delete(node);
  }
}
