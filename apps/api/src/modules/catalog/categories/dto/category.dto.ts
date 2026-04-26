import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    description:
      'Descrição curta para a IA usar ao responder "o que vocês vendem?". Ex: "Smartphones Android e iOS, novos e seminovos"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Palavras-chave que ativam esta categoria na busca da IA. Aceitas com erros de digitação comuns (ex: "celular", "celulares", "smartphone"). A IA usa pra decidir se o cliente está perguntando sobre esta categoria.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ImportCategoryTemplateDto {
  @ApiProperty({
    description: 'ID do pacote de categorias (ex: "eletronicos", "moda")',
  })
  @IsString()
  groupId!: string;

  @ApiPropertyOptional({
    description: 'Slugs específicos dentro do pacote. Se omitido, importa todos.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  slugs?: string[];
}
