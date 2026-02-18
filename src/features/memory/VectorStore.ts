import * as fs from 'fs';
import * as path from 'path';

export interface VectorStoreEntry {
  id: string;
  embedding: number[];
  text: string;
  metadata: {
    type: 'code' | 'pattern' | 'fix' | 'preference';
    language?: string;
    file?: string;
    timestamp: number;
    author?: string;
  };
}

export class VectorStore {
  private entries: Map<string, VectorStoreEntry> = new Map();
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = path.join(storagePath, 'memory-vectors.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        const entries = JSON.parse(data);
        this.entries = new Map(Object.entries(entries));
      }
    } catch (error) {
      console.error('Failed to load vector store:', error);
      this.entries = new Map();
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const entries = Object.fromEntries(this.entries);
      fs.writeFileSync(this.storagePath, JSON.stringify(entries, null, 2));
    } catch (error) {
      console.error('Failed to save vector store:', error);
    }
  }

  addEntry(entry: VectorStoreEntry) {
    this.entries.set(entry.id, entry);
    this.save();
  }

  findSimilar(
    embedding: number[],
    threshold: number = 0.8,
    limit: number = 10,
  ): VectorStoreEntry[] {
    const similarities: { entry: VectorStoreEntry; similarity: number }[] = [];

    for (const entry of this.entries.values()) {
      const similarity = this.cosineSimilarity(embedding, entry.embedding);
      if (similarity > threshold) {
        similarities.push({ entry, similarity });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((s) => s.entry);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) { return 0; }
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) { return 0; }
    return dotProduct / (magnitudeA * magnitudeB);
  }

  findByType(type: string): VectorStoreEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.metadata.type === type,
    );
  }

  findByLanguage(language: string): VectorStoreEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.metadata.language === language,
    );
  }

  deleteEntry(id: string) {
    this.entries.delete(id);
    this.save();
  }

  clear() {
    this.entries.clear();
    this.save();
  }
}
