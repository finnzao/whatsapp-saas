import { Controller, Get, Query, UseGuards, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from '../ai/catalog.tools';

@Injectable()
export class CatalogDiagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogTools,
  ) {}

  async inspect(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        sku: true,
        active: true,
        paused: true,
        stock: true,
        customFields: true,
        category: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const total = await this.prisma.product.count({ where: { tenantId } });
    const active = await this.prisma.product.count({
      where: { tenantId, active: true, paused: false },
    });

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId, entity: 'product' },
    });

    return {
      summary: { total, active, inactive: total - active },
      customFieldDefinitions: definitions.map((d) => ({
        key: d.key,
        label: d.label,
        type: d.type,
        options: d.options,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        active: p.active,
        paused: p.paused,
        stock: p.stock,
        category: p.category?.name,
        customFields: p.customFields,
        visibleToAi: p.active && !p.paused,
      })),
    };
  }

  async testSearch(tenantId: string, query: string) {
    const results = await this.catalog.searchProducts(tenantId, { query, limit: 10 });
    return {
      query,
      resultsCount: results.length,
      results,
    };
  }
}

@ApiTags('debug')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('debug/catalog')
export class CatalogDiagController {
  constructor(private readonly service: CatalogDiagService) {}

  @Get('inspect')
  inspect(@CurrentTenant() tenantId: string) {
    return this.service.inspect(tenantId);
  }

  @Get('search')
  testSearch(@CurrentTenant() tenantId: string, @Query('q') query: string) {
    return this.service.testSearch(tenantId, query ?? '');
  }
}
