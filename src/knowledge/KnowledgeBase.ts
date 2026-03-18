import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from '../types';
import {
  CodeChunk,
  KnowledgeSearchResult,
  ToolDefinition,
  ToolResult,
} from '../types/agents';
import { ToolRegistry } from '../tools/ToolRegistry';
import { Logger } from '../utils/Logger';

/**
 * Local code knowledge base using embeddings for semantic search.
 * Indexes project files into chunks and enables similarity search
 * for relevant code context (RAG).
 */
export class KnowledgeBase {
  private chunks: CodeChunk[] = [];
  private indexed = false;
  private indexing = false;
  private logger: Logger;

  constructor(
    private provider: AIProvider,
    private workspaceRoot: string,
  ) {
    this.logger = new Logger('KnowledgeBase');
  }

  get isIndexed(): boolean {
    return this.indexed;
  }
  get chunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Index the entire project for semantic search.
   */
  async indexProject(options?: {
    extensions?: string[];
    maxFileSize?: number;
  }): Promise<void> {
    if (this.indexing) {
      return;
    }
    this.indexing = true;
    const start = Date.now();

    const extensions = options?.extensions || [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.c',
      '.cpp',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.md',
    ];
    const maxFileSize = options?.maxFileSize || 100 * 1024; // 100KB

    try {
      this.chunks = [];
      const files = await this.collectFiles(
        this.workspaceRoot,
        extensions,
        maxFileSize,
      );
      this.logger.info(`Collected ${files.length} files for indexing`);

      let chunksCreated = 0;
      for (const file of files) {
        const fileChunks = this.chunkFile(
          file.path,
          file.content,
          file.language,
        );
        for (const chunk of fileChunks) {
          // Generate embedding
          try {
            const embedding = await this.provider.generateEmbedding(
              chunk.content,
            );
            if (embedding.length > 0) {
              chunk.embedding = embedding;
              this.chunks.push(chunk);
              chunksCreated++;
            }
          } catch {
            // Skip chunks that fail embedding
            this.chunks.push(chunk); // Store without embedding for keyword search fallback
            chunksCreated++;
          }
        }
      }

      this.indexed = true;
      this.logger.info(
        `Indexed ${chunksCreated} chunks from ${files.length} files in ${Date.now() - start}ms`,
      );
    } catch (err: any) {
      this.logger.error(`Indexing failed: ${err.message}`);
    } finally {
      this.indexing = false;
    }
  }

  /**
   * Search for code chunks semantically similar to the query.
   */
  async search(query: string, topK = 5): Promise<KnowledgeSearchResult[]> {
    if (this.chunks.length === 0) {
      return [];
    }

    // Try embedding-based search first
    try {
      const queryEmbedding = await this.provider.generateEmbedding(query);
      if (queryEmbedding.length > 0) {
        return this.embeddingSearch(queryEmbedding, topK);
      }
    } catch {
      this.logger.warn(
        'Embedding search failed, falling back to keyword search',
      );
    }

    // Fallback to keyword search
    return this.keywordSearch(query, topK);
  }

  /**
   * Get context around a specific file and line number.
   */
  getCodeContext(
    filePath: string,
    lineNumber: number,
    windowSize = 20,
  ): CodeChunk | null {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const matching = this.chunks.filter(
      (c) =>
        c.filePath === relativePath &&
        c.startLine <= lineNumber &&
        c.endLine >= lineNumber,
    );
    if (matching.length > 0) {
      return matching[0];
    }

    // Try reading the file directly
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workspaceRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, lineNumber - windowSize);
      const end = Math.min(lines.length, lineNumber + windowSize);
      return {
        filePath: relativePath,
        content: lines.slice(start, end).join('\n'),
        startLine: start + 1,
        endLine: end,
        language: getLanguage(filePath),
        symbols: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Register knowledge base tools with the tool registry.
   */
  registerTools(registry: ToolRegistry): void {
    registry.register(
      searchKnowledgeDef,
      async (params): Promise<ToolResult> => {
        const query = params.query as string;
        const topK = (params.topK as number) || 5;
        const results = await this.search(query, topK);
        return {
          success: true,
          data: results.map((r) => ({
            file: r.chunk.filePath,
            startLine: r.chunk.startLine,
            endLine: r.chunk.endLine,
            score: r.score,
            preview: r.chunk.content.substring(0, 300),
            symbols: r.chunk.symbols,
          })),
        };
      },
    );

    registry.register(getContextDef, async (params): Promise<ToolResult> => {
      const filePath = params.filePath as string;
      const line = params.line as number;
      const chunk = this.getCodeContext(filePath, line);
      if (!chunk) {
        return { success: false, data: null, error: 'No context found' };
      }
      return { success: true, data: chunk };
    });

    registry.register(indexStatusDef, async (): Promise<ToolResult> => {
      return {
        success: true,
        data: {
          indexed: this.indexed,
          chunkCount: this.chunks.length,
          indexing: this.indexing,
        },
      };
    });
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async collectFiles(
    dir: string,
    extensions: string[],
    maxSize: number,
    files: Array<{ path: string; content: string; language: string }> = [],
    depth = 0,
  ): Promise<Array<{ path: string; content: string; language: string }>> {
    if (depth > 10) {
      return files;
    }

    const skipDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      'out',
      '.next',
      '__pycache__',
      '.venv',
      'vendor',
    ]);

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.isDirectory()) {
          continue;
        }
        if (skipDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.collectFiles(
            fullPath,
            extensions,
            maxSize,
            files,
            depth + 1,
          );
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) {
            continue;
          }

