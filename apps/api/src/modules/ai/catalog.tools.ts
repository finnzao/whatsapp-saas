import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Ferramentas expostas à IA via function calling.
 * A IA decide quando chamar cada uma baseado na mensagem do cliente.
 */
@Injectable()
export class CatalogTools {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Definições das tools no formato Anthropic/OpenAI.
   * Mesmo formato funciona pros dois com pequenas adaptações.
   */
  getToolDefinitions() {
    return [
      {
        name: 'search_products',
        description:
          'Busca produtos no catálogo da loja por nome, marca, modelo ou categoria. Use quando o cliente perguntar sobre um produto específico.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Texto de busca (nome, marca, modelo)' },
            maxPrice: { type: 'number', description: 'Preço máximo em reais (opcional)' },
            minPrice: { type: 'number', description: 'Preço mínimo em reais (opcional)' },
            limit: { type: 'number', description: 'Quantos produtos retornar (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'check_product_availability',
        description: 'Verifica se um produto específico está disponível e com estoque.',
        input_schema: {
          type: 'object' as const,
          properties: {
            productId: { type: 'string', description: 'ID do produto' },
          },
          required: ['productId'],
        },
      },
      {
        name: 'list_categories',
        description: 'Lista as categorias de produtos disponíveis na loja.',
        input_schema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'request_human_handoff',
        description:
          'Transfere a conversa para um atendente humano. Use quando o cliente pedir, estiver irritado, ou em casos que fogem do seu escopo (assistência técnica, reclamação, negociação de desconto).',
        input_schema: {
          type: 'object' as const,
          properties: {
            reason: { type: 'string', description: 'Motivo da transferência' },
          },
          required: ['reason'],
        },
      },
    ];
  }

  // -------------------------------------------------------------------
  // Implementação das tools
  // -------------------------------------------------------------------

  async searchProducts(
    tenantId: string,
    params: { query: string; maxPrice?: number; minPrice?: number; limit?: number },
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        paused: false,
        ...(params.maxPrice && { price: { lte: params.maxPrice } }),
        ...(params.minPrice && { price: { gte: params.minPrice } }),
        OR: [
          { name: { contains: params.query, mode: 'insensitive' } },
          { description: { contains: params.query, mode: 'insensitive' } },
          { sku: { contains: params.query, mode: 'insensitive' } },
        ],
      },
      include: {
        category: { select: { name: true } },
        variations: { where: { active: true } },
      },
      take: params.limit ?? 5,
      orderBy: { stock: 'desc' },
    });

    return products.map((p) => ({
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
      variations: p.variations.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price ? Number(v.price) : null,
        stock: v.stock,
      })),
    }));
  }

  async checkProductAvailability(tenantId: string, productId: string) {
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
      },
    });

    if (!product) return { found: false };

    return {
      found: true,
      name: product.name,
      price: Number(product.price),
      available: product.active && !product.paused && (!product.trackStock || product.stock > 0),
      stock: product.stock,
    };
  }

  async listCategories(tenantId: string) {
    const categories = await this.prisma.category.findMany({
      where: { tenantId, active: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true },
    });
    return categories;
  }

  /**
   * Executa uma tool pelo nome. Usado pelo orquestrador da IA.
   */
  async execute(tenantId: string, toolName: string, input: any) {
    switch (toolName) {
      case 'search_products':
        return this.searchProducts(tenantId, input);
      case 'check_product_availability':
        return this.checkProductAvailability(tenantId, input.productId);
      case 'list_categories':
        return this.listCategories(tenantId);
      case 'request_human_handoff':
        return { handoff: true, reason: input.reason };
      default:
        return { error: `Tool desconhecida: ${toolName}` };
    }
  }
}
