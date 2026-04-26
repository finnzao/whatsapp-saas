import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ImportCategoryTemplateDto,
} from './dto/category.dto';
import {
  CATEGORY_TEMPLATES,
  findTemplateGroup,
} from './category-templates.data';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, onlyActive = false) {
    return this.prisma.category.findMany({
      where: {
        tenantId,
        ...(onlyActive && { active: true }),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const slug = await this.ensureUniqueSlug(tenantId, this.slugify(dto.name));

    return this.prisma.category.create({
      data: {
        tenantId,
        name: dto.name,
        slug,
        description: dto.description ?? null,
        keywords: this.cleanKeywords(dto.keywords ?? []),
        order: dto.order ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(tenantId, id);

    const data: Prisma.CategoryUpdateInput = {
      ...(dto.name !== undefined && {
        name: dto.name,
        slug: await this.ensureUniqueSlug(tenantId, this.slugify(dto.name), id),
      }),
      ...(dto.description !== undefined && { description: dto.description || null }),
      ...(dto.keywords !== undefined && { keywords: this.cleanKeywords(dto.keywords) }),
      ...(dto.order !== undefined && { order: dto.order }),
      ...(dto.active !== undefined && { active: dto.active }),
    };

    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const productCount = await this.prisma.product.count({
      where: { tenantId, categoryId: id },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Não é possível remover: ${productCount} produto(s) ainda usam esta categoria. Mova-os antes ou desative a categoria.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Lista pacotes de categorias-padrão por segmento. Cada pacote contém
   * categorias com `description` curta e prática para a IA usar.
   */
  listTemplates() {
    return CATEGORY_TEMPLATES.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      segment: g.segment,
      count: g.categories.length,
      categories: g.categories,
    }));
  }

  /**
   * Importa um pacote de categorias para o tenant. Pula slugs que já
   * existem (idempotente — pode ser chamado múltiplas vezes sem duplicar).
   */
  async importTemplate(tenantId: string, dto: ImportCategoryTemplateDto) {
    const group = findTemplateGroup(dto.groupId);
    if (!group) throw new NotFoundException('Pacote de categorias não encontrado');

    const toImport =
      dto.slugs && dto.slugs.length > 0
        ? group.categories.filter((c) => dto.slugs!.includes(c.slug))
        : group.categories;

    if (toImport.length === 0) {
      throw new BadRequestException('Nenhuma categoria selecionada para importar');
    }

    // Pega as ordens já usadas pra continuar a numeração sem colidir.
    const existing = await this.prisma.category.findMany({
      where: { tenantId },
      select: { slug: true, order: true },
    });
    const existingSlugs = new Set(existing.map((c) => c.slug));
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), 0);

    const newOnes = toImport.filter((c) => !existingSlugs.has(c.slug));

    if (newOnes.length === 0) {
      return {
        imported: 0,
        skipped: toImport.length,
        message: 'Todas as categorias do pacote já estavam cadastradas',
      };
    }

    await this.prisma.category.createMany({
      data: newOnes.map((c, i) => ({
        tenantId,
        name: c.name,
        slug: c.slug,
        description: c.description,
        keywords: this.cleanKeywords(c.keywords),
        order: maxOrder + i + 1,
        active: true,
      })),
    });

    return {
      imported: newOnes.length,
      skipped: toImport.length - newOnes.length,
    };
  }

  /**
   * Normaliza as keywords igual o FAQ faz: trim, lowercase, deduplica
   * por forma normalizada (sem acento), descarta vazios.
   *
   * Mantém a forma ORIGINAL no array (com acentos) pra ficar bonito no
   * UI. A normalização sem acento serve só pra deduplicar — se o usuário
   * digitar "celular" e depois "Celulares" eles continuam separados,
   * mas "celular" e "celular " viram um só.
   */
  private cleanKeywords(keywords: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const kw of keywords) {
      if (typeof kw !== 'string') continue;
      const trimmed = kw.trim();
      if (!trimmed) continue;
      const fingerprint = trimmed
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      result.push(trimmed.toLowerCase());
    }
    return result;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  /**
   * Garante slug único dentro do tenant. Se houver colisão, sufixa com
   * número (ex: "smartphones-2"). Aceita um `excludeId` pra não conflitar
   * com a própria categoria em update.
   */
  private async ensureUniqueSlug(
    tenantId: string,
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const existing = await this.prisma.category.findFirst({
        where: {
          tenantId,
          slug,
          ...(excludeId && { NOT: { id: excludeId } }),
        },
      });
      if (!existing) return slug;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
  }
}
