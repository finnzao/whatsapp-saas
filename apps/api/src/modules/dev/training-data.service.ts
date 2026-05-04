import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface TripletExportOptions {
  minQueryCount?: number;       // ignora queries que aparecem só 1-2 vezes (ruído)
  positiveOutcomes?: string[];   // que outcomes contam como "positivo"
  daysBack?: number;             // janela de tempo
  maxNegativesPerAnchor?: number;
}

export interface Triplet {
  anchor: string;     // query do cliente
  positive: string;   // texto do produto que foi escolhido
  negative: string;   // texto de produto que foi mostrado mas ignorado
}

export interface QueryProductPair {
  query: string;
  productId: string;
  productText: string;
  outcome: string;
}

@Injectable()
export class TrainingDataService {
  private readonly logger = new Logger(TrainingDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exporta dataset em formato `triplets` — o padrão do
   * sentence-transformers MultipleNegativesRankingLoss.
   *
   * Pra cada query com sinal positivo (compra, add_to_cart, asked_more):
   *   - anchor = query
   *   - positive = produto escolhido
   *   - negative = um dos produtos mostrados mas não escolhidos
   *
   * Esse formato treina diretamente o embedder pra colocar a query
   * mais perto de produtos que convertem do que produtos que não convertem.
   */
  async exportTriplets(
    tenantId: string,
    opts: TripletExportOptions = {},
  ): Promise<Triplet[]> {
    const {
      positiveOutcomes = ['purchased', 'added_to_cart', 'asked_more'],
      daysBack = 180,
      maxNegativesPerAnchor = 3,
    } = opts;

    const interactions = await this.prisma.$queryRaw<
      Array<{
        id: string;
        query: string;
        resultsShown: any;
        selectedProductId: string | null;
        outcome: string | null;
      }>
    >`
      SELECT "id", "query", "resultsShown", "selectedProductId", "outcome"
      FROM "search_interactions"
      WHERE "tenantId" = ${tenantId}
        AND "outcome" = ANY(${positiveOutcomes})
        AND "selectedProductId" IS NOT NULL
        AND "createdAt" > NOW() - (${daysBack} || ' days')::interval
    `;

    if (interactions.length === 0) return [];

    const productIds = new Set<string>();
    for (const r of interactions) {
      if (r.selectedProductId) productIds.add(r.selectedProductId);
      const shown = (r.resultsShown ?? []) as Array<{ productId: string }>;
      for (const s of shown) productIds.add(s.productId);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: Array.from(productIds) } },
      include: { category: { select: { name: true } } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const triplets: Triplet[] = [];
    for (const r of interactions) {
      if (!r.selectedProductId) continue;
      const positive = productById.get(r.selectedProductId);
      if (!positive) continue;

      const positiveText = this.buildProductText(positive);
      const shown = (r.resultsShown ?? []) as Array<{ productId: string }>;
      const negativeIds = shown
        .map((s) => s.productId)
        .filter((id) => id !== r.selectedProductId)
        .slice(0, maxNegativesPerAnchor);

      for (const negId of negativeIds) {
        const negative = productById.get(negId);
        if (!negative) continue;
        triplets.push({
          anchor: r.query,
          positive: positiveText,
          negative: this.buildProductText(negative),
        });
      }
    }

    return triplets;
  }

  /**
   * Exporta pares (query, produto_comprado) — formato mais simples,
   * usado pra MultipleNegativesRankingLoss SEM negativos explícitos
   * (o loss usa as outras instâncias do batch como negative).
   */
  async exportPairs(tenantId: string, opts: TripletExportOptions = {}): Promise<QueryProductPair[]> {
    const { positiveOutcomes = ['purchased', 'added_to_cart'], daysBack = 180 } = opts;

    const rows = await this.prisma.$queryRaw<
      Array<{
        query: string;
        productId: string;
        outcome: string;
      }>
    >`
      SELECT "query", "selectedProductId" AS "productId", "outcome"
      FROM "search_interactions"
      WHERE "tenantId" = ${tenantId}
        AND "outcome" = ANY(${positiveOutcomes})
        AND "selectedProductId" IS NOT NULL
        AND "createdAt" > NOW() - (${daysBack} || ' days')::interval
    `;

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      include: { category: { select: { name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows
      .map((r) => {
        const product = byId.get(r.productId);
        if (!product) return null;
        return {
          query: r.query,
          productId: r.productId,
          productText: this.buildProductText(product),
          outcome: r.outcome,
        };
      })
      .filter((x): x is QueryProductPair => x !== null);
  }

  async getStats(tenantId: string): Promise<{
    totalInteractions: number;
    withPositiveOutcome: number;
    uniqueQueries: number;
    coverageEstimate: 'low' | 'medium' | 'high';
  }> {
    const [total, positive, unique] = await Promise.all([
      this.prisma.searchInteraction.count({ where: { tenantId } }),
      this.prisma.searchInteraction.count({
        where: {
          tenantId,
          outcome: { in: ['purchased', 'added_to_cart', 'asked_more'] },
        },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "queryNormalized")::bigint AS count
        FROM "search_interactions"
        WHERE "tenantId" = ${tenantId}
      `.then((r) => Number(r[0]?.count ?? 0)),
    ]);

    let coverage: 'low' | 'medium' | 'high';
    if (positive < 200) coverage = 'low';
    else if (positive < 1000) coverage = 'medium';
    else coverage = 'high';

    return {
      totalInteractions: total,
      withPositiveOutcome: positive,
      uniqueQueries: unique,
      coverageEstimate: coverage,
    };
  }

  private buildProductText(p: {
    name: string;
    description: string | null;
    category: { name: string } | null;
    customFields: unknown;
  }): string {
    const parts: string[] = [p.name];
    if (p.category?.name) parts.push(`Categoria: ${p.category.name}`);
    if (p.description) parts.push(p.description);

    const cf = p.customFields as Record<string, unknown> | null;
    if (cf && typeof cf === 'object') {
      for (const [k, v] of Object.entries(cf)) {
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) continue;
        const valueStr = Array.isArray(v) ? v.map(String).join(', ') : String(v);
        parts.push(`${k}: ${valueStr}`);
      }
    }
    return parts.join('. ');
  }
}
