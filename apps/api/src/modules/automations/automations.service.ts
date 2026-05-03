import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Faq } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { IntentClassifier, FaqCandidate } from '../ai/intent-classifier.service';
import {
  MessageIntentClassifier,
  MessageIntent,
} from '../ai/message-intent-classifier.service';
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

const GREETING_REPLIES = [
  'Olá! 👋 Em que posso ajudar hoje?',
  'Oi! Tudo bem? Como posso ajudar?',
  'Olá! Bem-vindo! Em que posso te ajudar?',
];

const SMALL_TALK_REPLIES = [
  'Imagina! Estou por aqui se precisar. 😊',
  'Disponha! Qualquer coisa é só chamar.',
  'À disposição! 👍',
];

const SHORT_CIRCUIT_INTENTS: ReadonlySet<MessageIntent> = new Set<MessageIntent>([
  'greeting',
  'small_talk',
  'handoff_request',
  'complaint',
]);

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly intentClassifier: IntentClassifier,
    private readonly messageIntent: MessageIntentClassifier,
    private readonly events: EventEmitter2,
  ) {}

  async handleIncomingMessage(ctx: IncomingMessageContext) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    if (this.matchesHandoffKeyword(ctx.messageText, settings?.handoffKeywords ?? [])) {
      return this.requestHandoff(ctx, 'keyword match');
    }

    const intentResult = await this.messageIntent.classify(ctx.messageText);
    this.logger.log(
      `[automations] intent="${intentResult.intent}" conf=${intentResult.confidence} ` +
        `tookMs=${intentResult.durationMs} msg="${ctx.messageText.slice(0, 50)}"`,
    );

    const shortCircuit = this.handleShortCircuitIntent(ctx, intentResult.intent);
    if (shortCircuit !== null) return shortCircuit;

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
        intent: intentResult.intent,
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

  private handleShortCircuitIntent(
    ctx: IncomingMessageContext,
    intent: MessageIntent,
  ): boolean | null {
    if (!SHORT_CIRCUIT_INTENTS.has(intent)) return null;

    if (intent === 'handoff_request') {
      this.requestHandoff(ctx, 'intent classifier: handoff_request');
      return true;
    }

    if (intent === 'complaint') {
      this.requestHandoff(ctx, 'intent classifier: complaint');
      return true;
    }

    if (intent === 'greeting') {
      this.requestOutboundMessage(ctx, this.pickRandom(GREETING_REPLIES), true);
      return true;
    }

    if (intent === 'small_talk') {
      this.requestOutboundMessage(ctx, this.pickRandom(SMALL_TALK_REPLIES), true);
      return true;
    }

    return null;
  }

  private pickRandom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
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
