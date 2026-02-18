import * as http from 'http';
import * as https from 'https';
import {
  AIProvider,
  AIProviderConfig,
  AIMessage,
  AIStreamCallback,
} from '../types';

// ─── Node built-in HTTP helpers (guaranteed to work in all VS Code versions) ──

function httpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(parsed, {
      method: opts.method || 'GET',
      headers: opts.headers,
      timeout: opts.timeout || 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) { req.write(opts.body); }
    req.end();
  });
}

function httpStream(
  url: string,
  opts: { headers?: Record<string, string>; body: string; timeout?: number },
  onChunk: (text: string) => void,
): Promise<void> & { abort: () => void } {
  let req: http.ClientRequest;
  const promise = new Promise<void>((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    req = mod.request(parsed, {
      method: 'POST',
      headers: opts.headers || { 'Content-Type': 'application/json' },
      timeout: opts.timeout || 120000,
    }, (res) => {
      res.on('data', (chunk: Buffer) => onChunk(chunk.toString()));
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(opts.body);
    req.end();
  }) as Promise<void> & { abort: () => void };
  promise.abort = () => { req?.destroy(); };
  return promise;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ─── Ollama Provider ──────────────────────────────────────────────────────────

export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama';
  private activeRequest: { abort: () => void } | null = null;

  constructor(readonly config: AIProviderConfig) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await httpRequest(`${this.config.baseUrl}/api/tags`, { timeout: 5000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await httpRequest(`${this.config.baseUrl}/api/tags`, { timeout: 5000 });
      if (res.status !== 200) { return []; }
      const data = JSON.parse(res.body);
      return (data.models || []).map((m: any) => m.name || m.model);
    } catch {
      return [];
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await httpRequest(`${this.config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ model: this.config.model, prompt: text }),
        timeout: 30000,
      });
      if (res.status !== 200) { return []; }
      const data = JSON.parse(res.body);
      return data.embedding || [];
    } catch {
      return [];
    }
  }

  async chat(messages: AIMessage[], callback?: AIStreamCallback): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversationMsgs = messages.filter((m) => m.role !== 'system');

    let prompt = '';
    if (systemMsg) { prompt += `System: ${systemMsg.content}\n\n`; }
    for (const msg of conversationMsgs) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      prompt += `${role}: ${msg.content}\n\n`;
    }
    prompt += 'Assistant: ';

    const body = JSON.stringify({
      model: this.config.model,
      prompt,
      stream: !!callback,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    });

    if (callback) {
      return this.streamChat(body, callback);
    }

    const res = await httpRequest(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body,
    });
    if (res.status !== 200) { throw new Error(`Ollama HTTP error: ${res.status}`); }
    return JSON.parse(res.body).response;
  }

  private async streamChat(body: string, callback: AIStreamCallback): Promise<string> {
    let fullResponse = '';
    let buffer = '';

    try {
      const stream = httpStream(
        `${this.config.baseUrl}/api/generate`,
        { headers: JSON_HEADERS, body },
        (chunk) => {
          buffer += chunk;
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
            } catch { /* skip */ }
          }
        },
      );

      this.activeRequest = stream;
      await stream;
      callback.onComplete(fullResponse);
      return fullResponse;
    } catch (error: any) {
      if (error.message === 'Request cancelled') {
        callback.onError(new Error('Request cancelled'));
        return fullResponse;
      }
      callback.onError(error);
      throw error;
    } finally {
      this.activeRequest = null;
    }
  }

  abort(): void {
    this.activeRequest?.abort();
    this.activeRequest = null;
  }
}

// ─── OpenAI-Compatible Provider ─────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI';
  private activeRequest: { abort: () => void } | null = null;

  constructor(readonly config: AIProviderConfig) {}

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await httpRequest(`${this.config.baseUrl}/models`, {
        headers: this.authHeaders,
        timeout: 5000,
      });
      if (res.status !== 200) { return []; }
      const data = JSON.parse(res.body);
      return (data.data || []).map((m: any) => m.id);
    } catch {
      return [];
    }
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await httpRequest(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
        timeout: 30000,
      });
      if (res.status !== 200) { return []; }
      const data = JSON.parse(res.body);
      return data.data[0].embedding || [];
    } catch {
      return [];
    }
  }

  async chat(messages: AIMessage[], callback?: AIStreamCallback): Promise<string> {
    const body = JSON.stringify({
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: !!callback,
    });

    if (callback) {
      return this.streamChat(body, callback);
    }

    const res = await httpRequest(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.authHeaders,
      body,
    });
    if (res.status !== 200) { throw new Error(`OpenAI HTTP error: ${res.status}`); }
    return JSON.parse(res.body).choices[0].message.content;
  }

  private async streamChat(body: string, callback: AIStreamCallback): Promise<string> {
    let fullResponse = '';
    let buffer = '';

    try {
      const stream = httpStream(
        `${this.config.baseUrl}/chat/completions`,
        { headers: this.authHeaders, body },
        (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) { continue; }
            const data = trimmed.slice(6);
            if (data === '[DONE]') { return; }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                callback.onToken(delta);
              }
            } catch { /* skip */ }
          }
        },
      );

      this.activeRequest = stream;
      await stream;
      callback.onComplete(fullResponse);
      return fullResponse;
    } catch (error: any) {
      if (error.message === 'Request cancelled') {
        callback.onError(new Error('Request cancelled'));
        return fullResponse;
      }
      callback.onError(error);
      throw error;
    } finally {
      this.activeRequest = null;
    }
  }

  abort(): void {
    this.activeRequest?.abort();
    this.activeRequest = null;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
    case 'anthropic':
      return new OpenAIProvider(config);
    default:
      return new OllamaProvider(config);
  }
}
