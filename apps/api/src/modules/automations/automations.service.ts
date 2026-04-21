import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

interface IncomingMessageContext {
  tenantId: string;
  conversationId: string;
  contactId: string;
  messageText: string;
}

/**
 * Orquestra as automações quando uma mensagem chega.
 *
 * Prioridade:
 * 1. Se está fora do horário -> mensagem de fora do horário
 * 2. Tenta casar com FAQ (palavras-chave)
 * 3. Se cair em regra de handoff -> escala pra humano
 * 4. Senão, aciona IA com acesso ao catálogo
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async handleIncomingMessage(ctx: IncomingMessageContext) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    if (!settings?.aiEnabled) {
      this.logger.debug(`IA desabilitada para tenant ${ctx.tenantId}`);
      return;
    }

    // 1. Verifica palavras-chave de handoff (ex: "falar com atendente")
    if (this.matchesHandoffKeyword(ctx.messageText, settings.handoffKeywords)) {
      return this.handoffToHuman(ctx, 'keyword match');
    }

    // 2. Tenta casar com FAQ
    const faqAnswer = await this.tryFaqMatch(ctx.tenantId, ctx.messageText);
    if (faqAnswer) {
      return this.sendBotReply(ctx, faqAnswer);
    }

    // 3. Fallback: IA com function calling no catálogo
    try {
      const aiReply = await this.ai.generateReply({
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        userMessage: ctx.messageText,
        instructions: settings.aiInstructions ?? undefined,
      });

      if (aiReply.handoff) {
        return this.handoffToHuman(ctx, 'ai requested handoff');
      }

      if (aiReply.text) {
        return this.sendBotReply(ctx, aiReply.text);
      }
    } catch (error) {
      this.logger.error(`Erro na IA: ${(error as Error).message}`);
      // Fallback seguro: escala pra humano
      return this.handoffToHuman(ctx, 'ai error');
    }
  }

  private matchesHandoffKeyword(text: string, keywords: string[]): boolean {
    if (!keywords?.length) return false;
    const normalized = text.toLowerCase();
    return keywords.some((k) => normalized.includes(k.toLowerCase()));
  }

  private async tryFaqMatch(tenantId: string, text: string): Promise<string | null> {
    const faqs = await this.prisma.faq.findMany({
      where: { tenantId, active: true },
      orderBy: { priority: 'desc' },
    });

    const normalized = text.toLowerCase();
    for (const faq of faqs) {
      const hit = faq.keywords.some((kw) => normalized.includes(kw.toLowerCase()));
      if (hit) return faq.answer;
    }
    return null;
  }

  private async sendBotReply(ctx: IncomingMessageContext, text: string) {
    const contact = await this.prisma.contact.findUniqueOrThrow({
      where: { id: ctx.contactId },
    });

    const result = await this.whatsapp.sendText(ctx.tenantId, contact.phone, text);

    await this.prisma.message.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        externalId: result.externalId,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: text,
        status: result.status === 'FAILED' ? 'FAILED' : 'SENT',
        fromBot: true,
      },
    });
  }

  private async handoffToHuman(ctx: IncomingMessageContext, reason: string) {
    this.logger.log(`Handoff para humano | conversa=${ctx.conversationId} motivo=${reason}`);

    await this.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { status: 'HUMAN' },
    });

    // Aqui poderia disparar notificação Socket.IO pro painel
    // e/ou enviar mensagem pro lojista no WhatsApp pessoal dele
  }
}
