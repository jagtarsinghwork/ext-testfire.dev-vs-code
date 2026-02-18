import { AIProvider, AIProviderConfig, AIMessage, AIStreamCallback } from '../types';
import { Logger } from './Logger';

/**
 * Enhanced Ollama client with streaming, embeddings, model management, and token counting.
 */
export class OllamaClient implements AIProvider {
  readonly name = 'Ollama';
  private abortController: AbortController | null = null;
  private logger: Logger;

  constructor(readonly config: AIProviderConfig) {
    this.logger = new Logger('OllamaClient');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.config.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch { return false; }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!res.ok) { return []; }
      const data = (await res.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> };
      return (data.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  async pullModel(modelName: string, onProgress?: (status: string) => void): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });
      if (!res.ok || !res.body) { return false; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) { continue; }
          try {
            const parsed = JSON.parse(line);
            if (onProgress && parsed.status) { onProgress(parsed.status); }
          } catch { /* ignore */ }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async chat(messages: AIMessage[], callback?: AIStreamCallback): Promise<string> {
    this.abortController = new AbortController();

    let prompt = '';
    for (const msg of messages) {
      switch (msg.role) {
        case 'system': prompt += `System: ${msg.content}\n\n`; break;
        case 'user':   prompt += `User: ${msg.content}\n\n`; break;
        case 'assistant': prompt += `Assistant: ${msg.content}\n\n`; break;
      }
    }
    prompt += 'Assistant: ';

    const body = {
      model: this.config.model,
      prompt,
      stream: !!callback,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    if (callback) {
      return this.streamGenerate(body, callback);
    }

    const res = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });
    if (!res.ok) { throw new Error(`Ollama HTTP error: ${res.status}`); }
    const data = (await res.json()) as { response: string };
    return data.response;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.config.embeddingModel || 'nomic-embed-text';
      const res = await fetch(`${this.config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!res.ok) { return []; }
      const data = (await res.json()) as { embedding?: number[] };
      return data.embedding || [];
    } catch (err: any) {
      this.logger.warn(`Embedding generation failed: ${err.message}`);
      return [];
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private async streamGenerate(body: Record<string, unknown>, callback: AIStreamCallback): Promise<string> {
    let fullResponse = '';
    try {
      const res = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.abortController!.signal,
      });
      if (!res.ok) { throw new Error(`Ollama HTTP error: ${res.status}`); }
      if (!res.body) { throw new Error('No response body'); }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) { continue; }
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              fullResponse += parsed.response;
              callback.onToken(parsed.response);
            }
            if (parsed.done) {
              callback.onComplete(fullResponse);
              return fullResponse;
            }
          } catch { /* skip */ }
        }
      }

      callback.onComplete(fullResponse);
      return fullResponse;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        callback.onError(new Error('Request cancelled'));
        return fullResponse;
      }
      callback.onError(error);
      throw error;
    }
  }
}

/**
 * OpenAI-compatible provider (works with OpenAI, Anthropic, local OpenAI-compat servers).
 */
export class OpenAICompatibleClient implements AIProvider {
  readonly name: string;
  private abortController: AbortController | null = null;
  constructor(readonly config: AIProviderConfig) {
    this.name = config.type === 'anthropic' ? 'Anthropic' : 'OpenAI';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) { return []; }
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data || []).map(m => m.id);
    } catch {
      return [];
    }
  }

  async chat(messages: AIMessage[], callback?: AIStreamCallback): Promise<string> {
    this.abortController = new AbortController();

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (callback) {
      body.stream = true;
      return this.streamChat(body, callback);
    }

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });
    if (!res.ok) { throw new Error(`HTTP error: ${res.status}`); }
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });
      if (!res.ok) { return []; }
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data[0].embedding || [];
    } catch {
      return [];
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private async streamChat(body: Record<string, unknown>, callback: AIStreamCallback): Promise<string> {
    let fullResponse = '';
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: this.abortController!.signal,
      });
      if (!res.ok) { throw new Error(`HTTP error: ${res.status}`); }
      if (!res.body) { throw new Error('No response body'); }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) { continue; }
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            callback.onComplete(fullResponse);
            return fullResponse;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) { fullResponse += delta; callback.onToken(delta); }
          } catch { /* skip */ }
        }
      }

      callback.onComplete(fullResponse);
      return fullResponse;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        callback.onError(new Error('Cancelled'));
        return fullResponse;
      }
      callback.onError(error);
      throw error;
    }
  }
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'ollama': return new OllamaClient(config);
    case 'openai':
    case 'anthropic': return new OpenAICompatibleClient(config);
    default: return new OllamaClient(config);
  }
}