          try {
            const stats = await fs.promises.stat(fullPath);
            if (stats.size > maxSize) {
              continue;
            }
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            files.push({
              path: path.relative(this.workspaceRoot, fullPath),
              content,
              language: getLanguage(fullPath),
            });
          } catch {
            /* skip unreadable files */
          }
        }
      }
    } catch {
      /* skip unreadable dirs */
    }

    return files;
  }

  private chunkFile(
    filePath: string,
    content: string,
    language: string,
  ): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    const chunkSize = 50; // lines per chunk
    const overlap = 10; // overlap lines

    for (let i = 0; i < lines.length; i += chunkSize - overlap) {
      const endLine = Math.min(i + chunkSize, lines.length);
      const chunkContent = lines.slice(i, endLine).join('\n');

      // Extract symbols from chunk
      const symbols = extractSymbols(chunkContent);

      chunks.push({
        filePath,
        content: chunkContent,
        startLine: i + 1,
        endLine,
        language,
        symbols,
      });

      if (endLine >= lines.length) {
        break;
      }
    }

    return chunks;
  }

  private embeddingSearch(
    queryEmbedding: number[],
    topK: number,
  ): KnowledgeSearchResult[] {
    const scored: KnowledgeSearchResult[] = [];

    for (const chunk of this.chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      scored.push({ chunk, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  private keywordSearch(query: string, topK: number): KnowledgeSearchResult[] {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const scored: KnowledgeSearchResult[] = [];

    for (const chunk of this.chunks) {
      const lower = chunk.content.toLowerCase();
      let matchCount = 0;
      for (const word of queryWords) {
        if (lower.includes(word)) {
          matchCount++;
        }
      }
      // Also check symbols
      for (const symbol of chunk.symbols) {
        if (queryWords.some((w) => symbol.toLowerCase().includes(w))) {
          matchCount += 2; // Boost symbol matches
        }
      }

      if (matchCount > 0) {
        scored.push({ chunk, score: matchCount / queryWords.length });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

// ─── Utility functions ────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function extractSymbols(code: string): string[] {
  const symbols: string[] = [];
  const patterns = [
    /(?:function|async\s+function)\s+(\w+)/g,
    /(?:class|interface|type|enum)\s+(\w+)/g,
    /(?:const|let|var)\s+(\w+)\s*=/g,
    /(?:export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum))\s+(\w+)/g,
    /def\s+(\w+)/g,
    /func\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1] && !symbols.includes(match[1])) {
        symbols.push(match[1]);
      }
    }
  }
  return symbols;
}

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
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
    '.md': 'markdown',
    '.json': 'json',
  };
  return map[ext] || 'plaintext';
}

// ─── Tool Definitions ────────────────────────────────────────────────────

const searchKnowledgeDef: ToolDefinition = {
  name: 'search_knowledge',
  description: 'Semantic search across the indexed project codebase',
  category: 'knowledge',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query',
      required: true,
    },
    {
      name: 'topK',
      type: 'number',
      description: 'Number of results (default: 5)',
      required: false,
    },
  ],
};

const getContextDef: ToolDefinition = {
  name: 'get_code_context',
  description: 'Get code context around a specific file and line number',
  category: 'knowledge',
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'File path',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number',
      required: true,
    },
  ],
};

const indexStatusDef: ToolDefinition = {
  name: 'knowledge_index_status',
  description: 'Get the status of the knowledge base index',
  category: 'knowledge',
  parameters: [],
};
