import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { Prisma, Product } from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from './embedding-provider.interface';
import { JOB_NAMES, QUEUE_NAMES } from '../../../queue/queue.constants';

type ProductForEmbedding = Pick<
  Product,
  'id' | 'tenantId' | 'name' | 'description' | 'sku' | 'customFields' | 'condition' | 'warranty'
> & {
  category: { name: string } | null;
};

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.EMBEDDINGS) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------
  // Texto canônico de um produto pra embedding.
  // Deve ser estável: mesmo produto sempre gera o mesmo texto
  // (a menos que mude algo significativo). Por isso hash dele
  // serve como detector de staleness — só re-embedda se mudou.
  // -----------------------------------------------------------
  buildProductText(product: ProductForEmbedding): string {
    const parts: string[] = [];

    parts.push(product.name);
    if (product.category?.name) parts.push(`Categoria: ${product.category.name}`);
    if (product.description) parts.push(product.description);
    if (product.sku) parts.push(`SKU: ${product.sku}`);
    if (product.warranty) parts.push(`Garantia: ${product.warranty}`);
    if (product.condition && product.condition !== 'NEW') {
      parts.push(`Condição: ${this.translateCondition(product.condition)}`);
    }

    const cf = product.customFields as Record<string, unknown> | null;
    if (cf && typeof cf === 'object') {
      for (const [key, value] of Object.entries(cf)) {
        if (value === null || value === undefined || value === '') continue;
        const valueStr = Array.isArray(value)
          ? value.map(String).join(', ')
          : this.cleanFieldValue(String(value));
        parts.push(`${key}: ${valueStr}`);
      }
    }

    return parts.join('. ').slice(0, 4000);
  }

  hashSourceText(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
  }

  /**
   * Embedda um produto e persiste. Idempotente: se hash bate, skip.
   * Chamado pelo worker.
   */
  async embedProduct(productId: string): Promise<{
    embedded: boolean;
    skipped?: 'hash_match' | 'product_not_found' | 'empty_text';
    durationMs: number;
  }> {
    const start = Date.now();

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { name: true } } },
    });

    if (!product) {
      return { embedded: false, skipped: 'product_not_found', durationMs: Date.now() - start };
    }

    const text = this.buildProductText(product);
    if (!text.trim()) {
      return { embedded: false, skipped: 'empty_text', durationMs: Date.now() - start };
    }

    const hash = this.hashSourceText(text);
    if (product.embeddingSourceHash === hash) {
      return { embedded: false, skipped: 'hash_match', durationMs: Date.now() - start };
    }

    const vector = await this.provider.embed(text);

    await this.prisma.$executeRaw`
      UPDATE "products"
      SET "embedding" = ${this.toVectorLiteral(vector)}::vector,
          "embeddingUpdatedAt" = NOW(),
          "embeddingSourceHash" = ${hash}
      WHERE "id" = ${productId}
    `;

    this.logger.debug(
      `[embedding] product=${productId} (${product.name.slice(0, 40)}) embedded in ${Date.now() - start}ms`,
    );
    return { embedded: true, durationMs: Date.now() - start };
  }

  /**
   * Embedda uma query do cliente. Sem cache de DB — só o cache em memória
   * do provider. Queries variam muito.
   */
  async embedQuery(query: string): Promise<number[]> {
    return this.provider.embed(query);
  }

  /**
   * Enfileira embedding pra um produto. Chamado por hooks de create/update.
   */
  async enqueueProductEmbedding(productId: string, opts?: { priority?: number }): Promise<void> {
    await this.queue.add(
      JOB_NAMES.EMBED_PRODUCT,
      { productId },
      {
        jobId: `embed-product-${productId}`,
        priority: opts?.priority ?? 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200, age: 86_400 },
      },
    );
  }

  /**
   * Enfileira backfill de TODOS os produtos sem embedding (ou stale).
   * Não dispara duplicatas — usa jobId fixo por produto.
   */
  async backfillTenant(tenantId: string): Promise<{ enqueued: number }> {
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "products"
      WHERE "tenantId" = ${tenantId} AND "embedding" IS NULL
      ORDER BY "updatedAt" DESC
    `;

    for (const { id } of ids) {
      await this.enqueueProductEmbedding(id, { priority: 10 });
    }
    this.logger.log(`[embedding] backfill tenant=${tenantId} enfileirou=${ids.length} produtos`);
    return { enqueued: ids.length };
  }

  /**
   * Busca produtos por similaridade vetorial.
   * Retorna {id, distance} — pra fazer fusion com o lexical.
   */
  async vectorSearch(
    tenantId: string,
    queryVector: number[],
    opts: { limit?: number; minDistance?: number } = {},
  ): Promise<Array<{ id: string; distance: number }>> {
    const limit = opts.limit ?? 30;
    const literal = this.toVectorLiteral(queryVector);

    // <=> é cosine distance (menor = mais parecido). Range: 0 (idêntico) a 2 (oposto).
    // Filtramos active+!paused dentro da query pra tirar lixo cedo.
    const rows = await this.prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT "id", ("embedding" <=> ${literal}::vector) AS distance
      FROM "products"
      WHERE "tenantId" = ${tenantId}
        AND "active" = true
        AND "paused" = false
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${limit}
    `;

    return rows
      .filter((r) => opts.minDistance === undefined || r.distance <= opts.minDistance)
      .map((r) => ({ id: r.id, distance: Number(r.distance) }));
  }

  // -----------------------------------------------------------
  // Health & introspection
  // -----------------------------------------------------------

  async getStats(tenantId: string) {
    const [total, withEmbedding] = await Promise.all([
      this.prisma.product.count({ where: { tenantId, active: true, paused: false } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "products"
        WHERE "tenantId" = ${tenantId}
          AND "active" = true
          AND "paused" = false
          AND "embedding" IS NOT NULL
      `.then((r) => Number(r[0]?.count ?? 0)),
    ]);

    return {
      total,
      withEmbedding,
      coverage: total > 0 ? withEmbedding / total : 1,
      providerName: this.provider.name,
      dimensions: this.provider.dimensions,
    };
  }

  async isProviderAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  // -----------------------------------------------------------
  // Helpers internos
  // -----------------------------------------------------------

  /**
   * Converte array de número pra literal pgvector: '[0.1,0.2,0.3]'.
   * Validação: NaN/Infinity quebra o pgvector — sanitiza.
   */
  private toVectorLiteral(vector: number[]): string {
    const sanitized = vector.map((n) => (Number.isFinite(n) ? n : 0));
    return `[${sanitized.join(',')}]`;
  }

  /**
   * Limpa hex colors (#FF8000) do texto pra IA — substitui pelo nome
   * da cor quando possível, senão remove. Hex polui o embedding.
   */
  private cleanFieldValue(value: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return '';
    return value;
  }

  private translateCondition(condition: string): string {
    const map: Record<string, string> = {
      NEW: 'novo',
      SEMINEW: 'seminovo',
      USED: 'usado',
      SHOWCASE: 'mostruário',
      REFURBISHED: 'recondicionado',
    };
    return map[condition] ?? condition.toLowerCase();
  }
}
