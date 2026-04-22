import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { WhatsappService } from '../whatsapp.service';
import {
  APP_EVENTS,
  OutboundMessageRequestedEvent,
  ConversationHandoffRequestedEvent,
} from '../../../common/events/app-events';

@Injectable()
export class WhatsappEventsListener {
  private readonly logger = new Logger(WhatsappEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @OnEvent(APP_EVENTS.OUTBOUND_MESSAGE_REQUESTED, { async: true })
  async handleOutboundMessage(event: OutboundMessageRequestedEvent) {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: event.conversationId },
        select: { metadata: true },
      });

      if (this.isDebugConversation(conversation?.metadata)) {
        this.logger.debug(
          `Ignorando envio para conversa debug ${event.conversationId} (DebugService já processa)`,
        );
        return;
      }

      const contact = await this.prisma.contact.findUniqueOrThrow({
        where: { id: event.contactId },
      });

      const result = await this.whatsapp.sendText(event.tenantId, contact.phone, event.text);

      await this.prisma.message.create({
        data: {
          tenantId: event.tenantId,
          conversationId: event.conversationId,
          contactId: event.contactId,
          externalId: result.externalId,
          direction: 'OUTBOUND',
          type: 'TEXT',
          content: event.text,
          status: result.status === 'FAILED' ? 'FAILED' : 'SENT',
          fromBot: event.fromBot,
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar mensagem para conversa ${event.conversationId}: ${(error as Error).message}`,
      );
    }
  }

  @OnEvent(APP_EVENTS.CONVERSATION_HANDOFF_REQUESTED, { async: true })
  async handleHandoff(event: ConversationHandoffRequestedEvent) {
    try {
      await this.prisma.conversation.update({
        where: { id: event.conversationId },
        data: { status: 'HUMAN' },
      });
      this.logger.log(
        `Conversa ${event.conversationId} transferida para humano | motivo=${event.reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao processar handoff da conversa ${event.conversationId}: ${(error as Error).message}`,
      );
    }
  }

  private isDebugConversation(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object') return false;
    return (metadata as { debug?: boolean }).debug === true;
  }
}
