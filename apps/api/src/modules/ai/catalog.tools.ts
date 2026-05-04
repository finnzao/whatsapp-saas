import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Product, ProductVariation } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalize, tokenize } from '../../common/utils/text-normalize';
import { EmbeddingService } from './embeddings/embedding.service';

type ProductWithRelations = Product & {
  category: { name: string } | null;
  variations: ProductVariation[];
};

export interface ToolHandoffResult {
  handoff: true;
  reason: string;
}

export type ToolExecutionResult =
  | ToolHandoffResult
  | { handoff?: false;[key: string]: unknown }
  | unknown[];

const QUALIFIER_TOKENS = new Set([
  'preto', 'branco', 'azul', 'vermelho', 'verde', 'amarelo', 'rosa', 'roxo',
  'cinza', 'prata', 'dourado', 'laranja', 'marrom', 'bege', 'lilas', 'violeta',
  'pp', 'p', 'm', 'g', 'gg', 'xgg',
  '110v', '220v', 'bivolt',
  '64gb', '128gb', '256gb', '512gb', '1tb', '2tb',
]);

const PRODUCT_TYPE_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['celular', 'smartphone', 'aparelho']),
  new Set(['tablet']),
  new Set(['notebook', 'laptop', 'ultrabook']),
  new Set(['desktop', 'computador', 'pc', 'gabinete']),
  new Set(['monitor', 'tela']),
  new Set(['tv', 'televisao', 'televisor', 'smarttv']),
  new Set(['smartwatch', 'relogio']),
  new Set(['fone', 'headphone', 'earphone', 'headset']),
  new Set(['caixinha', 'caixa', 'speaker', 'soundbar']),
  new Set(['capa', 'capinha', 'case']),
  new Set(['pelicula', 'protetor']),
  new Set(['carregador', 'fonte']),
  new Set(['cabo']),
  new Set(['adaptador']),
  new Set(['powerbank', 'bateria']),
  new Set(['mouse']), new Set(['teclado']), new Set(['webcam']),
  new Set(['microfone']), new Set(['pendrive']), new Set(['hd', 'ssd']),
  new Set(['camiseta', 'camisa', 'blusa']),
  new Set(['calca', 'short', 'bermuda']),
  new Set(['vestido']), new Set(['saia']),
  new Set(['jaqueta', 'casaco', 'moletom']),
  new Set(['tenis', 'sapato', 'sandalia', 'bota', 'chinelo']),
  new Set(['mochila', 'bolsa', 'carteira']),
  new Set(['cinto']), new Set(['oculos']),
  new Set(['liquidificador']), new Set(['airfryer', 'fritadeira']),
  new Set(['microondas']), new Set(['geladeira']),
  new Set(['fogao']), new Set(['cafeteira']), new Set(['panela']),
  new Set(['sofa']), new Set(['cadeira']), new Set(['mesa']),
  new Set(['shampoo']), new Set(['condicionador']), new Set(['creme']),
  new Set(['perfume']), new Set(['batom']), new Set(['rimel']),
  new Set(['racao']), new Set(['coleira']), new Set(['brinquedo']),
];

const GENERIC_TO_MODEL_HINTS: Record<string, string[]> = {
  celular: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  smartphone: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  aparelho: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  tablet: ['ipad'],
  notebook: ['macbook'],
  laptop: ['macbook'],
};

const PRODUCT_TYPE_TOKENS = new Set<string>(
  PRODUCT_TYPE_GROUPS.flatMap((g) => Array.from(g)),
);

function getProductTypeGroup(token: string): ReadonlySet<string> | null {
  for (const g of PRODUCT_TYPE_GROUPS) {
    if (g.has(token)) return g;
  }
  return null;
}

