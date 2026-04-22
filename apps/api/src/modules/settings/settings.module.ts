import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Injectable,
  Module,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { FAQ_TEMPLATES } from './faq-templates.data';

export class UpdateSettingsDto {
  @IsOptional() @IsString() welcomeMessage?: string;
  @IsOptional() @IsString() awayMessage?: string;
  @IsOptional() businessHours?: Record<string, any>;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsString() aiInstructions?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) handoffKeywords?: string[];
}

export class CreateFaqDto {
  @IsString() question!: string;
  @IsString() answer!: string;
  @IsArray() @IsString({ each: true }) keywords!: string[];
}

export class UpdateFaqDto {
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsString() answer?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ImportTemplateDto {
  @IsString() groupId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateQuestions?: string[];
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    let settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      settings = await this.prisma.tenantSettings.create({ data: { tenantId } });
    }
    return settings;
  }

  async updateSettings(tenantId: string, dto: UpdateSettingsDto) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });
  }

  listFaqs(tenantId: string) {
    return this.prisma.faq.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  createFaq(tenantId: string, dto: CreateFaqDto) {
    const cleanKeywords = this.cleanKeywords(dto.keywords);
    if (cleanKeywords.length === 0) {
      throw new BadRequestException('Ao menos uma palavra-chave é obrigatória');
    }
    return this.prisma.faq.create({
      data: { tenantId, ...dto, keywords: cleanKeywords },
    });
  }

  updateFaq(tenantId: string, id: string, dto: UpdateFaqDto) {
    const data = { ...dto };
    if (dto.keywords) {
      const cleanKeywords = this.cleanKeywords(dto.keywords);
      if (cleanKeywords.length === 0) {
        throw new BadRequestException('Ao menos uma palavra-chave é obrigatória');
      }
      data.keywords = cleanKeywords;
    }
    return this.prisma.faq.update({ where: { id }, data });
  }

  deleteFaq(tenantId: string, id: string) {
    return this.prisma.faq.delete({ where: { id } }).then(() => ({ ok: true }));
  }

  listTemplates() {
    return FAQ_TEMPLATES.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      segment: group.segment,
      count: group.templates.length,
      templates: group.templates,
    }));
  }

  async importTemplate(tenantId: string, dto: ImportTemplateDto) {
    const group = FAQ_TEMPLATES.find((g) => g.id === dto.groupId);
    if (!group) throw new NotFoundException('Grupo de template não encontrado');

    const toImport =
      dto.templateQuestions && dto.templateQuestions.length > 0
        ? group.templates.filter((t) => dto.templateQuestions!.includes(t.question))
        : group.templates;

    if (toImport.length === 0) {
      throw new BadRequestException('Nenhum template selecionado para importar');
    }

    const existing = await this.prisma.faq.findMany({
      where: { tenantId, question: { in: toImport.map((t) => t.question) } },
      select: { question: true },
    });
    const existingQuestions = new Set(existing.map((f) => f.question));

    const newTemplates = toImport.filter((t) => !existingQuestions.has(t.question));

    if (newTemplates.length === 0) {
      return { imported: 0, skipped: toImport.length, message: 'Todas já estavam cadastradas' };
    }

    await this.prisma.faq.createMany({
      data: newTemplates.map((t) => ({
        tenantId,
        question: t.question,
        answer: t.answer,
        keywords: t.keywords,
        active: true,
      })),
    });

    return {
      imported: newTemplates.length,
      skipped: toImport.length - newTemplates.length,
    };
  }

  private cleanKeywords(keywords: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const kw of keywords) {
      const trimmed = kw.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(trimmed);
    }
    return result;
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  get(@CurrentTenant() tenantId: string) {
    return this.service.getSettings(tenantId);
  }

  @Patch()
  update(@CurrentTenant() tenantId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(tenantId, dto);
  }

  @Get('faqs')
  listFaqs(@CurrentTenant() tenantId: string) {
    return this.service.listFaqs(tenantId);
  }

  @Post('faqs')
  createFaq(@CurrentTenant() tenantId: string, @Body() dto: CreateFaqDto) {
    return this.service.createFaq(tenantId, dto);
  }

  @Patch('faqs/:id')
  updateFaq(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.service.updateFaq(tenantId, id, dto);
  }

  @Delete('faqs/:id')
  deleteFaq(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.deleteFaq(tenantId, id);
  }

  @Get('faqs/templates')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post('faqs/import-template')
  importTemplate(@CurrentTenant() tenantId: string, @Body() dto: ImportTemplateDto) {
    return this.service.importTemplate(tenantId, dto);
  }
}

@Module({
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
