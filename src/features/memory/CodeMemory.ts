import * as vscode from 'vscode';
import * as path from 'path';
import { EmbeddingGenerator } from './EmbeddingGenerator';
import { VectorStore, VectorStoreEntry } from './VectorStore';
import * as fs from 'fs';

export class CodeMemory {
  private vectorStore: VectorStore;
  private embeddingGenerator: EmbeddingGenerator;
  private storagePath: string;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStorageUri.fsPath;
    this.vectorStore = new VectorStore(this.storagePath);
    this.embeddingGenerator = new EmbeddingGenerator();
  }

  async rememberCode(code: string, language: string, filePath: string) {
    const embedding = await this.embeddingGenerator.generateEmbeddingForCode(
      code,
      language,
    );

    const entry: VectorStoreEntry = {
      id: `code-${Date.now()}-${Math.random()}`,
      embedding,
      text: code,
      metadata: {
        type: 'code',
        language,
        file: filePath,
        timestamp: Date.now(),
      },
    };

    this.vectorStore.addEntry(entry);
  }

  async rememberPattern(
    pattern: string,
    language: string,
    description: string,
  ) {
    const embedding = await this.embeddingGenerator.generateEmbedding(pattern);

    const entry: VectorStoreEntry = {
      id: `pattern-${Date.now()}-${Math.random()}`,
      embedding,
      text: pattern,
      metadata: {
        type: 'pattern',
        language,
        timestamp: Date.now(),
      },
    };

    this.vectorStore.addEntry(entry);
  }

  async rememberFix(buggyCode: string, fixedCode: string, language: string) {
    const embedding = await this.embeddingGenerator.generateEmbedding(
      `Bug: ${buggyCode}\nFix: ${fixedCode}`,
    );

    const entry: VectorStoreEntry = {
      id: `fix-${Date.now()}-${Math.random()}`,
      embedding,
      text: fixedCode,
      metadata: {
        type: 'fix',
        language,
        timestamp: Date.now(),
      },
    };

    this.vectorStore.addEntry(entry);
  }

  async rememberPreference(key: string, value: any) {
    const embedding = await this.embeddingGenerator.generateEmbedding(
      `Preference: ${key}=${JSON.stringify(value)}`,
    );

    const entry: VectorStoreEntry = {
      id: `pref-${key}`,
      embedding,
      text: JSON.stringify(value),
      metadata: {
        type: 'preference',
        timestamp: Date.now(),
      },
    };

    this.vectorStore.addEntry(entry);
  }

  async findSimilarCode(
    code: string,
    language: string,
    threshold: number = 0.8,
  ): Promise<string[]> {
    const embedding = await this.embeddingGenerator.generateEmbeddingForCode(
      code,
      language,
    );
    const similar = this.vectorStore.findSimilar(embedding, threshold);

    return similar.filter((e) => e.metadata.type === 'code').map((e) => e.text);
  }

  async findSimilarPatterns(
    code: string,
    language: string,
    threshold: number = 0.7,
  ): Promise<string[]> {
    const embedding = await this.embeddingGenerator.generateEmbeddingForCode(
      code,
      language,
    );
    const similar = this.vectorStore.findSimilar(embedding, threshold);

    return similar
      .filter((e) => e.metadata.type === 'pattern')
      .map((e) => e.text);
  }

  async findSimilarFixes(error: string, language: string): Promise<string[]> {
    const embedding = await this.embeddingGenerator.generateEmbedding(error);
    const similar = this.vectorStore.findSimilar(embedding, 0.75);

    return similar.filter((e) => e.metadata.type === 'fix').map((e) => e.text);
  }

  getPreference(key: string): any {
    const entry = this.vectorStore['entries'].get(`pref-${key}`);
    return entry ? JSON.parse(entry.text) : null;
  }

  async learnFromFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const language = path.extname(filePath).slice(1);

      // Remember the whole file
      await this.rememberCode(content, language, filePath);

      // Extract and remember patterns
      const patterns = this.extractPatterns(content, language);
      for (const pattern of patterns) {
        await this.rememberPattern(pattern, language, 'Auto-learned pattern');
      }
    } catch (error) {
      console.error(`Failed to learn from ${filePath}:`, error);
    }
  }

  private extractPatterns(content: string, language: string): string[] {
    const patterns: string[] = [];

    if (
      language === 'js' ||
      language === 'ts' ||
      language === 'jsx' ||
      language === 'tsx'
    ) {
      // Extract function patterns
      const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*{[\s\S]*?}/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        patterns.push(match[0]);
      }

      // Extract arrow function patterns
      const arrowRegex = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*{[\s\S]*?}/g;
      while ((match = arrowRegex.exec(content)) !== null) {
        patterns.push(match[0]);
      }

      // Extract class patterns
      const classRegex = /class\s+(\w+)\s*{[\s\S]*?}/g;
      while ((match = classRegex.exec(content)) !== null) {
        patterns.push(match[0]);
      }
    }

    return patterns;
  }

  async generatePersonalizedPrompt(
    basePrompt: string,
    language: string,
  ): Promise<string> {
    // Find similar patterns in memory
    const similarPatterns = await this.findSimilarPatterns(
      basePrompt,
      language,
      0.6,
    );

    // Get preferences
    const indentSize = this.getPreference('indentSize') || 4;
    const quoteStyle = this.getPreference('quoteStyle') || 'single';

    let personalizedPrompt = basePrompt + '\n\n';

    if (similarPatterns.length > 0) {
      personalizedPrompt += 'Based on your previous code patterns:\n';
      personalizedPrompt += similarPatterns.slice(0, 3).join('\n\n') + '\n\n';
    }

    personalizedPrompt += `Follow your style preferences:
- Indentation: ${indentSize} spaces
- Quotes: ${quoteStyle}
- Use patterns similar to your existing code\n`;

    return personalizedPrompt;
  }
}
