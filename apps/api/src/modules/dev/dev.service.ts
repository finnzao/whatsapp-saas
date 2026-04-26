import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from '../ai/catalog.tools';

export type DevEntity =
  | 'products'
  | 'contacts'
  | 'conversations'
  | 'messages'
  | 'faqs'
  | 'customFields'
  | 'settings'
  | 'orders'
  | 'categories';

@Injectable()
export class DevService {
  private readonly logger = new Logger(DevService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogTools,
  ) {}

  async overview(tenantId: string) {
    const [
      products,
      activeProducts,
      contacts,
      conversations,
      messages,
      faqs,
      customFields,
      orders,
      categories,
    ] = await Promise.all([
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { tenantId, active: true, paused: false } }),
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.message.count({ where: { tenantId } }),
      this.prisma.faq.count({ where: { tenantId } }),
      this.prisma.customFieldDefinition.count({ where: { tenantId } }),
      this.prisma.order.count({ where: { tenantId } }),
      this.prisma.category.count({ where: { tenantId } }),
    ]);

    return {
      tenantId,
      counts: {
        products,
        activeProducts,
        contacts,
        conversations,
        messages,
        faqs,
        customFields,
        orders,
        categories,
      },
    };
  }

  async list(tenantId: string, entity: DevEntity, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

    switch (entity) {
      case 'products':
        return this.prisma.product.findMany({
          where: { tenantId },
          include: { category: { select: { name: true } } },
          orderBy: { updatedAt: 'desc' },
          take,
        });

      case 'contacts':
        return this.prisma.contact.findMany({
          where: { tenantId },
          orderBy: { updatedAt: 'desc' },
          take,
        });

      case 'conversations':
        return this.prisma.conversation.findMany({
          where: { tenantId },
          include: {
            contact: { select: { name: true, phone: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take,
        });

      case 'messages':
        return this.prisma.message.findMany({
          where: { tenantId },
          include: { contact: { select: { name: true, phone: true } } },
          orderBy: { createdAt: 'desc' },
          take,
        });

      case 'faqs':
        return this.prisma.faq.findMany({
          where: { tenantId },
          orderBy: { priority: 'desc' },
          take,
        });

      case 'customFields':
        return this.prisma.customFieldDefinition.findMany({
          where: { tenantId },
          orderBy: [{ entity: 'asc' }, { order: 'asc' }],
          take,
        });

      case 'settings':
        return this.prisma.tenantSettings.findUnique({ where: { tenantId } });

      case 'orders':
        return this.prisma.order.findMany({
          where: { tenantId },
          include: {
            contact: { select: { name: true, phone: true } },
            items: true,
          },
          orderBy: { createdAt: 'desc' },
          take,
        });

      case 'categories':
        return this.prisma.category.findMany({
          where: { tenantId },
          orderBy: { order: 'asc' },
          take,
        });

      default:
        throw new BadRequestException(`Entity desconhecida: ${entity}`);
    }
  }

  async deleteOne(tenantId: string, entity: DevEntity, id: string) {
    const record = await this.findForDelete(tenantId, entity, id);
    if (!record) throw new NotFoundException(`${entity} não encontrado ou não pertence ao tenant`);

    const model = this.getModel(entity);
    await (model as any).delete({ where: { id } });
    this.logger.warn(`[DEV] DELETE ${entity}/${id} por tenant ${tenantId}`);
    return { ok: true, deleted: { entity, id } };
  }

  async deleteAll(tenantId: string, entity: DevEntity) {
    if (entity === 'settings') {
      throw new BadRequestException('Não é possível deletar todas as settings do tenant');
    }

    const model = this.getModel(entity);
    const result = await (model as any).deleteMany({ where: { tenantId } });
    this.logger.warn(`[DEV] DELETE ALL ${entity} = ${result.count} registros do tenant ${tenantId}`);
    return { ok: true, deleted: result.count, entity };
  }

  async testSearch(tenantId: string, query: string, limit = 10) {
    const searchResult = await this.catalog.searchProducts(tenantId, { query, limit });
    return {
      query,
      tokens: this.extractTokens(query),
      matchQuality: searchResult.matchQuality,
      totalCandidates: searchResult.totalCandidates,
      resultsCount: searchResult.results.length,
      hint: searchResult.hint,
      results: searchResult.results,
    };
  }

  async seed(tenantId: string) {
    const colorDef = await this.prisma.customFieldDefinition.upsert({
      where: { tenantId_entity_key: { tenantId, entity: 'product', key: 'cor' } },
      update: {},
      create: {
        tenantId,
        entity: 'product',
        key: 'cor',
        label: 'Cor',
        type: 'SELECT',
        options: ['Preto', 'Branco', 'Azul', 'Laranja', 'Vermelho', 'Rosa', 'Verde'],
        required: false,
        order: 1,
      },
    });

    const storageDef = await this.prisma.customFieldDefinition.upsert({
      where: { tenantId_entity_key: { tenantId, entity: 'product', key: 'armazenamento' } },
      update: {},
      create: {
        tenantId,
        entity: 'product',
        key: 'armazenamento',
        label: 'Armazenamento',
        type: 'SELECT',
        options: ['64GB', '128GB', '256GB', '512GB', '1TB'],
        required: false,
        order: 2,
      },
    });

    const category = await this.prisma.category.upsert({
      where: { tenantId_slug: { tenantId, slug: 'smartphones' } },
      update: {},
      create: {
        tenantId,
        name: 'Smartphones',
        slug: 'smartphones',
        active: true,
        order: 0,
      },
    });

    const productDefs = [
      {
        name: 'iPhone 13',
        sku: 'IPH13-128-LAR',
        price: 4299,
        stock: 3,
        customFields: { cor: 'Laranja', armazenamento: '128GB' },
      },
      {
        name: 'iPhone 13',
        sku: 'IPH13-128-AZU',
        price: 4299,
        stock: 5,
        customFields: { cor: 'Azul', armazenamento: '128GB' },
      },
      {
        name: 'iPhone 15',
        sku: 'IPH15-256-PRE',
        price: 6999,
        stock: 2,
        customFields: { cor: 'Preto', armazenamento: '256GB' },
      },
      {
        name: 'Samsung Galaxy S24',
        sku: 'SGS24-256-VER',
        price: 5499,
        stock: 4,
        customFields: { cor: 'Verde', armazenamento: '256GB' },
      },
    ];

    const seededProducts = [] as any[];
    for (const def of productDefs) {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, sku: def.sku },
      });
      if (existing) {
        seededProducts.push({ ...existing, _skipped: true });
        continue;
      }
      const created = await this.prisma.product.create({
        data: {
          tenantId,
          categoryId: category.id,
          name: def.name,
          sku: def.sku,
          price: def.price,
          stock: def.stock,
          trackStock: true,
          condition: 'NEW',
          active: true,
          paused: false,
          images: [],
          customFields: def.customFields,
        },
      });
      seededProducts.push(created);
    }

    const faqDefs = [
      {
        question: 'Qual o horário de funcionamento?',
        answer: 'Funcionamos de segunda a sábado, das 9h às 18h. Aos domingos ficamos fechados.',
        keywords: ['horário', 'horarios', 'funcionamento', 'que horas', 'abre', 'fecha'],
      },
      {
        question: 'Vocês entregam?',
        answer: 'Sim! Fazemos entregas na região e enviamos pelo correio para outras cidades.',
        keywords: ['entrega', 'entregam', 'correio', 'sedex', 'frete'],
      },
      {
        question: 'Quais formas de pagamento?',
        answer: 'Aceitamos PIX, débito, crédito em até 12x e dinheiro. Cartão com desconto no PIX!',
        keywords: ['pagamento', 'pagar', 'pix', 'cartão', 'dinheiro', 'parcelar'],
      },
    ];

    const seededFaqs = [] as any[];
    for (const faq of faqDefs) {
      const existing = await this.prisma.faq.findFirst({
        where: { tenantId, question: faq.question },
      });
      if (existing) {
        seededFaqs.push({ ...existing, _skipped: true });
        continue;
      }
      const created = await this.prisma.faq.create({
        data: { tenantId, ...faq, active: true, priority: 0 },
      });
      seededFaqs.push(created);
    }

    return {
      ok: true,
      seeded: {
        customFieldDefinitions: [colorDef, storageDef],
        category,
        products: seededProducts,
        faqs: seededFaqs,
      },
      summary: `${seededProducts.filter((p) => !p._skipped).length} produtos novos, ${seededFaqs.filter((f) => !f._skipped).length} FAQs novas`,
    };
  }

  private getModel(entity: DevEntity) {
    const map: Record<DevEntity, any> = {
      products: this.prisma.product,
      contacts: this.prisma.contact,
      conversations: this.prisma.conversation,
      messages: this.prisma.message,
      faqs: this.prisma.faq,
      customFields: this.prisma.customFieldDefinition,
      settings: this.prisma.tenantSettings,
      orders: this.prisma.order,
      categories: this.prisma.category,
    };
    const model = map[entity];
    if (!model) throw new BadRequestException(`Entity desconhecida: ${entity}`);
    return model;
  }

  private async findForDelete(tenantId: string, entity: DevEntity, id: string): Promise<unknown> {
    const model = this.getModel(entity);
    const record = await (model as any).findFirst({ where: { id, tenantId } });
    return record;
  }

  private extractTokens(query: string): string[] {
    return query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }
}
