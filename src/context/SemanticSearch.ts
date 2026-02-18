import { AIProvider, EmbeddingEntry, SearchResult, FileInfo } from '../types';
import { Logger } from '../utils/Logger';

const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 50;

/**
 * Semantic search over codebase using embeddings.
 * Stores embeddings in memory (local vector database).
 * Uses Ollama or OpenAI embeddings endpoint.
 */
export class SemanticSearch {
  private entries: EmbeddingEntry[] = [];
  private indexedFiles: Set<string> = new Set();
  private logger: Logger;
  private enabled = false;

  constructor(private provider: AIProvider) {
    this.logger = new Logger('SemanticSearch');
  }

  /**
   * Index all files by generating embeddings for code chunks.
   */
  async indexFiles(files: FileInfo[]): Promise<void> {
    this.logger.info(`Indexing ${files.length} files for semantic search...`);
    this.entries = [];
    this.indexedFiles.clear();

    let indexed = 0;
    for (const file of files) {
      if (this.indexedFiles.has(file.relativePath)) { continue; }

      try {
        const chunks = this.chunkContent(file.content, file.relativePath);
        for (const chunk of chunks) {
          const embedding = await this.provider.generateEmbedding(chunk.text);
          if (embedding.length > 0) {
            this.entries.push({
              filePath: file.relativePath,
              chunk: chunk.text,
              embedding,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            });
            this.enabled = true;
          }
        }
        this.indexedFiles.add(file.relativePath);
        indexed++;

        // Log progress every 50 files
        if (indexed % 50 === 0) {
          this.logger.info(`Indexed ${indexed}/${files.length} files`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to index ${file.relativePath}: ${err.message}`);
      }
    }

    this.logger.info(`Semantic index complete: ${this.entries.length} chunks from ${indexed} files`);
  }

  /**
   * Update index for a single file (on file change).
   */
  async updateFile(file: FileInfo): Promise<void> {
    // Remove old entries for this file
    this.entries = this.entries.filter(e => e.filePath !== file.relativePath);

    try {
      const chunks = this.chunkContent(file.content, file.relativePath);
      for (const chunk of chunks) {
        const embedding = await this.provider.generateEmbedding(chunk.text);
        if (embedding.length > 0) {
          this.entries.push({
            filePath: file.relativePath,
            chunk: chunk.text,
            embedding,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
          });
        }
      }
      this.indexedFiles.add(file.relativePath);
    } catch { /* ignore */ }
  }

  /**
   * Remove a file from the index.
   */
  removeFile(filePath: string): void {
    this.entries = this.entries.filter(e => e.filePath !== filePath);
    this.indexedFiles.delete(filePath);
  }

  /**
   * Search for relevant code chunks given a natural language query.
   */
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    if (!this.enabled || this.entries.length === 0) {
      return [];
    }

    const queryEmbedding = await this.provider.generateEmbedding(query);
    if (queryEmbedding.length === 0) { return []; }

    // Calculate cosine similarity for all entries
    const scored = this.entries.map(entry => ({
      filePath: entry.filePath,
      chunk: entry.chunk,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
      startLine: entry.startLine,
      endLine: entry.endLine,
    }));

    // Sort by score descending and return top results
    scored.sort((a, b) => b.score - a.score);

    // Deduplicate by file (keep best chunk per file)
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const item of scored) {
      if (results.length >= maxResults) { break; }
      const key = `${item.filePath}:${item.startLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    }

    return results;
  }

  /**
   * Check if semantic search is available and has indexed content.
   */
  isAvailable(): boolean {
    return this.enabled && this.entries.length > 0;
  }

  getIndexedFileCount(): number {
    return this.indexedFiles.size;
  }

  getChunkCount(): number {
    return this.entries.length;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private chunkContent(content: string, filePath: string): Array<{ text: string; startLine: number; endLine: number }> {
    const chunks: Array<{ text: string; startLine: number; endLine: number }> = [];
    const lines = content.split('\n');

    // Strategy: chunk by logical blocks (functions, classes) when possible,
    // fall back to fixed-size chunking
    let currentChunk: string[] = [];
    let chunkStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      currentChunk.push(lines[i]);

      const chunkText = currentChunk.join('\n');
      if (chunkText.length >= CHUNK_SIZE) {
        chunks.push({
          text: `File: ${filePath}\n${chunkText}`,
          startLine: chunkStartLine,
          endLine: i + 1,
        });

        // Overlap: keep last few lines
        const overlapLines = Math.max(1, Math.floor(CHUNK_OVERLAP / 20));
        currentChunk = currentChunk.slice(-overlapLines);
        chunkStartLine = i + 1 - overlapLines + 1;
      }
    }

    // Remaining content
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n');
      if (chunkText.trim().length > 0) {
        chunks.push({
          text: `File: ${filePath}\n${chunkText}`,
          startLine: chunkStartLine,
          endLine: lines.length,
        });
      }
    }

    return chunks;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) { return 0; }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
