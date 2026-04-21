import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: { status?: ConversationStatus; page?: number; pageSize?: number } = {},
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 30;

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(filters.status && { status: filters.status }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, pushName: true, phone: true, avatarUrl: true } },
          assignedUser: { select: { id: true, name: true } },
        },
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { items, pagination: { page, pageSize, total } };
  }

  async findOne(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        assignedUser: { select: { id: true, name: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  async getMessages(tenantId: string, id: string, page = 1, pageSize = 50) {
    await this.findOne(tenantId, id);

    const messages = await this.prisma.message.findMany({
      where: { conversationId: id, tenantId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: messages.reverse(), pagination: { page, pageSize } };
  }

  /**
   * Lojista assume a conversa — pausa o bot
   */
  async takeOver(tenantId: string, id: string, userId: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'HUMAN', assignedUserId: userId },
    });
  }

  /**
   * Devolve conversa pro bot
   */
  async releaseToBot(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'BOT', assignedUserId: null },
    });
  }

  async resolve(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'RESOLVED' },
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
