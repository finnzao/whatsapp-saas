import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto/product.dto';
import { CustomFieldsService } from '../custom-fields/custom-fields.module';

const PRODUCT_ENTITY = 'product';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customFields: CustomFieldsService,
  ) {}

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
    const customFields = await this.customFields.validateAndSanitize(
      tenantId,
      PRODUCT_ENTITY,
      dto.customFields,
    );

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
        specifications:
          (dto.specifications as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        customFields: customFields ?? Prisma.JsonNull,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(tenantId, id);

    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.categoryId !== undefined && {
        category: dto.categoryId
          ? { connect: { id: dto.categoryId } }
          : { disconnect: true },
      }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.priceCash !== undefined && { priceCash: dto.priceCash }),
      ...(dto.priceInstallment !== undefined && { priceInstallment: dto.priceInstallment }),
      ...(dto.installments !== undefined && { installments: dto.installments }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.trackStock !== undefined && { trackStock: dto.trackStock }),
      ...(dto.condition !== undefined && { condition: dto.condition }),
      ...(dto.warranty !== undefined && { warranty: dto.warranty }),
      ...(dto.images !== undefined && { images: dto.images }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.paused !== undefined && { paused: dto.paused }),
      ...(dto.specifications !== undefined && {
        specifications:
          (dto.specifications as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      }),
    };

    if (dto.customFields !== undefined) {
      const customFields = await this.customFields.validateAndSanitize(
        tenantId,
        PRODUCT_ENTITY,
        dto.customFields,
      );
      data.customFields = customFields ?? Prisma.JsonNull;
    }

    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  async togglePause(tenantId: string, id: string) {
    const product = await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { paused: !product.paused },
    });
  }

  async adjustStock(tenantId: string, id: string, delta: number) {
    await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        stock: { increment: delta },
        ...(delta < 0 && { paused: { set: false } }),
      },
    });
  }
}
