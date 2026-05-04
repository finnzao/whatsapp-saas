import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmbeddingService } from '../ai/embeddings/embedding.service';

export interface SearchOverview {
  embeddings: {
    total: number;
    withEmbedding: number;
    coverage: number;
    providerName: string;
    dimensions: number;
    providerAvailable: boolean;
  };
  searches: {
    last24h: number;
    last7d: number;
    avgLatencyMs: number;
    matchQualityBreakdown: Record<string, number>;
    outcomeBreakdown: Record<string, number>;
  };
  problems: {
    zeroResultRate: number;
    topZeroResultQueries: Array<{ query: string; count: number }>;
  };
}

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async getOverview(tenantId: string): Promise<SearchOverview> {
    const [stats, providerAvailable, last24h, last7d, latencyRow, qualityBreakdown, outcomeBreakdown, zeroResults] =
      await Promise.all([
        this.embeddings.getStats(tenantId),
        this.embeddings.isProviderAvailable(),
        this.countSince(tenantId, 24),
        this.countSince(tenantId, 24 * 7),
        this.prisma.$queryRaw<Array<{ avg: number }>>`
          SELECT COALESCE(AVG("latencyMs"), 0)::float AS avg
          FROM "search_interactions"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" > NOW() - INTERVAL '7 days'
        `,
        this.groupBy(tenantId, 'matchQuality', 7),
        this.groupBy(tenantId, 'outcome', 7),
        this.topZeroResults(tenantId, 7),
      ]);

    const matchQualityBreakdown = qualityBreakdown.reduce<Record<string, number>>((acc, r) => {
      acc[r.key ?? 'unknown'] = r.count;
      return acc;
    }, {});

    const outcomeMap = outcomeBreakdown.reduce<Record<string, number>>((acc, r) => {
      acc[r.key ?? 'pending'] = r.count;
      return acc;
    }, {});

    const totalQuality = Object.values(matchQualityBreakdown).reduce((a, b) => a + b, 0);
    const noneCount = matchQualityBreakdown['none'] ?? 0;

    return {
      embeddings: {
        total: stats.total,
        withEmbedding: stats.withEmbedding,
        coverage: stats.coverage,
        providerName: stats.providerName,
        dimensions: stats.dimensions,
        providerAvailable,
      },
      searches: {
        last24h,
        last7d,
        avgLatencyMs: Math.round(latencyRow[0]?.avg ?? 0),
        matchQualityBreakdown,
        outcomeBreakdown: outcomeMap,
      },
      problems: {
        zeroResultRate: totalQuality > 0 ? noneCount / totalQuality : 0,
        topZeroResultQueries: zeroResults,
      },
    };
  }

  async listRecentSearches(tenantId: string, limit = 50) {
    return this.prisma.searchInteraction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        query: true,
        matchQuality: true,
        outcome: true,
        lexicalCount: true,
        vectorCount: true,
        fusedCount: true,
        latencyMs: true,
        resultsShown: true,
        selectedProductId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Lista queries que voltaram zero produtos. Cada uma é uma "oportunidade
   * perdida": a IA pode ter dito que não tem ou ofertado handoff. Cadastrar
   * produtos que cobrem essas queries melhora taxa de conversão.
   */
  async listZeroResultQueries(tenantId: string, days = 30, limit = 100) {
    return this.prisma.$queryRaw<Array<{ query: string; count: bigint; lastAt: Date }>>`
      SELECT
        "query",
        COUNT(*)::bigint AS count,
        MAX("createdAt") AS "lastAt"
      FROM "search_interactions"
      WHERE "tenantId" = ${tenantId}
        AND "matchQuality" = 'none'
        AND "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY "query"
      ORDER BY count DESC, "lastAt" DESC
      LIMIT ${limit}
    `.then((rows) =>
      rows.map((r) => ({
        query: r.query,
        count: Number(r.count),
        lastAt: r.lastAt.toISOString(),
      })),
    );
  }

  // -----------------------------------------------------------
  // Internos
  // -----------------------------------------------------------

  private async countSince(tenantId: string, hours: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "search_interactions"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" > NOW() - (${hours} || ' hours')::interval
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async groupBy(
    tenantId: string,
    column: 'matchQuality' | 'outcome',
    days: number,
  ): Promise<Array<{ key: string | null; count: number }>> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ key: string | null; count: bigint }>>(
      `
        SELECT "${column}" AS key, COUNT(*)::bigint AS count
        FROM "search_interactions"
        WHERE "tenantId" = $1
          AND "createdAt" > NOW() - ($2 || ' days')::interval
        GROUP BY "${column}"
      `,
      tenantId,
      String(days),
    );
    return rows.map((r) => ({ key: r.key, count: Number(r.count) }));
  }

  private async topZeroResults(tenantId: string, days: number) {
    const rows = await this.prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
      SELECT "query", COUNT(*)::bigint AS count
      FROM "search_interactions"
      WHERE "tenantId" = ${tenantId}
        AND "matchQuality" = 'none'
        AND "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY "query"
      ORDER BY count DESC
      LIMIT 10
    `;
    return rows.map((r) => ({ query: r.query, count: Number(r.count) }));
  }
}
