import * as vscode from 'vscode';

export interface Embedding {
  vector: number[];
  text: string;
  metadata: any;
}

export class EmbeddingGenerator {
  private getOllamaUrl(): string {
    const config = vscode.workspace.getConfiguration('testfire');
    const baseUrl = config.get<string>('providerUrl', 'http://127.0.0.1:11434');
    return `${baseUrl}/api/embeddings`;
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('testfire');
    return config.get<string>('model', 'deepseek-coder:6.7b');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(this.getOllamaUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.getModel(), prompt: text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) { return this.generateFallbackEmbedding(text); }
      const data = (await res.json()) as { embedding?: number[] };
      if (data.embedding) {
        return data.embedding;
      }
      return this.generateFallbackEmbedding(text);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return this.generateFallbackEmbedding(text);
    }
  }

  async generateEmbeddingForCode(
    code: string,
    language: string,
  ): Promise<number[]> {
    const enhancedText = `Language: ${language}\nCode:\n${code}`;
    return this.generateEmbedding(enhancedText);
  }

  private generateFallbackEmbedding(text: string): number[] {
    // Deterministic hash-based embedding as fallback when Ollama is unavailable
    const dim = 384;
    const embedding = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      embedding[i % dim] += Math.sin(charCode * (i + 1));
      embedding[(i + 1) % dim] += Math.cos(charCode * (i + 1));
    }
    const magnitude = Math.sqrt(embedding.reduce((sum: number, v: number) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        embedding[i] /= magnitude;
      }
    }
    return embedding;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) { return 0; }
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) { return 0; }
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
