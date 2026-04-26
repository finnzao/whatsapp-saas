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

// "Qualificadores" — adjetivos que descrevem variações do mesmo produto.
// Cor, tamanho, voltagem. Quando o cliente pede "azul" e só tem "preto",
// é razoável oferecer alternativa.
const QUALIFIER_TOKENS = new Set([
  'preto', 'branco', 'azul', 'vermelho', 'verde', 'amarelo', 'rosa', 'roxo',
  'cinza', 'prata', 'dourado', 'laranja', 'marrom', 'bege', 'lilas', 'violeta',
  'pp', 'p', 'm', 'g', 'gg', 'xgg',
  '110v', '220v', 'bivolt',
  '64gb', '128gb', '256gb', '512gb', '1tb', '2tb',
]);

// "Tipo do produto" — SUBSTANTIVOS GENÉRICOS que identificam O QUE é o
// produto (não a marca/modelo). Defesa contra alucinação tipo "vendi celular
// como carregador" (token de tipo do cliente NÃO bate em nenhum produto =
// matchQuality 'none', sem fallback de marca).
//
// Cada Set é uma família: cliente diz "celular" e qualquer produto cuja
// CATEGORIA/HAYSTACK contenha "celular" OU "smartphone" satisfaz.
//
// IMPORTANTE: marcas e modelos específicos (iPhone, Galaxy, Xiaomi, Samsung)
// NÃO entram aqui — vão como tokens 'generic'. Se o cliente disser "iPhone"
// queremos buscar literalmente "iPhone", não qualquer celular.
const PRODUCT_TYPE_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  // Smartphone (genérico)
  new Set(['celular', 'smartphone', 'aparelho']),
  // Tablets
  new Set(['tablet']),
  // Computadores portáteis
  new Set(['notebook', 'laptop', 'ultrabook']),
  // Computadores fixos
  new Set(['desktop', 'computador', 'pc', 'gabinete']),
  // Telas
  new Set(['monitor', 'tela']),
  new Set(['tv', 'televisao', 'televisor', 'smarttv']),
  // Wearables
  new Set(['smartwatch', 'relogio']),
  // Áudio
  new Set(['fone', 'headphone', 'earphone', 'headset']),
  new Set(['caixinha', 'caixa', 'speaker', 'soundbar']),
  // Capas e proteção
  new Set(['capa', 'capinha', 'case']),
  new Set(['pelicula', 'protetor']),
  // Cabos / energia (alvo do bug original)
  new Set(['carregador', 'fonte']),
  new Set(['cabo']),
  new Set(['adaptador']),
  new Set(['powerbank', 'bateria']),
  // Periféricos
  new Set(['mouse']), new Set(['teclado']), new Set(['webcam']),
  new Set(['microfone']), new Set(['pendrive']), new Set(['hd', 'ssd']),
  // Moda
  new Set(['camiseta', 'camisa', 'blusa']),
  new Set(['calca', 'short', 'bermuda']),
  new Set(['vestido']), new Set(['saia']),
  new Set(['jaqueta', 'casaco', 'moletom']),
  new Set(['tenis', 'sapato', 'sandalia', 'bota', 'chinelo']),
  new Set(['mochila', 'bolsa', 'carteira']),
  new Set(['cinto']), new Set(['oculos']),
  // Casa
  new Set(['liquidificador']), new Set(['airfryer', 'fritadeira']),
  new Set(['microondas']), new Set(['geladeira']),
  new Set(['fogao']), new Set(['cafeteira']), new Set(['panela']),
  new Set(['sofa']), new Set(['cadeira']), new Set(['mesa']),
  // Beleza
  new Set(['shampoo']), new Set(['condicionador']), new Set(['creme']),
  new Set(['perfume']), new Set(['batom']), new Set(['rimel']),
  // Pet
  new Set(['racao']), new Set(['coleira']), new Set(['brinquedo']),
];

// Sinônimos que conectam termo GENÉRICO a MODELO específico no haystack.
// Quando o cliente diz "celular", buscamos no produto também "iphone",
// "galaxy", "xiaomi" etc. — porque um catálogo real tem Samsung Galaxy
// cadastrado sem a palavra "celular".
//
// Mas o INVERSO não vale: cliente que diz "iphone" NÃO quer ver "galaxy".
// Por isso este mapping é unidirecional (genérico → modelos).
const GENERIC_TO_MODEL_HINTS: Record<string, string[]> = {
  celular: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  smartphone: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  aparelho: ['iphone', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'moto'],
  tablet: ['ipad'],
  notebook: ['macbook'],
  laptop: ['macbook'],
};

// Achata todos os tokens em um Set único pra check rápido.
const PRODUCT_TYPE_TOKENS = new Set<string>(
  PRODUCT_TYPE_GROUPS.flatMap((g) => Array.from(g)),
);