const HEX_TO_COLOR_NAME: Array<{ hex: string; name: string }> = [
  { hex: '#000000', name: 'preto' },
  { hex: '#ffffff', name: 'branco' },
  { hex: '#ff0000', name: 'vermelho' },
  { hex: '#00ff00', name: 'verde' },
  { hex: '#0000ff', name: 'azul' },
  { hex: '#ffff00', name: 'amarelo' },
  { hex: '#ff8000', name: 'laranja' },
  { hex: '#ffa500', name: 'laranja' },
  { hex: '#ffc0cb', name: 'rosa' },
  { hex: '#800080', name: 'roxo' },
  { hex: '#808080', name: 'cinza' },
  { hex: '#c0c0c0', name: 'prata' },
  { hex: '#ffd700', name: 'dourado' },
  { hex: '#a52a2a', name: 'marrom' },
];

function classifyToken(
  token: string,
  customTypeTokens: Set<string>,
): 'product_type' | 'qualifier' | 'generic' {
  if (customTypeTokens.has(token)) return 'product_type';
  if (PRODUCT_TYPE_TOKENS.has(token)) return 'product_type';
  if (QUALIFIER_TOKENS.has(token)) return 'qualifier';
  return 'generic';
}

function productMatchesProductType(haystack: string, productTypeToken: string): boolean {
  if (haystack.includes(productTypeToken)) return true;
  const group = getProductTypeGroup(productTypeToken);
  if (group) {
    for (const synonym of group) {
      if (synonym !== productTypeToken && haystack.includes(synonym)) return true;
    }
  }
  const modelHints = GENERIC_TO_MODEL_HINTS[productTypeToken];
  if (modelHints) {
    for (const model of modelHints) {
      if (haystack.includes(model)) return true;
    }
  }
  return false;
}

