import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES, JOB_NAMES } from '../../../queue/queue.constants';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WhatsappService } from '../whatsapp.service';
import {
  EvolutionWebhookEvent,
  MessageUpsertData,
  ConnectionUpdateData,
  QrCodeUpdateData,
} from './evolution-events.dto';
import { AiService } from '../../ai/ai.service';
import { AutomationsService } from '../../automations/automations.service';

/**
 * Worker que processa eventos do WhatsApp recebidos via webhook.
 *
 * Fluxo de mensagem recebida:
 * 1. Resolve tenant pela instanceName
 * 2. Ignora mensagens da própria conta (fromMe)
 * 3. Cria/atualiza Contact
 * 4. Cria/obtém Conversation
 * 5. Salva Message
 * 6. Se conversa está em modo BOT, aciona classificação/resposta
 */
@Processor(QUEUE_NAMES.INBOUND_MESSAGES)
export class InboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly automations: AutomationsService,
    private readonly ai: AiService,
  ) {
    super();
  }

  async process(job: Job<{ type: string; event: EvolutionWebhookEvent }>) {
    const { type, event } = job.data;

    try {
      switch (type) {
        case 'message':
          return await this.handleMessageUpsert(event);
        case 'connection':
          return await this.handleConnectionUpdate(event);
        case 'qrcode':
          return await this.handleQrCodeUpdate(event);
        case 'status':
          return await this.handleMessageStatus(event);
      }
    } catch (error) {
      this.logger.error(`Erro processando ${type}: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  // -------------------------------------------------------------------
  // Mensagem recebida
  // -------------------------------------------------------------------

  private async handleMessageUpsert(event: EvolutionWebhookEvent) {
    const data: MessageUpsertData = event.data;

    // Ignora mensagem enviada pela própria conta do lojista
    if (data.key?.fromMe) {
      return { ignored: 'fromMe' };
    }

    // Ignora mensagens de grupo por enquanto (contém @g.us no remoteJid)
    if (data.key?.remoteJid?.includes('@g.us')) {
      return { ignored: 'group' };
    }

    const instance = await this.whatsapp.findInstanceByName(event.instance);
    if (!instance) {
      this.logger.warn(`Instância não encontrada: ${event.instance}`);
      return { ignored: 'no-instance' };
    }

    const phone = this.extractPhone(data.key.remoteJid);
    const content = this.extractMessageContent(data);

    // Upsert do contato
    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_phone: { tenantId: instance.tenantId, phone },
      },
      create: {
        tenantId: instance.tenantId,
        phone,
        pushName: data.pushName,
      },
      update: {
        pushName: data.pushName ?? undefined,
      },
    });

    if (contact.blocked) {
      return { ignored: 'blocked' };
    }

    // Obtém ou cria conversa ativa (não arquivada)
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId: instance.tenantId,
        contactId: contact.id,
        status: { notIn: ['ARCHIVED', 'RESOLVED'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId: instance.tenantId,
          contactId: contact.id,
          status: 'BOT',
        },
      });
    }

    // Salva a mensagem
    const message = await this.prisma.message.create({
      data: {
        tenantId: instance.tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        externalId: data.key.id,
        direction: 'INBOUND',
        type: content.type,
        content: content.text,
        mediaUrl: content.mediaUrl,
        mediaMimeType: content.mediaMimeType,
        status: 'DELIVERED',
        fromBot: false,
      },
    });

    // Atualiza conversa
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    this.logger.log(
      `Mensagem recebida | tenant=${instance.tenantId} contato=${phone} msg=${message.id}`,
    );

    // Se conversa está em modo humano, não aciona bot — só registra
    if (conversation.status === 'HUMAN') {
      return { handled: 'human-mode' };
    }

    // Dispara fluxo automatizado (FAQ -> IA -> handoff)
    await this.automations.handleIncomingMessage({
      tenantId: instance.tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      messageText: content.text ?? '',
    });

    return { handled: 'bot-triggered', messageId: message.id };
  }

  // -------------------------------------------------------------------
  // Conexão (status da instância)
  // -------------------------------------------------------------------

  private async handleConnectionUpdate(event: EvolutionWebhookEvent) {
    const data: ConnectionUpdateData = event.data;
    const instance = await this.whatsapp.findInstanceByName(event.instance);
    if (!instance) return;

    const status = this.mapConnectionState(data.state);

    await this.prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status,
        ...(status === 'CONNECTED' && { lastConnectedAt: new Date(), qrCode: null }),
      },
    });

    this.logger.log(`Conexão atualizada | instance=${event.instance} status=${status}`);
  }

  // -------------------------------------------------------------------
  // QR Code atualizado
  // -------------------------------------------------------------------

  private async handleQrCodeUpdate(event: EvolutionWebhookEvent) {
    const data: QrCodeUpdateData = event.data;
    const instance = await this.whatsapp.findInstanceByName(event.instance);
    if (!instance) return;

    await this.prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        qrCode: data.qrcode?.base64 ?? null,
        status: 'QRCODE',
      },
    });
  }

  // -------------------------------------------------------------------
  // Status de mensagem (entregue, lida)
  // -------------------------------------------------------------------

  private async handleMessageStatus(event: EvolutionWebhookEvent) {
    const data = event.data;
    if (!data?.key?.id) return;

    const statusMap: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
      SERVER_ACK: 'SENT',
      DELIVERY_ACK: 'DELIVERED',
      READ: 'READ',
      PLAYED: 'READ',
      ERROR: 'FAILED',
    };

    const status = statusMap[data.status];
    if (!status) return;

    await this.prisma.message
      .update({
        where: { externalId: data.key.id },
        data: { status },
      })
      .catch(() => null);
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private extractPhone(remoteJid: string): string {
    return remoteJid.split('@')[0].replace(/\D/g, '');
  }

  private extractMessageContent(data: MessageUpsertData): {
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'LOCATION' | 'STICKER' | 'SYSTEM';
    text?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
  } {
    const msg = data.message;
    if (!msg) return { type: 'SYSTEM' };

    if (msg.conversation) {
      return { type: 'TEXT', text: msg.conversation };
    }
    if (msg.extendedTextMessage?.text) {
      return { type: 'TEXT', text: msg.extendedTextMessage.text };
    }
    if (msg.imageMessage) {
      return {
        type: 'IMAGE',
        text: msg.imageMessage.caption,
        mediaUrl: msg.imageMessage.url,
        mediaMimeType: msg.imageMessage.mimetype,
      };
    }
    if (msg.videoMessage) {
      return {
        type: 'VIDEO',
        text: msg.videoMessage.caption,
        mediaUrl: msg.videoMessage.url,
        mediaMimeType: msg.videoMessage.mimetype,
      };
    }
    if (msg.audioMessage) {
      return {
        type: 'AUDIO',
        mediaUrl: msg.audioMessage.url,
        mediaMimeType: msg.audioMessage.mimetype,
      };
    }
    if (msg.documentMessage) {
      return {
        type: 'DOCUMENT',
        text: msg.documentMessage.fileName,
        mediaUrl: msg.documentMessage.url,
        mediaMimeType: msg.documentMessage.mimetype,
      };
    }
    if (msg.locationMessage) {
      return {
        type: 'LOCATION',
        text: `${msg.locationMessage.degreesLatitude},${msg.locationMessage.degreesLongitude}`,
      };
    }
    if (msg.stickerMessage) {
      return { type: 'STICKER' };
    }
    return { type: 'SYSTEM' };
  }

  private mapConnectionState(state: string): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
    if (state === 'open') return 'CONNECTED';
    if (state === 'connecting') return 'CONNECTING';
    return 'DISCONNECTED';
  }
}