/**
 * Encontra o "grupo" de sinônimos ao qual um token pertence. Se dois
 * tokens estão no mesmo grupo, eles batem (cliente pode dizer "celular"
 * e o produto ser "iPhone").
 */
function getProductTypeGroup(token: string): ReadonlySet<string> | null {
  for (const g of PRODUCT_TYPE_GROUPS) {
    if (g.has(token)) return g;
  }
  return null;
}

/**
 * Stem simples para português. Cobre os casos mais comuns que aparecem
 * em chat: plural ("carregadores" → "carregador"), aumentativo simples,
 * variações de gênero. Não é um stemmer completo (Porter PT), só o
 * suficiente pra evitar miss óbvios.
 */
function simpleStem(token: string): string {
  if (token.length <= 3) return token;
  // Plurais comuns: -es, -is, -ns
  if (token.endsWith('oes')) return token.slice(0, -3) + 'ao'; // "carregadoes" raro mas...
  if (token.endsWith('aes')) return token.slice(0, -3) + 'ao';
  if (token.endsWith('res')) return token.slice(0, -2); // "carregadores" → "carregador"
  if (token.endsWith('ses')) return token.slice(0, -2); // "meses" → "mese" — ok pro nosso uso
  if (token.endsWith('ns')) return token.slice(0, -2) + 'm'; // "homens" → "homem"
  if (token.endsWith('is') && token.length > 4) return token.slice(0, -2) + 'l'; // "papéis" → "papel"
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
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
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .map(simpleStem); // normaliza plurais ("carregadores" → "carregador")
}

/**
 * Classifica um token como 'product_type', 'qualifier' ou 'generic'.
 *
 * Tokens 'product_type' são DECISIVOS: se o cliente disse "carregador" e
 * nenhum produto contém essa palavra (nem sinônimo do mesmo grupo),
 * downgrade para matchQuality: 'none'.
 */
function classifyToken(token: string): 'product_type' | 'qualifier' | 'generic' {
  if (PRODUCT_TYPE_TOKENS.has(token)) return 'product_type';
  if (QUALIFIER_TOKENS.has(token)) return 'qualifier';
  return 'generic';
}

/**
 * Verifica se um produto cobre um token de tipo do produto, considerando:
 * 1. Sinônimos do MESMO grupo (caixinha = speaker = soundbar)
 * 2. Modelos específicos quando o cliente usou termo genérico
 *    (celular → iphone/galaxy/xiaomi)
 *
 * O reverso NÃO vale: "iphone" não bate "galaxy".
 */
