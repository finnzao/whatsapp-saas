import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { EmbeddingProvider } from './embedding-provider.interface';

interface OpenAiEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * Provider OpenAI-compatible. Funciona com:
 *   - api.openai.com (text-embedding-3-small / -3-large)
 *   - Voyage AI, Cohere, e qualquer endpoint OpenAI-compatible
 *
 * Não é usado por padrão. Pra ativar: AI_EMBEDDING_BACKEND=openai
 */
@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-embedding';
  readonly dimensions: number;

  private readonly logger = new Logger(OpenAiEmbeddingProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('OPENAI_EMBEDDING_BASE_URL', 'https://api.openai.com/v1');
    const apiKey = config.get<string>('OPENAI_EMBEDDING_API_KEY', '');
    this.model = config.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.dimensions = Number(config.get<string>('OPENAI_EMBEDDING_DIMENSIONS', '1536'));

    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    });
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { data } = await this.http.post<OpenAiEmbeddingResponse>('/embeddings', {
      model: this.model,
      input: texts,
      ...(this.shouldRequestDimensions() && { dimensions: this.dimensions }),
    });

    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((r) => r.embedding);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/models');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Modelos `text-embedding-3-*` aceitam parâmetro `dimensions` pra truncar.
   * Modelos legados (`text-embedding-ada-002`) não aceitam.
   */
  private shouldRequestDimensions(): boolean {
    return /text-embedding-3/.test(this.model);
  }
}
