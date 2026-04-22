import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AutomationsService } from '../automations/automations.service';
import {
  APP_EVENTS,
  OutboundMessageRequestedEvent,
  ConversationHandoffRequestedEvent,
} from '../../common/events/app-events';

const DEBUG_CONTACT_PREFIX = 'debug-';

export interface DebugEvent {
  type: 'bot_reply' | 'handoff';
  content: string;
  reason?: string;
  timestamp: string;
}

@Injectable()
export class DebugService implements OnModuleInit {
  private readonly logger = new Logger(DebugService.name);

  private readonly pendingEvents = new Map<string, DebugEvent[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly automations: AutomationsService,
  ) {}

  onModuleInit() {
    this.logger.log('Debug sandbox habilitado. Use POST /debug/simulate-inbound para testar.');
  }

  async simulateInbound(tenantId: string, text: string, contactName?: string) {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      create: {
        tenantId,
        phone,
        name: contactName ?? 'Cliente Debug',
        pushName: contactName ?? 'Cliente Debug',
        metadata: { debug: true },
      },
      update: {
        ...(contactName && { name: contactName, pushName: contactName }),
      },
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        contactId: contact.id,
        status: { notIn: ['ARCHIVED', 'RESOLVED'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId,
          contactId: contact.id,
          status: 'BOT',
          metadata: { debug: true },
        },
      });
    } else if (!this.isDebugMetadata(conversation.metadata)) {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { debug: true } },
      });
    }

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'INBOUND',
        type: 'TEXT',
        content: text,
        status: 'DELIVERED',
        fromBot: false,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    this.pendingEvents.set(conversation.id, []);
    this.logger.debug(`[debug] Buffer criado para conversa ${conversation.id}`);

    try {
      await this.automations.handleIncomingMessage({
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        messageText: text,
      });
      this.logger.debug(`[debug] handleIncomingMessage retornou para ${conversation.id}`);
    } catch (err) {
      this.logger.error(`[debug] Erro em handleIncomingMessage: ${(err as Error).message}`);
    }

    const events = await this.waitForReply(conversation.id, 15_000);
    this.pendingEvents.delete(conversation.id);

    this.logger.debug(`[debug] Retornando ${events.length} eventos para ${conversation.id}`);

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      events,
    };
  }

  async resetConversation(tenantId: string) {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });

    if (!contact) return { reset: false };

    await this.prisma.conversation.deleteMany({
      where: { tenantId, contactId: contact.id },
    });

    return { reset: true };
  }

  async getHistory(tenantId: string) {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });

    if (!contact) return { messages: [], conversationId: null };

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        contactId: contact.id,
        status: { notIn: ['ARCHIVED', 'RESOLVED'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) return { messages: [], conversationId: null };

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        content: m.content,
        fromBot: m.fromBot,
        createdAt: m.createdAt,
      })),
    };
  }

  @OnEvent(APP_EVENTS.OUTBOUND_MESSAGE_REQUESTED, { async: true })
  async captureOutbound(event: OutboundMessageRequestedEvent) {
    this.logger.debug(
      `[debug] captureOutbound | conversa=${event.conversationId} | isDebug=${this.pendingEvents.has(event.conversationId)}`,
    );

    if (!this.pendingEvents.has(event.conversationId)) return;

    try {
      await this.prisma.message.create({
        data: {
          tenantId: event.tenantId,
          conversationId: event.conversationId,
          contactId: event.contactId,
          direction: 'OUTBOUND',
          type: 'TEXT',
          content: event.text,
          status: 'SENT',
          fromBot: event.fromBot,
        },
      });
    } catch (err) {
      this.logger.error(`[debug] Erro ao salvar mensagem de bot: ${(err as Error).message}`);
    }

    const captured = this.pendingEvents.get(event.conversationId);
    captured?.push({
      type: 'bot_reply',
      content: event.text,
      timestamp: new Date().toISOString(),
    });

    this.logger.debug(
      `[debug] bot_reply adicionado ao buffer de ${event.conversationId} | total=${captured?.length}`,
    );
  }

  @OnEvent(APP_EVENTS.CONVERSATION_HANDOFF_REQUESTED, { async: true })
  async captureHandoff(event: ConversationHandoffRequestedEvent) {
    this.logger.debug(
      `[debug] captureHandoff | conversa=${event.conversationId} | isDebug=${this.pendingEvents.has(event.conversationId)}`,
    );

    if (!this.pendingEvents.has(event.conversationId)) return;

    const captured = this.pendingEvents.get(event.conversationId);
    captured?.push({
      type: 'handoff',
      content: 'Conversa transferida para atendimento humano',
      reason: event.reason,
      timestamp: new Date().toISOString(),
    });
  }

  private isDebugMetadata(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object') return false;
    return (metadata as { debug?: boolean }).debug === true;
  }

  private async waitForReply(conversationId: string, timeoutMs: number): Promise<DebugEvent[]> {
    const start = Date.now();
    const pollInterval = 100;
    const quietPeriod = 300;

    let lastEventCount = 0;
    let lastChangeAt = start;

    while (Date.now() - start < timeoutMs) {
      const events = this.pendingEvents.get(conversationId) ?? [];

      if (events.length !== lastEventCount) {
        lastEventCount = events.length;
        lastChangeAt = Date.now();
      }

      if (events.length > 0 && Date.now() - lastChangeAt >= quietPeriod) {
        return [...events];
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    return [...(this.pendingEvents.get(conversationId) ?? [])];
  }
}
