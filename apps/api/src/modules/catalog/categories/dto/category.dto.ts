import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
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
  slugs?: string[];
}
