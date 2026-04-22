import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Injectable,
  Module,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export class CreateCustomFieldDto {
  @IsString() entity!: string;

  @IsString()
  @Matches(KEY_PATTERN, {
    message: 'key deve começar com letra minúscula e conter apenas letras, números e underscore',
  })
  key!: string;

  @IsString() label!: string;
  @IsEnum($Enums.CustomFieldType) type!: $Enums.CustomFieldType;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() placeholder?: string;
  @IsOptional() @IsString() helpText?: string;
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() placeholder?: string;
  @IsOptional() @IsString() helpText?: string;
}

export interface CustomFieldValue {
  [key: string]: unknown;
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, entity?: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { tenantId, ...(entity && { entity }) },
      orderBy: [{ entity: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const field = await this.prisma.customFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!field) throw new NotFoundException('Campo personalizado não encontrado');
    return field;
  }

  async create(tenantId: string, dto: CreateCustomFieldDto) {
    const needsOptions =
      dto.type === $Enums.CustomFieldType.SELECT || dto.type === $Enums.CustomFieldType.MULTISELECT;
    if (needsOptions && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('Campos do tipo SELECT/MULTISELECT precisam de opções');
    }

    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: {
        tenantId_entity_key: { tenantId, entity: dto.entity, key: dto.key },
      },
    });
    if (existing) {
      throw new BadRequestException(`Já existe um campo com a chave "${dto.key}" para ${dto.entity}`);
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        entity: dto.entity,
        key: dto.key,
        label: dto.label,
        type: dto.type,
        options: dto.options ?? [],
        required: dto.required ?? false,
        order: dto.order ?? 0,
        placeholder: dto.placeholder,
        helpText: dto.helpText,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomFieldDto) {
    await this.findOne(tenantId, id);
    return this.prisma.customFieldDefinition.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.customFieldDefinition.delete({ where: { id } });
    return { ok: true };
  }

  async validateAndSanitize(
    tenantId: string,
    entity: string,
    values: CustomFieldValue | null | undefined,
  ): Promise<Prisma.InputJsonValue | null> {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId, entity },
    });

    if (definitions.length === 0) {
      return values && Object.keys(values).length > 0 ? (values as Prisma.InputJsonValue) : null;
    }

    const input = values ?? {};
    const result: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const def of definitions) {
      const raw = input[def.key];

      if (raw === undefined || raw === null || raw === '') {
        if (def.required) errors.push(`Campo "${def.label}" é obrigatório`);
        continue;
      }

      const parsed = this.parseValue(def, raw);
      if (parsed.error) {
        errors.push(`Campo "${def.label}": ${parsed.error}`);
        continue;
      }
      result[def.key] = parsed.value;
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }

    return Object.keys(result).length > 0 ? (result as Prisma.InputJsonValue) : null;
  }

  private parseValue(
    def: { type: $Enums.CustomFieldType; options: string[] },
    raw: unknown,
  ): { value?: unknown; error?: string } {
    switch (def.type) {
      case $Enums.CustomFieldType.TEXT:
      case $Enums.CustomFieldType.TEXTAREA:
        return { value: String(raw) };

      case $Enums.CustomFieldType.NUMBER: {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) return { error: 'deve ser um número' };
        return { value: n };
      }

      case $Enums.CustomFieldType.BOOLEAN:
        return { value: Boolean(raw) };

      case $Enums.CustomFieldType.SELECT: {
        const value = String(raw);
        if (!def.options.includes(value)) {
          return { error: `valor "${value}" não está nas opções permitidas` };
        }
        return { value };
      }

      case $Enums.CustomFieldType.MULTISELECT: {
        const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        const invalid = arr.filter((v) => !def.options.includes(v));
        if (invalid.length > 0) {
          return { error: `valores inválidos: ${invalid.join(', ')}` };
        }
        return { value: arr };
      }

      case $Enums.CustomFieldType.DATE: {
        const date = new Date(String(raw));
        if (isNaN(date.getTime())) return { error: 'data inválida' };
        return { value: date.toISOString() };
      }

      case $Enums.CustomFieldType.COLOR: {
        const value = String(raw);
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
          return { error: 'deve ser uma cor hexadecimal (#rrggbb)' };
        }
        return { value };
      }

      default:
        return { value: raw };
    }
  }
}

@ApiTags('custom-fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('entity') entity?: string) {
    return this.service.list(tenantId, entity);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCustomFieldDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}

@Module({
  providers: [CustomFieldsService],
  controllers: [CustomFieldsController],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
