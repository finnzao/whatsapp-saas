import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Faq } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { IntentClassifier, FaqCandidate } from '../ai/intent-classifier.service';
import {
  APP_EVENTS,
  OutboundMessageRequestedEvent,
  ConversationHandoffRequestedEvent,
} from '../../common/events/app-events';

interface IncomingMessageContext {
  tenantId: string;
  conversationId: string;
  contactId: string;
  messageText: string;
}

const AI_TECHNICAL_FALLBACK =
  'Desculpe, tive um probleminha pra processar isso agora. Pode repetir ou me dar mais detalhes do que você procura?';

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly intentClassifier: IntentClassifier,
    private readonly events: EventEmitter2,
  ) {}

  async handleIncomingMessage(ctx: IncomingMessageContext) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    if (this.matchesHandoffKeyword(ctx.messageText, settings?.handoffKeywords ?? [])) {
      return this.requestHandoff(ctx, 'keyword match');
    }

    const faqAnswer = await this.tryFaqMatch(ctx.tenantId, ctx.messageText);
    if (faqAnswer) {
      return this.requestOutboundMessage(ctx, faqAnswer, true);
    }

    if (!settings?.aiEnabled) {
      this.logger.debug(`IA desabilitada para tenant ${ctx.tenantId} — sem resposta automática`);
      return this.requestHandoff(ctx, 'ai disabled and no faq match');
    }

    try {
      const aiReply = await this.ai.generateReply({
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        userMessage: ctx.messageText,
        instructions: settings.aiInstructions ?? undefined,
      });

      if (aiReply.handoff) {
        return this.requestHandoff(ctx, aiReply.handoffReason ?? 'ai requested handoff');
      }

      if (aiReply.text) {
        return this.requestOutboundMessage(ctx, aiReply.text, true);
      }

      this.logger.warn(
        `[automations] IA retornou resposta vazia para "${ctx.messageText.slice(0, 60)}" — enviando fallback`,
      );
      return this.requestOutboundMessage(ctx, AI_TECHNICAL_FALLBACK, true);
    } catch (error) {
      this.logger.error(
        `[automations] Erro técnico na IA para conversa ${ctx.conversationId}: ${(error as Error).message}`,
      );
      return this.requestOutboundMessage(ctx, AI_TECHNICAL_FALLBACK, true);
    }
  }

  private matchesHandoffKeyword(text: string, keywords: string[]): boolean {
    if (!keywords?.length) return false;
    const normalized = text.toLowerCase();
    return keywords.some((k: string) => normalized.includes(k.toLowerCase()));
  }

  private async tryFaqMatch(tenantId: string, text: string): Promise<string | null> {
    const faqs = await this.prisma.faq.findMany({
      where: { tenantId, active: true },
      orderBy: { priority: 'desc' },
    });

    const normalized = text.toLowerCase();
    const matches = (faqs as Faq[]).filter((faq) =>
      faq.keywords.some((kw: string) => normalized.includes(kw.toLowerCase())),
    );

    if (matches.length === 0) return null;

    const candidates: FaqCandidate[] = matches.map((f) => ({
      id: f.id,
      question: f.question,
      keywords: f.keywords,
    }));

    const classification = await this.intentClassifier.classify(text, candidates);

    if (!classification.matched) {
      this.logger.debug(
        `[faq] keyword bateu mas intenção não é FAQ: "${classification.reason}"`,
      );
      return null;
    }

    const chosen = matches.find((f) => f.id === classification.faqId);
    if (!chosen) return null;

    this.logger.debug(
      `[faq] match confirmado | faq="${chosen.question}" confianca=${classification.confidence}`,
    );
    return chosen.answer;
  }

  private requestOutboundMessage(ctx: IncomingMessageContext, text: string, fromBot: boolean) {
    const payload: OutboundMessageRequestedEvent = {
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      contactId: ctx.contactId,
      text,
      fromBot,
    };
    this.events.emit(APP_EVENTS.OUTBOUND_MESSAGE_REQUESTED, payload);
  }

  private requestHandoff(ctx: IncomingMessageContext, reason: string) {
    this.logger.log(`Handoff solicitado | conversa=${ctx.conversationId} motivo=${reason}`);
    const payload: ConversationHandoffRequestedEvent = {
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      reason,
    };
    this.events.emit(APP_EVENTS.CONVERSATION_HANDOFF_REQUESTED, payload);
  }
}
