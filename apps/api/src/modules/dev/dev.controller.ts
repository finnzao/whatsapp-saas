import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DevService, DevEntity } from './dev.service';
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
  constructor(private readonly service: DevService) {}

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
}
