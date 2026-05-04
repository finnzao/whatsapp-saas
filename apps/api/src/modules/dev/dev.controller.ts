import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { DevService, DevEntity } from './dev.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { TrainingDataService } from './training-data.service';
import { EmbeddingService } from '../ai/embeddings/embedding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

const VALID_ENTITIES: DevEntity[] = [
  'products',
  'contacts',
  'conversations',
  'messages',
  'faqs',
  'customFields',
  'settings',
  'orders',
  'categories',
];

function assertEntity(entity: string): DevEntity {
  if (!VALID_ENTITIES.includes(entity as DevEntity)) {
    throw new BadRequestException(
      `Entity inválida: "${entity}". Válidas: ${VALID_ENTITIES.join(', ')}`,
    );
  }
  return entity as DevEntity;
}

@ApiTags('dev')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dev')
export class DevController {
  constructor(
    private readonly service: DevService,
    private readonly searchAnalytics: SearchAnalyticsService,
    private readonly trainingData: TrainingDataService,
    private readonly embeddings: EmbeddingService,
  ) {}

  // -----------------------------------------------------------
  // Endpoints originais (preservados)
  // -----------------------------------------------------------

  @Get('overview')
  overview(@CurrentTenant() tenantId: string) {
    return this.service.overview(tenantId);
  }

  @Get('entities/:entity')
  list(
    @CurrentTenant() tenantId: string,
    @Param('entity') entity: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(tenantId, assertEntity(entity), Number(limit) || 50);
  }

  @Delete('entities/:entity/:id')
  deleteOne(
    @CurrentTenant() tenantId: string,
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteOne(tenantId, assertEntity(entity), id);
  }

  @Delete('entities/:entity')
  deleteAll(@CurrentTenant() tenantId: string, @Param('entity') entity: string) {
    return this.service.deleteAll(tenantId, assertEntity(entity));
  }

  @Post('test-search')
  testSearch(
    @CurrentTenant() tenantId: string,
    @Body() body: { query: string; limit?: number },
  ) {
    return this.service.testSearch(tenantId, body.query ?? '', body.limit ?? 10);
  }

  @Post('seed')
  seed(@CurrentTenant() tenantId: string) {
    return this.service.seed(tenantId);
  }

  // -----------------------------------------------------------
  // SEARCH ANALYTICS (novo)
  // -----------------------------------------------------------

  @Get('search/overview')
  searchOverview(@CurrentTenant() tenantId: string) {
    return this.searchAnalytics.getOverview(tenantId);
  }

  @Get('search/recent')
  recentSearches(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchAnalytics.listRecentSearches(tenantId, Number(limit) || 50);
  }

  @Get('search/zero-results')
  zeroResults(
    @CurrentTenant() tenantId: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchAnalytics.listZeroResultQueries(
      tenantId,
      Number(days) || 30,
      Number(limit) || 100,
    );
  }

  // -----------------------------------------------------------
  // EMBEDDINGS (novo)
  // -----------------------------------------------------------

  @Get('embeddings/stats')
  async embeddingsStats(@CurrentTenant() tenantId: string) {
    const [stats, available] = await Promise.all([
      this.embeddings.getStats(tenantId),
      this.embeddings.isProviderAvailable(),
    ]);
    return { ...stats, providerAvailable: available };
  }

  @Post('embeddings/backfill')
  async backfill(@CurrentTenant() tenantId: string) {
    return this.embeddings.backfillTenant(tenantId);
  }

  // -----------------------------------------------------------
  // TRAINING DATA (novo) — pra fine-tune futuro do embedder
  // -----------------------------------------------------------

  @Get('training-data/stats')
  trainingStats(@CurrentTenant() tenantId: string) {
    return this.trainingData.getStats(tenantId);
  }

  /**
   * Exporta JSONL pronto pro `sentence-transformers`. Use:
   *   curl -H "Authorization: Bearer ..." \
   *        -o triplets.jsonl \
   *        http://localhost:3001/dev/training-data/export?format=triplets
   */
  @Get('training-data/export')
  async exportTrainingData(
    @CurrentTenant() tenantId: string,
    @Query('format') format: 'triplets' | 'pairs' = 'triplets',
    @Query('days') days?: string,
    @Res() res?: Response,
  ) {
    const daysBack = Number(days) || 180;
    const data =
      format === 'pairs'
        ? await this.trainingData.exportPairs(tenantId, { daysBack })
        : await this.trainingData.exportTriplets(tenantId, { daysBack });

    if (!res) return data;

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="training-${format}-${tenantId.slice(0, 8)}.jsonl"`);
    for (const row of data) {
      res.write(JSON.stringify(row) + '\n');
    }
    res.end();
  }
}