function hexDistance(a: string, b: string): number {
  const parseHex = (h: string) => {
    const clean = h.replace('#', '');
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function hexToColorName(hex: string): string | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const lower = hex.toLowerCase();
  const exact = HEX_TO_COLOR_NAME.find((c) => c.hex === lower);
  if (exact) return exact.name;
  let best: { name: string; distance: number } | null = null;
  for (const c of HEX_TO_COLOR_NAME) {
    const d = hexDistance(lower, c.hex);
    if (best === null || d < best.distance) best = { name: c.name, distance: d };
  }
  return best && best.distance < 80 ? best.name : null;
}

export function formatBrl(value: number | Prisma.Decimal | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface CategoryKeywordContext {
  customTypeTokens: Set<string>;
  tokenToCategoryNames: Map<string, Set<string>>;
  allCategoryNames: string[];
  hasAnyKeywords: boolean;
}

interface SearchContext {
  conversationId?: string;
  contactId?: string;
}

interface RankedProduct {
  product: ProductWithRelations;
  lexicalRank?: number;
  vectorRank?: number;
  vectorDistance?: number;
  rrfScore: number;
  matchedTokens: string[];
  missedProductTypes: string[];
  missedQualifiers: string[];
  categoryActivated: boolean;
}

const RRF_K = 60;
const VECTOR_LIMIT_DEFAULT = 30;
const VECTOR_MAX_DISTANCE = 0.6; // descarta resultados claramente irrelevantes

@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) { }

  getToolDefinitions() {
    return [
      {
        name: 'search_products',
        description:
          'USE SEMPRE QUE O CLIENTE PERGUNTAR SOBRE PRODUTOS. Busca no catálogo combinando palavras-chave e busca semântica (intenção). Retorna matchQuality ("exact"/"partial"/"none") e priceDisplay já FORMATADO em reais — sempre use o priceDisplay literal ao responder, NUNCA recalcule.',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description:
                'Texto livre com as palavras do cliente, incluindo características (cor, tamanho, marca) ou intenção (presente, uso, contexto).',
            },
            maxPrice: { type: 'number', description: 'Preço máximo em reais (opcional)' },
            minPrice: { type: 'number', description: 'Preço mínimo em reais (opcional)' },
            limit: { type: 'number', description: 'Quantos produtos retornar (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'check_product_availability',
        description:
          'NÃO use para perguntas iniciais. Use APENAS depois de search_products, com um UUID retornado por ele. NUNCA invente productId.',
        parameters: {
          type: 'object' as const,
          properties: {
            productId: {
              type: 'string',
              description: 'UUID retornado antes por search_products.',
            },
          },
          required: ['productId'],
        },
      },
      {
        name: 'list_categories',
        description:
          'Lista categorias da loja. Use quando o cliente perguntar genericamente o que vocês vendem.',
        parameters: { type: 'object' as const, properties: {} },
      },
      {
        name: 'request_human_handoff',
        description:
          'Transfere para humano. Use quando o cliente pedir explicitamente, estiver irritado, reclamar de pedido, pedir desconto ou assistência técnica.',
        parameters: {
          type: 'object' as const,
          properties: {
            reason: { type: 'string', description: 'Motivo da transferência' },
          },
          required: ['reason'],
        },
      },
    ];
  }

  private async buildKeywordContext(tenantId: string): Promise<CategoryKeywordContext> {
    const categories = await this.prisma.category.findMany({
      where: { tenantId, active: true },
      select: { name: true, keywords: true },
    });

    const customTypeTokens = new Set<string>();
    const tokenToCategoryNames = new Map<string, Set<string>>();
    const allCategoryNames: string[] = [];
    let hasAnyKeywords = false;

    for (const cat of categories) {
      allCategoryNames.push(cat.name);
      const kws = cat.keywords ?? [];
      if (kws.length === 0) continue;
      hasAnyKeywords = true;
      for (const kw of kws) {
        const tokens = tokenize(kw);
        for (const tok of tokens) {
          customTypeTokens.add(tok);
          if (!tokenToCategoryNames.has(tok)) tokenToCategoryNames.set(tok, new Set());
          tokenToCategoryNames.get(tok)!.add(cat.name);
        }
      }
    }

    return { customTypeTokens, tokenToCategoryNames, allCategoryNames, hasAnyKeywords };
  }

  /**
   * Busca híbrida: lexical (atual) + vetorial (novo) + RRF.
   *
   * 1. Lexical retorna até 100 produtos com tokens batendo.
   * 2. Vetorial retorna até 30 produtos por similaridade semântica (cosine).
   * 3. RRF combina os dois rankings num score único.
   * 4. Aplicamos as MESMAS regras de matchQuality (product type, qualifier
   *    missing) como antes, mas operando sobre o conjunto fundido.
   */
  async searchProducts(
    tenantId: string,
    params: { query: string; maxPrice?: number; minPrice?: number; limit?: number },
    ctx: SearchContext = {},
  ) {
    const startedAt = Date.now();
    const tokens = tokenize(params.query);
    const limit = params.limit ?? 5;
    const keywordCtx = await this.buildKeywordContext(tenantId);

    const tokenTypes = tokens.map((t) => ({
      token: t,
      type: classifyToken(t, keywordCtx.customTypeTokens),
    }));
    const productTypeTokens = tokenTypes.filter((t) => t.type === 'product_type').map((t) => t.token);
    const qualifierTokens = tokenTypes.filter((t) => t.type === 'qualifier').map((t) => t.token);

    const activatedCategoryNames = new Set<string>();
    for (const t of tokens) {
      const cats = keywordCtx.tokenToCategoryNames.get(t);
      if (cats) for (const c of cats) activatedCategoryNames.add(c);
    }

    const [lexicalRanked, vectorRanked] = await Promise.all([
      this.lexicalSearch(tenantId, params, tokens, productTypeTokens, qualifierTokens, activatedCategoryNames, keywordCtx),
      this.vectorSearchAndHydrate(tenantId, params),
    ]);

    const fused = this.fuseRankings(lexicalRanked, vectorRanked, tokens, productTypeTokens, qualifierTokens, activatedCategoryNames);

    const { matchQuality, chosen } = this.decideMatchQuality(
      fused,
      productTypeTokens,
      tokens,
      keywordCtx,
      limit,
    );

    const latencyMs = Date.now() - startedAt;

    this.logger.debug(
      `[search_products] q="${params.query}" tokens=[${tokens.join(',')}] ` +
      `lex=${lexicalRanked.length} vec=${vectorRanked.length} fused=${fused.length} ` +
      `quality=${matchQuality} returned=${chosen.length} ${latencyMs}ms`,
    );

    const resultsShown = chosen.map((x, i) => ({
      productId: x.product.id,
      name: x.product.name,
      finalRank: i + 1,
      lexicalRank: x.lexicalRank ?? null,
      vectorRank: x.vectorRank ?? null,
      vectorDistance: x.vectorDistance ?? null,
      rrfScore: Number(x.rrfScore.toFixed(6)),
    }));

    void this.recordInteraction({
      tenantId,
      query: params.query,
      tokens,
      lexicalCount: lexicalRanked.length,
      vectorCount: vectorRanked.length,
      fusedCount: fused.length,
      matchQuality,
      resultsShown,
      latencyMs,
      ctx,
    });

    return {
      matchQuality,
      queryTokens: tokens,
      totalCandidates: lexicalRanked.length + vectorRanked.length,
      results: chosen.map((x) => ({
        ...this.serializeProduct(x.product),
        matchedOn: x.matchedTokens,
        notMatched: x.missedQualifiers,
      })),
      ...(matchQuality === 'partial' && {
        hint:
          'IMPORTANTE: Estes produtos podem ter DIFERENÇAS do que o cliente pediu (veja "notMatched"). ' +
          'Avise honestamente sobre a diferença antes de oferecer. Use priceDisplay LITERAL.',
      }),
      ...(matchQuality === 'none' &&
        productTypeTokens.length > 0 && {
        hint: this.buildNoneHint(keywordCtx, productTypeTokens),
      }),
      ...(matchQuality === 'none' &&
        productTypeTokens.length === 0 && {
        hint:
          'Nenhum produto encontrado. Peça mais detalhes (marca, modelo, faixa de preço) ' +
          'ou ofereça transferência para atendente.',
      }),
    };
  }

  // -----------------------------------------------------------
  // LEXICAL SEARCH (lógica existente, refatorada)
  // -----------------------------------------------------------
  private async lexicalSearch(
    tenantId: string,
    params: { maxPrice?: number; minPrice?: number },
    tokens: string[],
    productTypeTokens: string[],
    qualifierTokens: string[],
    activatedCategoryNames: Set<string>,
    keywordCtx: CategoryKeywordContext,
  ): Promise<RankedProduct[]> {
    const priceFilter: Prisma.DecimalFilter = {};
    if (typeof params.maxPrice === 'number' && Number.isFinite(params.maxPrice)) {
      priceFilter.lte = params.maxPrice;
    }
    if (typeof params.minPrice === 'number' && Number.isFinite(params.minPrice)) {
      priceFilter.gte = params.minPrice;
    }

    const where: Prisma.ProductWhereInput = {
      tenantId,
      active: true,
      paused: false,
      ...(Object.keys(priceFilter).length > 0 && { price: priceFilter }),
    };

    const candidates: ProductWithRelations[] = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        variations: { where: { active: true } },
      },
      orderBy: { stock: 'desc' },
      take: 100,
    });

    if (tokens.length === 0) return [];

    const scored = candidates
      .map((p) => {
        const haystack = this.buildHaystack(p);
        const matchedTokens = tokens.filter((t) => haystack.includes(t));
        const matchedProductTypes = productTypeTokens.filter((t) =>
          productMatchesProductType(haystack, t),
        );
        const missedProductTypes = productTypeTokens.filter(
          (t) => !productMatchesProductType(haystack, t),
        );
        const missedQualifiers = qualifierTokens.filter((t) => !matchedTokens.includes(t));

        const productCategoryName = p.category?.name;
        const categoryActivated =
          productCategoryName !== undefined && activatedCategoryNames.has(productCategoryName);

        const effectiveMatched = Array.from(
          new Set([...matchedTokens, ...matchedProductTypes]),
        );

        const score = this.computeLexicalScore(
          p,
          tokens,
          effectiveMatched,
          matchedProductTypes,
          categoryActivated,
        );

        return {
          product: p,
          score,
          matchedTokens: effectiveMatched,
          missedProductTypes,
          missedQualifiers,
          categoryActivated,
        };
      })
      .filter((x) => x.matchedTokens.length > 0 || x.categoryActivated)
      .sort((a, b) => b.score - a.score);

    return scored.map((s, i) => ({
      product: s.product,
      lexicalRank: i + 1,
      rrfScore: 0,
      matchedTokens: s.matchedTokens,
      missedProductTypes: s.missedProductTypes,
      missedQualifiers: s.missedQualifiers,
      categoryActivated: s.categoryActivated,
    }));
  }

  // -----------------------------------------------------------
  // VECTOR SEARCH
  // -----------------------------------------------------------
  private async vectorSearchAndHydrate(
    tenantId: string,
    params: { query: string; maxPrice?: number; minPrice?: number },
  ): Promise<Array<{ product: ProductWithRelations; rank: number; distance: number }>> {
    if (!params.query?.trim()) return [];

    let queryVector: number[];
    try {
      queryVector = await this.embeddings.embedQuery(params.query);
    } catch (err) {
      this.logger.warn(
        `[search_products] embedding falhou (degradando pra só lexical): ${(err as Error).message}`,
      );
      return [];
    }

    const ranked = await this.embeddings.vectorSearch(tenantId, queryVector, {
      limit: VECTOR_LIMIT_DEFAULT,
      minDistance: VECTOR_MAX_DISTANCE,
    });
    if (ranked.length === 0) return [];

    const hasMaxPrice = typeof params.maxPrice === 'number' && Number.isFinite(params.maxPrice);
    const hasMinPrice = typeof params.minPrice === 'number' && Number.isFinite(params.minPrice);
    const priceWhere: Prisma.DecimalFilter = {};
    if (hasMaxPrice) priceWhere.lte = params.maxPrice;
    if (hasMinPrice) priceWhere.gte = params.minPrice;

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: ranked.map((r) => r.id) },
        tenantId,
        active: true,
        paused: false,
        ...(Object.keys(priceWhere).length > 0 && { price: priceWhere }),
      },
      include: {
        category: { select: { name: true } },
        variations: { where: { active: true } },
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));

    return ranked
      .map((r, i) => {
        const product = byId.get(r.id);
        if (!product) return null;
        return { product, rank: i + 1, distance: r.distance };
      })
      .filter((x): x is { product: ProductWithRelations; rank: number; distance: number } => x !== null);
  }

  // -----------------------------------------------------------
  // RRF (Reciprocal Rank Fusion)
  // -----------------------------------------------------------
  private fuseRankings(
    lexical: RankedProduct[],
    vector: Array<{ product: ProductWithRelations; rank: number; distance: number }>,
    tokens: string[],
    productTypeTokens: string[],
    qualifierTokens: string[],
    activatedCategoryNames: Set<string>,
  ): RankedProduct[] {
    const merged = new Map<string, RankedProduct>();

    for (const l of lexical) {
      merged.set(l.product.id, {
        ...l,
        rrfScore: 1 / (RRF_K + (l.lexicalRank ?? 1)),
      });
    }

    for (const v of vector) {
      const existing = merged.get(v.product.id);
      const vectorContribution = 1 / (RRF_K + v.rank);

      if (existing) {
        existing.vectorRank = v.rank;
        existing.vectorDistance = v.distance;
        existing.rrfScore += vectorContribution;
      } else {
        // Produto vindo só do vetor — calcular metadados de match.
        const haystack = this.buildHaystack(v.product);
        const matchedTokens = tokens.filter((t) => haystack.includes(t));
        const matchedProductTypes = productTypeTokens.filter((t) =>
          productMatchesProductType(haystack, t),
        );
        const missedProductTypes = productTypeTokens.filter(
          (t) => !productMatchesProductType(haystack, t),
        );
        const missedQualifiers = qualifierTokens.filter((t) => !matchedTokens.includes(t));
        const categoryActivated =
          v.product.category?.name !== undefined &&
          activatedCategoryNames.has(v.product.category.name);
        const effectiveMatched = Array.from(new Set([...matchedTokens, ...matchedProductTypes]));

        merged.set(v.product.id, {
          product: v.product,
          vectorRank: v.rank,
          vectorDistance: v.distance,
          rrfScore: vectorContribution,
          matchedTokens: effectiveMatched,
          missedProductTypes,
          missedQualifiers,
          categoryActivated,
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.rrfScore - a.rrfScore);
  }

  // -----------------------------------------------------------
  // matchQuality decisão (mesma regra do código antigo, mas agora
  // sobre o conjunto fundido)
  // -----------------------------------------------------------
  private decideMatchQuality(
    scored: RankedProduct[],
    productTypeTokens: string[],
    tokens: string[],
    keywordCtx: CategoryKeywordContext,
    limit: number,
  ): { matchQuality: 'exact' | 'partial' | 'none'; chosen: RankedProduct[] } {
    const hasProductTypeRequirement = productTypeTokens.length > 0;

    const productsWithRequiredType = scored.filter((x) => {
      if (x.missedProductTypes.length === 0) return true;
      if (!x.categoryActivated) return false;
      const productCatName = x.product.category?.name;
      if (!productCatName) return false;
      return x.missedProductTypes.every((missedType) => {
        const catsThatHaveToken = keywordCtx.tokenToCategoryNames.get(missedType);
        return catsThatHaveToken?.has(productCatName) ?? false;
      });
    });

    if (hasProductTypeRequirement && productsWithRequiredType.length === 0) {
      return { matchQuality: 'none', chosen: [] };
    }

    const candidatesForChoice = hasProductTypeRequirement ? productsWithRequiredType : scored;

    const exactMatches = candidatesForChoice.filter(
      (x) => x.matchedTokens.length === tokens.length && tokens.length > 0,
    );

    if (exactMatches.length > 0) {
      return { matchQuality: 'exact', chosen: exactMatches.slice(0, limit) };
    }
    if (candidatesForChoice.length > 0) {
      return { matchQuality: 'partial', chosen: candidatesForChoice.slice(0, limit) };
    }
    return { matchQuality: 'none', chosen: [] };
  }

  private buildNoneHint(ctx: CategoryKeywordContext, productTypeTokens: string[]): string {
    const requested = productTypeTokens.join(', ');
    const sells =
      ctx.allCategoryNames.length > 0
        ? `Esta loja vende: ${ctx.allCategoryNames.join(', ')}.`
        : 'Esta loja ainda não tem categorias cadastradas.';
    return (
      `O cliente pediu produto do tipo "${requested}" e a loja NÃO TEM esse tipo. ` +
      `${sells} ` +
      'NÃO ofereça produtos de tipo diferente como se fossem o que o cliente pediu. ' +
      'Diga honestamente que não tem e, se fizer sentido, mencione o que a loja vende. ' +
      'Se o cliente insistir ou ficar irritado, ofereça transferência para atendente humano.'
    );
  }

  // -----------------------------------------------------------
  // SearchInteraction persistence
  // -----------------------------------------------------------
  private async recordInteraction(args: {
    tenantId: string;
    query: string;
    tokens: string[];
    lexicalCount: number;
    vectorCount: number;
    fusedCount: number;
    matchQuality: string;
    resultsShown: unknown[];
    latencyMs: number;
    ctx: SearchContext;
  }): Promise<void> {
    try {
      // Embedda a query (de novo, mas geralmente vai cair no cache do provider).
      // Falhas aqui não bloqueiam — gravamos sem vector.
      let queryVectorLiteral: string | null = null;
      try {
        const v = await this.embeddings.embedQuery(args.query);
        queryVectorLiteral = `[${v.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
      } catch {
        // segue sem queryEmbedding
      }

      await this.prisma.$executeRaw`
        INSERT INTO "search_interactions" (
          "id", "tenantId", "conversationId", "contactId",
          "query", "queryNormalized", "queryEmbedding",
          "resultsShown", "lexicalCount", "vectorCount", "fusedCount",
          "matchQuality", "outcome", "latencyMs"
        ) VALUES (
          gen_random_uuid(),
          ${args.tenantId},
          ${args.ctx.conversationId ?? null},
          ${args.ctx.contactId ?? null},
          ${args.query},
          ${args.tokens.join(' ')},
          ${queryVectorLiteral ? Prisma.sql`${queryVectorLiteral}::vector` : null},
          ${JSON.stringify(args.resultsShown)}::jsonb,
          ${args.lexicalCount},
          ${args.vectorCount},
          ${args.fusedCount},
          ${args.matchQuality},
          ${args.matchQuality === 'none' ? 'no_results' : null},
          ${args.latencyMs}
        )
      `;
    } catch (err) {
      this.logger.warn(`[search_products] falha ao gravar interaction: ${(err as Error).message}`);
    }
  }

  // -----------------------------------------------------------
  // Resto: serialização, lookup, etc — sem mudança lógica
  // -----------------------------------------------------------

  private buildHaystack(p: ProductWithRelations): string {
    const parts: string[] = [p.name, p.description ?? '', p.sku ?? '', p.category?.name ?? ''];
    const cf = p.customFields as Record<string, unknown> | null;
    if (cf) {
      for (const value of Object.values(cf)) {
        if (Array.isArray(value)) {
          parts.push(value.map((v) => this.stringifyFieldValue(v)).join(' '));
        } else {
          parts.push(this.stringifyFieldValue(value));
        }
      }
    }
    for (const v of p.variations) {
      parts.push(v.name);
      const attrs = v.attributes as Record<string, unknown> | null;
      if (attrs) parts.push(Object.values(attrs).map((x) => this.stringifyFieldValue(x)).join(' '));
    }
    return normalize(parts.join(' '));
  }

  private stringifyFieldValue(v: unknown): string {
    const s = String(v ?? '');
    if (/^#[0-9a-fA-F]{6}$/.test(s)) {
      const colorName = hexToColorName(s);
      return colorName ? `${s} ${colorName}` : s;
    }
    return s;
  }

  private computeLexicalScore(
    p: ProductWithRelations,
    tokens: string[],
    matched: string[],
    matchedProductTypes: string[],
    categoryActivated: boolean,
  ): number {
    const nameNorm = normalize(p.name);
    const nameMatches = tokens.filter((t) => nameNorm.includes(t)).length;
    let score = matched.length * 10 + nameMatches * 20;
    score += matchedProductTypes.length * 50;
    if (categoryActivated) score += 25;
    if (p.stock > 0) score += 5;
    if (tokens.every((t) => nameNorm.includes(t))) score += 30;
    return score;
  }

  private buildPriceInfo(p: ProductWithRelations): {
    priceDisplay: string;
    priceCashDisplay: string | null;
    installmentsDisplay: string | null;
    fullPriceText: string;
  } {
    const priceDisplay = formatBrl(p.price) ?? 'a consultar';
    const priceCashDisplay = p.priceCash !== null ? formatBrl(p.priceCash) : null;
    let installmentsDisplay: string | null = null;
    if (p.installments && p.installments > 0 && p.priceInstallment !== null) {
      const perInstallment = Number(p.priceInstallment) / p.installments;
      const perInstallmentStr = formatBrl(perInstallment);
      if (perInstallmentStr) installmentsDisplay = `${p.installments}x de ${perInstallmentStr}`;
    }
    const extras: string[] = [];
    if (priceCashDisplay && priceCashDisplay !== priceDisplay) extras.push(`${priceCashDisplay} à vista`);
    if (installmentsDisplay) extras.push(installmentsDisplay);
    const fullPriceText =
      extras.length > 0 ? `${priceDisplay} (ou ${extras.join(', ou ')})` : priceDisplay;
    return { priceDisplay, priceCashDisplay, installmentsDisplay, fullPriceText };
  }

  private serializeProduct(p: ProductWithRelations) {
    const cf = p.customFields as Record<string, unknown> | null;
    const enrichedCf = cf ? this.enrichCustomFieldsForDisplay(cf) : null;
    const priceInfo = this.buildPriceInfo(p);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      priceDisplay: priceInfo.priceDisplay,
      priceCashDisplay: priceInfo.priceCashDisplay,
      installmentsDisplay: priceInfo.installmentsDisplay,
      fullPriceText: priceInfo.fullPriceText,
      stockText: p.trackStock
        ? p.stock > 0 ? `${p.stock} em estoque` : 'sem estoque'
        : 'disponível',
      price: Number(p.price),
      stock: p.stock,
      inStock: !p.trackStock || p.stock > 0,
      condition: p.condition,
      warranty: p.warranty,
      category: p.category?.name,
      imageUrl: p.images[0] ?? null,
      customFields: enrichedCf,
      variations: p.variations.map((v) => ({
        id: v.id,
        name: v.name,
        priceDisplay: v.price !== null ? formatBrl(v.price) : null,
        stock: v.stock,
      })),
    };
  }

  private enrichCustomFieldsForDisplay(cf: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cf)) {
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) {
        const name = hexToColorName(v);
        out[k] = name ? `${name} (${v})` : v;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private isUuid(s: unknown): boolean {
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  async checkProductAvailability(tenantId: string, productId: string, ctx: SearchContext = {}) {
    if (!this.isUuid(productId)) {
      this.logger.warn(
        `[check_product_availability] productId inválido: "${productId}". Modelo deveria usar search_products primeiro.`,
      );
      return {
        found: false,
        error:
          'productId inválido. Use search_products primeiro para obter um UUID de produto real, depois passe esse UUID aqui.',
      };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: {
        category: { select: { name: true } },
        variations: { where: { active: true } },
      },
    });

    if (!product) return { found: false };

    // Heurística leve: marca a interaction mais recente como "asked_more" se
    // o produto consultado foi um dos mostrados.
    if (ctx.conversationId) {
      void this.markFollowUp(ctx.conversationId, productId);
    }

    const cf = product.customFields as Record<string, unknown> | null;
    const priceInfo = this.buildPriceInfo(product as ProductWithRelations);
    return {
      found: true,
      name: product.name,
      priceDisplay: priceInfo.priceDisplay,
      priceCashDisplay: priceInfo.priceCashDisplay,
      installmentsDisplay: priceInfo.installmentsDisplay,
      fullPriceText: priceInfo.fullPriceText,
      available: product.active && !product.paused && (!product.trackStock || product.stock > 0),
      stockText: product.trackStock
        ? product.stock > 0 ? `${product.stock} em estoque` : 'sem estoque'
        : 'disponível',
      customFields: cf ? this.enrichCustomFieldsForDisplay(cf) : null,
    };
  }

  async listCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, active: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, description: true },
    });
  }

  async execute(
    tenantId: string,
    toolName: string,
    input: any,
    ctx: SearchContext = {},
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'search_products':
        return this.searchProducts(tenantId, input, ctx);
      case 'check_product_availability':
        return this.checkProductAvailability(tenantId, input.productId, ctx);
      case 'list_categories':
        return this.listCategories(tenantId);
      case 'request_human_handoff':
        return { handoff: true, reason: input.reason } as ToolHandoffResult;
      default:
        return { error: `Tool desconhecida: ${toolName}` };
    }
  }

  /**
   * Marca as interactions recentes como 'asked_more' quando o produto
   * mostrado é consultado (check_product_availability). É um sinal
   * positivo pra training data — o cliente quis saber detalhes.
   */
  private async markFollowUp(conversationId: string, productId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE "search_interactions"
        SET "outcome" = 'asked_more',
            "outcomeAt" = NOW(),
            "selectedProductId" = ${productId}
        WHERE "id" IN (
          SELECT "id" FROM "search_interactions"
          WHERE "conversationId" = ${conversationId}
            AND "outcome" IS NULL
            AND "createdAt" > NOW() - INTERVAL '10 minutes'
            AND "resultsShown" @> ${JSON.stringify([{ productId }])}::jsonb
          ORDER BY "createdAt" DESC
          LIMIT 1
        )
      `;
    } catch (err) {
      this.logger.debug(`[catalog] markFollowUp falhou: ${(err as Error).message}`);
    }
  }
}
