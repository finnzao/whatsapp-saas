import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { EmbeddingProvider } from './embedding-provider.interface';
import { CircuitBreaker } from '../../../common/utils/circuit-breaker';

interface OllamaEmbedResponse {
  embeddings: number[][];
}

interface OllamaLegacyEmbedResponse {
  embedding: number[];
}

@Injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama-embedding';
  readonly dimensions: number;

  private readonly logger = new Logger(OllamaEmbeddingProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly breaker: CircuitBreaker;

  // Cache leve em memória pra queries repetidas dentro de um burst.
  // Uma TTL curta basta — não queremos perder atualizações de produtos
  // que são embedados em jobs separados.
  private readonly cache = new Map<string, { vector: number[]; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = config.get<string>('OLLAMA_EMBEDDING_MODEL', 'bge-m3');
    this.dimensions = Number(config.get<string>('OLLAMA_EMBEDDING_DIMENSIONS', '1024'));

    const timeoutMs = Number(config.get<string>('OLLAMA_EMBEDDING_TIMEOUT_MS', '30000'));
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });

    this.breaker = new CircuitBreaker('ollama-embedding', {
      failureThreshold: Number(config.get<string>('OLLAMA_EMBEDDING_BREAKER_THRESHOLD', '3')),
      openMs: Number(config.get<string>('OLLAMA_EMBEDDING_BREAKER_OPEN_MS', '20000')),
    });
  }

  async embed(text: string): Promise<number[]> {
    const cleaned = text.trim();
    if (!cleaned) {
      throw new Error('Cannot embed empty text');
    }

    const cached = this.getFromCache(cleaned);
    if (cached) return cached;

    const [vector] = await this.embedBatch([cleaned]);
    this.setCache(cleaned, vector);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    if (!this.breaker.canAttempt()) {
      throw new Error(`[ollama-embedding] circuit open, refusing call`);
    }

    try {
      const result = await this.callBatchEndpoint(texts);
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      if (this.isConnectivityError(err)) {
        this.breaker.recordFailure();
      }

      // Fallback: alguns Ollama antigos só têm /api/embeddings (singular).
      if (this.isEndpointMissing(err)) {
        this.logger.warn(`[ollama-embedding] /api/embed indisponível, caindo pro /api/embeddings`);
        return this.fallbackSequential(texts);
      }
      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.breaker.canAttempt()) return false;
    try {
      const { data } = await this.http.get('/api/tags');
      const models = (data.models ?? []) as Array<{ name: string }>;
      const baseName = this.model.split(':')[0];
      return models.some((m) => m.name.startsWith(baseName));
    } catch {
      this.breaker.recordFailure();
      return false;
    }
  }

  private async callBatchEndpoint(texts: string[]): Promise<number[][]> {
    const { data } = await this.http.post<OllamaEmbedResponse>('/api/embed', {
      model: this.model,
      input: texts,
    });

    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new Error(
        `[ollama-embedding] resposta inválida: esperava ${texts.length} embeddings, recebeu ${
          data.embeddings?.length ?? 0
        }`,
      );
    }

    for (const e of data.embeddings) {
      if (e.length !== this.dimensions) {
        throw new Error(
          `[ollama-embedding] dimensão inesperada: ${e.length} (esperava ${this.dimensions}). Confira OLLAMA_EMBEDDING_MODEL e OLLAMA_EMBEDDING_DIMENSIONS.`,
        );
      }
    }
    return data.embeddings;
  }

  private async fallbackSequential(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      const { data } = await this.http.post<OllamaLegacyEmbedResponse>('/api/embeddings', {
        model: this.model,
        prompt: text,
      });
      if (!data.embedding || data.embedding.length !== this.dimensions) {
        throw new Error(
          `[ollama-embedding] /api/embeddings retornou dimensão errada: ${data.embedding?.length ?? 0}`,
        );
      }
      out.push(data.embedding);
    }
    return out;
  }

  private isConnectivityError(err: unknown): boolean {
    if (!axios.isAxiosError(err)) return false;
    const code = err.code;
    return (
      code === 'ECONNREFUSED' ||
      code === 'ECONNABORTED' ||
      code === 'ENOTFOUND' ||
      code === 'EHOSTUNREACH' ||
      code === 'ETIMEDOUT' ||
      err.response === undefined
    );
  }

  private isEndpointMissing(err: unknown): boolean {
    return axios.isAxiosError(err) && err.response?.status === 404;
  }

  private getFromCache(text: string): number[] | null {
    const e = this.cache.get(text);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.cache.delete(text);
      return null;
    }
    return e.vector;
  }

  private setCache(text: string, vector: number[]) {
    if (this.cache.size > 500) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(text, { vector, expiresAt: Date.now() + this.cacheTtlMs });
  }
}
