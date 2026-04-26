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

/**
 * Representa um preço com todas as formas já pré-computadas para
 * evitar que o modelo cometa erro de formatação/conversão.
 * O modelo só precisa copiar `display` literalmente.
 */
export interface GroundedPriceInfo {
  display: string;      // "R$ 14,14"
  displayCash?: string; // "R$ 14,00" (se houver desconto)
  installmentsDisplay?: string; // "1x de R$ 14,14" (se houver parcelamento)
  valueBrl: number;     // 14.14 — pra cálculos internos, não pra exibir
}

const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'pra', 'por', 'com', 'sem', 'e', 'ou', 'que',
  'tem', 'ter', 'tens', 'teria',
  'ae', 'ai', 'la', 'ali', 'aqui',
  'favor', 'obrigado', 'obrigada',
]);

const DISCRIMINATIVE_TOKENS = new Set([
  'preto', 'branco', 'azul', 'vermelho', 'verde', 'amarelo', 'rosa', 'roxo',
  'cinza', 'prata', 'dourado', 'laranja', 'marrom', 'bege', 'lilas', 'violeta',
  'pp', 'p', 'm', 'g', 'gg', 'xgg',
]);

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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
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

@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(private readonly prisma: PrismaService) {}

  getToolDefinitions() {
    return [
      {
        name: 'search_products',
        description:
          'USE SEMPRE QUE O CLIENTE PERGUNTAR SOBRE PRODUTOS. Busca no catálogo por nome, marca, modelo, categoria, cor, tamanho, voltagem ou qualquer característica. Aceita texto livre com várias palavras. Retorna produtos com matchQuality ("exact" ou "partial") e priceDisplay já FORMATADO em reais — sempre use o priceDisplay literal ao responder, NUNCA recalcule.',
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
      return {
        matchQuality: 'none' as const,
        queryTokens: tokens,
        totalCandidates: candidates.length,
        results: [],
        hint: 'Query sem termos específicos. Peça ao cliente nome/marca/categoria do produto.',
      };
    }

    const discriminativeTokens = tokens.filter((t) => DISCRIMINATIVE_TOKENS.has(t));

    const scored = candidates
      .map((p) => {
        const haystack = this.buildHaystack(p);
        const matchedTokens = tokens.filter((t) => haystack.includes(t));
        const missedDiscriminative = discriminativeTokens.filter(
          (t) => !matchedTokens.includes(t),
        );
        const score = this.computeScore(p, tokens, matchedTokens);
        return {
          product: p,
          score,
          matchedTokens,
          missedDiscriminative,
        };
      })
      .filter((x) => x.matchedTokens.length > 0)
      .sort((a, b) => b.score - a.score);

    const exactMatches = scored.filter((x) => x.matchedTokens.length === tokens.length);

    let matchQuality: 'exact' | 'partial' | 'none';
    let chosen: typeof scored;

    if (exactMatches.length > 0) {
      matchQuality = 'exact';
      chosen = exactMatches.slice(0, limit);
    } else if (scored.length > 0) {
      matchQuality = 'partial';
      chosen = scored.slice(0, limit);
    } else {
      matchQuality = 'none';
      chosen = [];
    }

    this.logger.debug(
      `[search_products] query="${params.query}" tokens=[${tokens.join(', ')}] ` +
        `discriminative=[${discriminativeTokens.join(', ')}] ` +
        `candidates=${candidates.length} scored=${scored.length} ` +
        `matchQuality=${matchQuality} returned=${chosen.length}`,
    );

    return {
      matchQuality,
      queryTokens: tokens,
      totalCandidates: candidates.length,
      results: chosen.map((x) => ({
        ...this.serializeProduct(x.product),
        matchedOn: x.matchedTokens,
        notMatched: x.missedDiscriminative,
      })),
      ...(matchQuality === 'partial' && {
        hint:
          'IMPORTANTE: Estes produtos são PARECIDOS mas NÃO SÃO EXATAMENTE o que o cliente pediu. ' +
          'Examine "notMatched" de cada resultado. Diga honestamente ao cliente que não tem o item específico pedido ' +
          'e mostre o que você tem como alternativa. NÃO finja que é o produto pedido. ' +
          'Use priceDisplay LITERAL do resultado.',
      }),
      ...(matchQuality === 'none' && {
        hint:
          'Nenhum produto encontrado. Diga honestamente que não tem, e pergunte se o cliente aceita ' +
          'alternativas parecidas ou se pode detalhar mais (marca, modelo, faixa de preço).',
      }),
    };
  }

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
      if (attrs) {
        parts.push(Object.values(attrs).map((x) => this.stringifyFieldValue(x)).join(' '));
      }
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

  /**
   * Pré-formata preços como strings brasileiras.
   * Esta é a defesa principal contra alucinação de valor: o modelo copia
   * `priceDisplay` em vez de formatar o número `price`. Também pré-computa
   * `fullPriceText` que contém uma string "humana" já pronta, reduzindo ainda
   * mais a chance do modelo mexer em dígitos.
   */
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
      if (perInstallmentStr) {
        installmentsDisplay = `${p.installments}x de ${perInstallmentStr}`;
      }
    }

    // Texto completo pronto pra o modelo copiar quase literal.
    // Ex: "R$ 14,14 (ou R$ 14,00 à vista, ou 1x de R$ 14,14)"
    const parts: string[] = [priceDisplay];
    const extras: string[] = [];
    if (priceCashDisplay && priceCashDisplay !== priceDisplay) {
      extras.push(`${priceCashDisplay} à vista`);
    }
    if (installmentsDisplay) extras.push(installmentsDisplay);
    const fullPriceText =
      extras.length > 0 ? `${priceDisplay} (ou ${extras.join(', ou ')})` : priceDisplay;

    return {
      priceDisplay,
      priceCashDisplay,
      installmentsDisplay,
      fullPriceText,
    };
  }

  private serializeProduct(p: ProductWithRelations) {
    const cf = p.customFields as Record<string, unknown> | null;
    const enrichedCf = cf ? this.enrichCustomFieldsForDisplay(cf) : null;
    const priceInfo = this.buildPriceInfo(p);

    // IMPORTANTE: mantemos os campos numéricos crus (`price`, `stock`) porque
    // o frontend `/dev` os usa pra exibir. Eles ficam no payload que o modelo
    // também vê, mas o prompt deixa claro que SÓ `priceDisplay`/`fullPriceText`
    // devem ser citados — e o PriceGuardrailService valida pós-resposta.
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      // Campos formatados — ESTES SÃO OS QUE O MODELO DEVE CITAR.
      priceDisplay: priceInfo.priceDisplay,
      priceCashDisplay: priceInfo.priceCashDisplay,
      installmentsDisplay: priceInfo.installmentsDisplay,
      fullPriceText: priceInfo.fullPriceText,
      stockText: p.trackStock
        ? p.stock > 0
          ? `${p.stock} em estoque`
          : 'sem estoque'
        : 'disponível',
      // Campos numéricos crus para compatibilidade de UI/filtros.
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
      include: {
        category: { select: { name: true } },
        variations: { where: { active: true } },
      },
    });

    if (!product) return { found: false };

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
        ? product.stock > 0
          ? `${product.stock} em estoque`
          : 'sem estoque'
        : 'disponível',
      customFields: cf ? this.enrichCustomFieldsForDisplay(cf) : null,
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
