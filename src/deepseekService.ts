export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
}

export class DeepSeekService {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(
    apiKey: string,
    baseURL: string = 'https://api.deepseek.com',
    model: string = 'deepseek-coder',
  ) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async getCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    try {
      const res = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert coding assistant. Provide accurate, concise code completions.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: options.maxTokens || 100,
          temperature: options.temperature || 0.1,
          top_p: options.topP || 0.95,
          stop: options.stop || ['\n\n', '```'],
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`DeepSeek HTTP error: ${res.status}`);
      }

      const data = (await res.json()) as {
        choices?: { message: { content: string } }[];
      };

      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content.trim();
      }

      throw new Error('No completion generated');
    } catch (error) {
      console.error('DeepSeek API error:', error);
      throw error;
    }
  }

  async getStreamingCompletion(
    prompt: string,
    onChunk: (chunk: string) => void,
    options: CompletionOptions = {},
  ): Promise<void> {
    try {
      const res = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert coding assistant.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: options.maxTokens || 100,
          temperature: options.temperature || 0.1,
          top_p: options.topP || 0.95,
          stop: options.stop || ['\n\n', '```'],
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`DeepSeek HTTP error: ${res.status}`);
      }
      if (!res.body) {
        throw new Error('No response body');
      }

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
          if (data === '[DONE]') { continue; }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // Ignore parsing errors
          }
        }
      }
    } catch (error) {
      console.error('DeepSeek streaming error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}/v1/models`, {
        headers: this.headers,
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
