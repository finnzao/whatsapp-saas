import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query() query: ListProductsQueryDto) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateProductDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Patch(':id/toggle-pause')
  @HttpCode(200)
  togglePause(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.togglePause(tenantId, id);
  }

  @Patch(':id/stock')
  @HttpCode(200)
  adjustStock(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body('delta') delta: number,
  ) {
    return this.service.adjustStock(tenantId, id, delta);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
