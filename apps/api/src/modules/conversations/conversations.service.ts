import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

function sanitizePage(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function sanitizePageSize(raw: unknown, def = 30, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    params: {
      status?: $Enums.ConversationStatus;
      page?: number | string;
      pageSize?: number | string;
      search?: string;
    } = {},
  ) {
    const page = sanitizePage(params.page);
    const pageSize = sanitizePageSize(params.pageSize, 30);

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(params.status && { status: params.status }),
      ...(params.search && {
        contact: {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search } },
          ],
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              pushName: true,
              phone: true,
              avatarUrl: true,
            },
          },
          assignedUser: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  async getMessages(
    tenantId: string,
    conversationId: string,
    page: number | string = 1,
    pageSize: number | string = 50,
  ) {
    await this.findOne(tenantId, conversationId);

    const p = sanitizePage(page);
    const ps = sanitizePageSize(pageSize, 50);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
      this.prisma.message.count({ where: { tenantId, conversationId } }),
    ]);

    return {
      items: items.reverse(),
      pagination: {
        page: p,
        pageSize: ps,
        total,
        totalPages: Math.ceil(total / ps),
      },
    };
  }

  async updateStatus(tenantId: string, id: string, status: $Enums.ConversationStatus) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status },
    });
  }

  async takeOver(tenantId: string, id: string, userId: string) {
    await this.findOne(tenantId, id);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) throw new BadRequestException('Usuário não pertence a este tenant');

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: $Enums.ConversationStatus.HUMAN,
        assignedUserId: userId,
      },
    });
  }

  async releaseToBot(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: $Enums.ConversationStatus.BOT,
        assignedUserId: null,
      },
    });
  }

  async resolve(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: $Enums.ConversationStatus.RESOLVED,
      },
    });
  }

  async assignUser(tenantId: string, id: string, userId: string | null) {
    await this.findOne(tenantId, id);

    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId },
      });
      if (!user) throw new BadRequestException('Usuário não pertence a este tenant');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        assignedUserId: userId,
        ...(userId && { status: $Enums.ConversationStatus.HUMAN }),
      },
    });
  }

  async markAsRead(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }
}
