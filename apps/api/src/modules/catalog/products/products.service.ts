import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductWhereInput = {
      tenantId,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.active !== undefined && { active: query.active }),
      ...(query.paused !== undefined && { paused: query.paused }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        variations: { where: { active: true } },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        sku: dto.sku,
        price: dto.price,
        priceCash: dto.priceCash,
        priceInstallment: dto.priceInstallment,
        installments: dto.installments,
        stock: dto.stock,
        trackStock: dto.trackStock ?? true,
        condition: dto.condition ?? 'NEW',
        warranty: dto.warranty,
        images: dto.images ?? [],
        specifications: dto.specifications ?? Prisma.JsonNull,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    // Confirma que pertence ao tenant
    await this.findOne(tenantId, id);

    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.specifications !== undefined && {
          specifications: dto.specifications ?? Prisma.JsonNull,
        }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Toggle rápido pausar/despausar — usado no mobile pra ação de 2 toques
   */
  async togglePause(tenantId: string, id: string) {
    const product = await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { paused: !product.paused },
    });
  }

  /**
   * Ajusta estoque (+/-). Usado após venda ou reposição.
   */
  async adjustStock(tenantId: string, id: string, delta: number) {
    await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        stock: { increment: delta },
        // Auto-pausa se zerou
        ...(delta < 0 && { paused: { set: false } }),
      },
    });
  }
}
