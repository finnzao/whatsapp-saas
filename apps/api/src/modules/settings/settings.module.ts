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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

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
    return this.prisma.faq.create({ data: { tenantId, ...dto } });
  }

  updateFaq(tenantId: string, id: string, dto: UpdateFaqDto) {
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  deleteFaq(tenantId: string, id: string) {
    return this.prisma.faq.delete({ where: { id } }).then(() => ({ ok: true }));
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
}

@Module({
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
