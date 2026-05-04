export interface EmbeddingProvider {
  readonly name: string;

  /** Dimensão dos vetores que esse provider gera. Imutável. */
  readonly dimensions: number;

  /** Gera embedding pra um único texto. */
  embed(text: string): Promise<number[]>;

  /**
   * Gera embeddings em batch. Implementações que suportam batch nativo
   * devem sobrescrever; o default na classe abstrata roda em série.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Health check rápido — usado em dashboard. */
  isAvailable(): Promise<boolean>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