function productMatchesProductType(haystack: string, productTypeToken: string): boolean {
  // Bate o próprio token
  if (haystack.includes(productTypeToken)) return true;

  // Bate sinônimos do mesmo grupo (caixinha ↔ speaker)
  const group = getProductTypeGroup(productTypeToken);
  if (group) {
    for (const synonym of group) {
      if (synonym !== productTypeToken && haystack.includes(synonym)) return true;
    }
  }

  // Termo genérico do cliente bate modelos específicos no produto
  // (celular ↔ iphone/galaxy/etc).
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

@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(private readonly prisma: PrismaService) {}

  getToolDefinitions() {
    return [
      {
        name: 'search_products',
        description:
          'USE SEMPRE QUE O CLIENTE PERGUNTAR SOBRE PRODUTOS. Busca no catálogo. Retorna matchQuality ("exact"/"partial"/"none") e priceDisplay já FORMATADO em reais — sempre use o priceDisplay literal ao responder, NUNCA recalcule.',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description:
                'Texto livre com as palavras do cliente, incluindo características (cor, tamanho, marca).',
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

    // Classifica cada token. Tokens de TIPO DO PRODUTO ('carregador',
    // 'pelicula') são decisivos: se a query tem um e nenhum produto bate,
    // o resultado é 'none' mesmo que outros tokens batam.
    const tokenTypes = tokens.map((t) => ({ token: t, type: classifyToken(t) }));
    const productTypeTokens = tokenTypes
      .filter((t) => t.type === 'product_type')
      .map((t) => t.token);
    const qualifierTokens = tokenTypes
      .filter((t) => t.type === 'qualifier')
      .map((t) => t.token);

    const scored = candidates
      .map((p) => {
        const haystack = this.buildHaystack(p);
        // Match básico (substring) — usado pra qualifiers e tokens genéricos.
        const matchedTokens = tokens.filter((t) => haystack.includes(t));

        // Para PRODUCT_TYPE tokens usamos match POR GRUPO: cliente "celular"
        // bate produto "iPhone", "smartphone", "galaxy", etc.
        const matchedProductTypes = productTypeTokens.filter((t) =>
          productMatchesProductType(haystack, t),
        );
        const missedProductTypes = productTypeTokens.filter(
          (t) => !productMatchesProductType(haystack, t),
        );
        const missedQualifiers = qualifierTokens.filter((t) => !matchedTokens.includes(t));

        // Considera matchedProductTypes como "encontrados" mesmo quando o
        // token literal não estava no haystack (mas um sinônimo estava).
        const effectiveMatched = Array.from(
          new Set([...matchedTokens, ...matchedProductTypes]),
        );

        const score = this.computeScore(p, tokens, effectiveMatched, matchedProductTypes);

        return {
          product: p,
          score,
          matchedTokens: effectiveMatched,
          missedProductTypes,
          missedQualifiers,
        };
      })
      .filter((x) => x.matchedTokens.length > 0)
      .sort((a, b) => b.score - a.score);

    // Determinação de matchQuality:
    // - Se a query tem tokens de TIPO DO PRODUTO, eles DEVEM bater. Se não
    //   batem, downgrade automático para 'none' (mesmo que outros tokens
    //   batam). Isto previne o cenário "perguntou carregador, vendeu celular".
    // - Se todos os tokens batem (incluindo qualificadores) → 'exact'.
    // - Se TYPE bate mas qualificador não → 'partial' (oferecer alternativa
    //   é razoável: "não tem azul, mas tem preto").
    let matchQuality: 'exact' | 'partial' | 'none';
    let chosen: typeof scored;

    const hasProductTypeRequirement = productTypeTokens.length > 0;
    const productsWithRequiredType = scored.filter((x) => x.missedProductTypes.length === 0);

    if (hasProductTypeRequirement && productsWithRequiredType.length === 0) {
      // Cliente pediu "carregador" e NENHUM produto contém "carregador":
      // mesmo que tenhamos Galaxy S24 que bate "samsung", isso NÃO é
      // alternativa válida — é categoria errada.
      matchQuality = 'none';
      chosen = [];
    } else {
      const candidatesForChoice = hasProductTypeRequirement ? productsWithRequiredType : scored;
      const exactMatches = candidatesForChoice.filter(
        (x) => x.matchedTokens.length === tokens.length,
      );

      if (exactMatches.length > 0) {
        matchQuality = 'exact';
        chosen = exactMatches.slice(0, limit);
      } else if (candidatesForChoice.length > 0) {
        matchQuality = 'partial';
        chosen = candidatesForChoice.slice(0, limit);
      } else {
        matchQuality = 'none';
        chosen = [];
      }
    }

    this.logger.debug(
      `[search_products] query="${params.query}" tokens=[${tokens.join(', ')}] ` +
        `productType=[${productTypeTokens.join(', ')}] qualifiers=[${qualifierTokens.join(', ')}] ` +
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
        notMatched: x.missedQualifiers, // só qualificadores aqui — types já foram filtrados acima
      })),
      ...(matchQuality === 'partial' && {
        hint:
          'IMPORTANTE: Estes produtos são do tipo certo mas têm DIFERENÇAS do que o cliente pediu ' +
          '(veja "notMatched" de cada). Avise honestamente sobre a diferença antes de oferecer. ' +
          'Use priceDisplay LITERAL.',
      }),
      ...(matchQuality === 'none' &&
        hasProductTypeRequirement && {
          hint:
            `O cliente pediu produto do tipo "${productTypeTokens.join(', ')}" e a loja NÃO TEM esse tipo. ` +
            'NÃO ofereça produtos de tipo diferente. Diga honestamente que não tem e pergunte se o cliente ' +
            'aceita outro tipo de produto ou se quer ser atendido por humano.',
        }),
      ...(matchQuality === 'none' &&
        !hasProductTypeRequirement && {
          hint:
            'Nenhum produto encontrado. Peça mais detalhes (marca, modelo, faixa de preço) ' +
            'ou ofereça transferência para atendente.',
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

  /**
   * Score: matches em PRODUCT_TYPE valem MUITO mais que matches em qualifier
   * ou genérico. Garante que "carregador samsung" priorize um carregador
   * (mesmo de outra marca) sobre um Galaxy (mesmo da Samsung).
   */
  private computeScore(
    p: ProductWithRelations,
    tokens: string[],
    matched: string[],
    matchedProductTypes: string[],
  ): number {
    const nameNorm = normalize(p.name);
    const nameMatches = tokens.filter((t) => nameNorm.includes(t)).length;

    let score = matched.length * 10 + nameMatches * 20;

    // Boost forte para matches em product_type — distingue "carregador"
    // (que é o que o cliente quer) de "samsung" (incidental).
    score += matchedProductTypes.length * 50;

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
      if (perInstallmentStr) {
        installmentsDisplay = `${p.installments}x de ${perInstallmentStr}`;
      }
    }

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

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      priceDisplay: priceInfo.priceDisplay,
      priceCashDisplay: priceInfo.priceCashDisplay,
      installmentsDisplay: priceInfo.installmentsDisplay,
      fullPriceText: priceInfo.fullPriceText,
      stockText: p.trackStock
        ? p.stock > 0
          ? `${p.stock} em estoque`
          : 'sem estoque'
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
      select: { id: true, name: true, description: true },
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
