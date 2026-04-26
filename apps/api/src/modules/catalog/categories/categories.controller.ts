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

import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ImportCategoryTemplateDto,
} from './dto/category.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('onlyActive') onlyActive?: string) {
    return this.service.list(tenantId, onlyActive === 'true');
  }

  // Endpoints de templates DEVEM vir antes de :id para não conflitar
  // com o roteamento dinâmico do Nest.
  @Get('templates')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post('import-template')
  @HttpCode(200)
  importTemplate(
    @CurrentTenant() tenantId: string,
    @Body() dto: ImportCategoryTemplateDto,
  ) {
    return this.service.importTemplate(tenantId, dto);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
