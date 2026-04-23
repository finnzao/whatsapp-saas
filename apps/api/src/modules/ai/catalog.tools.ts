import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Product, ProductVariation } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  | { handoff?: false; [key: string]: unknown }
  | unknown[];

const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'pra', 'por', 'com', 'sem', 'e', 'ou', 'que',
  'tem', 'ter', 'tens', 'teria',
  'ae', 'ai', 'la', 'ali', 'aqui',
  'favor', 'obrigado', 'obrigada',
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(private readonly prisma: PrismaService) {}

  getToolDefinitions() {
    return [
      {
        name: 'search_products',
        description:
          'USE SEMPRE QUE O CLIENTE PERGUNTAR SOBRE PRODUTOS. Busca no catálogo por nome, marca, modelo, categoria, cor, tamanho, voltagem ou qualquer característica. Aceita texto livre com várias palavras. Exemplos de chamada: query="iphone laranja", query="camisa azul tamanho M", query="notebook gamer até 3000". Esta é a ferramenta que você deve chamar quando o cliente perguntar "tem X?", "quero um Y", "vocês vendem Z?".',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description:
                'Texto de busca livre com as palavras do cliente. Pode e deve conter características (cor, tamanho, marca) junto com o nome.',
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
          'NÃO use esta ferramenta para perguntas iniciais do cliente. Use APENAS depois de search_products, para checar se um produto específico que você já encontrou ainda tem estoque. O productId DEVE ser um UUID válido retornado por search_products em uma chamada anterior desta conversa. NUNCA invente productId, NUNCA passe o nome do produto como productId.',
        parameters: {
          type: 'object' as const,
          properties: {
            productId: {
              type: 'string',
              description:
                'UUID do produto (ex: 550e8400-e29b-41d4-a716-446655440000). SÓ use IDs retornados antes por search_products.',
            },
          },
          required: ['productId'],
        },
      },
      {
        name: 'list_categories',
        description:
          'Lista as categorias de produtos da loja. Use quando o cliente perguntar "quais categorias vocês têm?" ou "o que vocês vendem?" de forma genérica.',
        parameters: { type: 'object' as const, properties: {} },
      },
      {
        name: 'request_human_handoff',
        description:
          'Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, estiver muito irritado, ou em casos complexos (reclamação de pedido, problema técnico grave, negociação de desconto).',
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

  async searchProducts(
    tenantId: string,
    params: { query: string; maxPrice?: number; minPrice?: number; limit?: number },
  ) {
    const tokens = tokenize(params.query);
    const limit = params.limit ?? 5;

    const priceFilter: Prisma.DecimalFilter = {};
    if (params.maxPrice !== undefined) priceFilter.lte = params.maxPrice;
    if (params.minPrice !== undefined) priceFilter.gte = params.minPrice;

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

    if (tokens.length === 0) {
      return candidates.slice(0, limit).map((p) => this.serializeProduct(p));
    }

    const scored = candidates
      .map((p) => {
        const haystack = this.buildHaystack(p);
        const matchedTokens = tokens.filter((t) => haystack.includes(t));
        const score = this.computeScore(p, tokens, matchedTokens);
        return { product: p, score, matchedTokens: matchedTokens.length };
      })
      .filter((x) => x.matchedTokens > 0)
      .sort((a, b) => b.score - a.score);

    const allMatch = scored.filter((x) => x.matchedTokens === tokens.length);
    const chosen = (allMatch.length > 0 ? allMatch : scored).slice(0, limit);

    this.logger.debug(
      `[search_products] query="${params.query}" tokens=[${tokens.join(', ')}] candidates=${candidates.length} matched=${scored.length} returned=${chosen.length}`,
    );

    return chosen.map((x) => this.serializeProduct(x.product));
  }

  private buildHaystack(p: ProductWithRelations): string {
    const parts: string[] = [p.name, p.description ?? '', p.sku ?? '', p.category?.name ?? ''];

    const cf = p.customFields as Record<string, unknown> | null;
    if (cf) {
      for (const value of Object.values(cf)) {
        if (Array.isArray(value)) {
          parts.push(value.map(String).join(' '));
        } else {
          parts.push(String(value));
        }
      }
    }

    for (const v of p.variations) {
      parts.push(v.name);
      const attrs = v.attributes as Record<string, unknown> | null;
      if (attrs) parts.push(Object.values(attrs).map(String).join(' '));
    }

    return normalize(parts.join(' '));
  }

  private computeScore(
    p: ProductWithRelations,
    tokens: string[],
    matched: string[],
  ): number {
    const nameNorm = normalize(p.name);
    const nameMatches = tokens.filter((t) => nameNorm.includes(t)).length;

    let score = matched.length * 10 + nameMatches * 20;

    if (p.stock > 0) score += 5;
    if (tokens.every((t) => nameNorm.includes(t))) score += 30;

    return score;
  }

  private serializeProduct(p: ProductWithRelations) {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      priceCash: p.priceCash ? Number(p.priceCash) : null,
      priceInstallment: p.priceInstallment ? Number(p.priceInstallment) : null,
      installments: p.installments,
      stock: p.stock,
      inStock: !p.trackStock || p.stock > 0,
      condition: p.condition,
      warranty: p.warranty,
      category: p.category?.name,
      imageUrl: p.images[0] ?? null,
      customFields: p.customFields ?? null,
      variations: p.variations.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price ? Number(v.price) : null,
        stock: v.stock,
      })),
    };
  }

  private isUuid(s: unknown): boolean {
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  async checkProductAvailability(tenantId: string, productId: string) {
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
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        trackStock: true,
        active: true,
        paused: true,
        customFields: true,
      },
    });

    if (!product) return { found: false };

    return {
      found: true,
      name: product.name,
      price: Number(product.price),
      available: product.active && !product.paused && (!product.trackStock || product.stock > 0),
      stock: product.stock,
      customFields: product.customFields ?? null,
    };
  }

  async listCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, active: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true },
    });
  }

  async execute(tenantId: string, toolName: string, input: any): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'search_products':
        return this.searchProducts(tenantId, input);
      case 'check_product_availability':
        return this.checkProductAvailability(tenantId, input.productId);
      case 'list_categories':
        return this.listCategories(tenantId);
      case 'request_human_handoff':
        return { handoff: true, reason: input.reason } as ToolHandoffResult;
      default:
        return { error: `Tool desconhecida: ${toolName}` };
    }
  }
}
