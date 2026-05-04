import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';

import { PrismaService } from '../../common/prisma/prisma.service';
import { InboundDebouncerService } from '../automations/inbound-debouncer.service';
import {
  APP_EVENTS,
  OutboundMessageRequestedEvent,
  ConversationHandoffRequestedEvent,
} from '../../common/events/app-events';

export type DebugStreamEvent =
  | { type: 'user_message'; content: string; timestamp: string }
  | { type: 'typing_start'; timestamp: string }
  | { type: 'typing_end'; timestamp: string }
  | { type: 'bot_reply'; content: string; timestamp: string }
  | { type: 'handoff'; content: string; reason: string; timestamp: string }
  | { type: 'error'; content: string; timestamp: string }
  | { type: 'heartbeat'; timestamp: string };

const DEBUG_CONTACT_PREFIX = 'debug-';
const HEARTBEAT_MS = 25_000;

@Injectable()
export class DebugService implements OnModuleDestroy {
  private readonly logger = new Logger(DebugService.name);
  private readonly streamsByTenant = new Map<string, Subject<DebugStreamEvent>>();
  private readonly conversationToTenant = new Map<string, string>();
  private readonly heartbeatInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly debouncer: InboundDebouncerService,
  ) {
    this.heartbeatInterval = setInterval(() => {
      const ts = new Date().toISOString();
      for (const subject of this.streamsByTenant.values()) {
        subject.next({ type: 'heartbeat', timestamp: ts });
      }
    }, HEARTBEAT_MS);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    for (const subject of this.streamsByTenant.values()) {
      subject.complete();
    }
    this.streamsByTenant.clear();
    this.conversationToTenant.clear();
  }

  streamFor(tenantId: string) {
    const subject = this.getOrCreateStream(tenantId);
    return subject.asObservable();
  }

  async simulateInbound(
    tenantId: string,
    text: string,
    contactName?: string,
  ): Promise<{ accepted: true; conversationId: string }> {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: contactName ? { name: contactName } : {},
      create: {
        tenantId,
        phone,
        name: contactName ?? 'Debug Console',
      },
    });

    const conversation = await this.findOrCreateActiveConversation(tenantId, contact.id);

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'INBOUND',
        type: 'TEXT',
        content: text,
        status: 'DELIVERED',
      },
    });

    this.conversationToTenant.set(conversation.id, tenantId);

    const ts = new Date().toISOString();
    const subject = this.getOrCreateStream(tenantId);
    subject.next({ type: 'user_message', content: text, timestamp: ts });
    subject.next({ type: 'typing_start', timestamp: ts });

    await this.debouncer.enqueue({
      tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      phone,
      instanceName: null,
      messageId: message.id,
      messageText: text,
      isDebug: true,
    });

    return { accepted: true, conversationId: conversation.id };
  }

  async getHistory(tenantId: string): Promise<{
    conversationId: string | null;
    status: string | null;
    messages: Array<{
      id: string;
      direction: 'INBOUND' | 'OUTBOUND';
      content: string | null;
      fromBot: boolean;
      createdAt: string;
    }>;
  }> {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (!contact) {
      return { conversationId: null, status: null, messages: [] };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) {
      return { conversationId: null, status: null, messages: [] };
    }

    this.conversationToTenant.set(conversation.id, tenantId);

    const messages = await this.prisma.message.findMany({
      where: { tenantId, conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        content: true,
        fromBot: true,
        createdAt: true,
      },
    });

    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        content: m.content,
        fromBot: m.fromBot,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async resetConversation(tenantId: string): Promise<{ ok: true }> {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (!contact) return { ok: true };

    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, contactId: contact.id },
      select: { id: true },
    });

    for (const c of conversations) {
      this.conversationToTenant.delete(c.id);
    }

    await this.prisma.conversation.deleteMany({
      where: { tenantId, contactId: contact.id },
    });

    this.logger.log(`[debug] conversa de teste resetada para tenant=${tenantId.slice(0, 8)}`);
    return { ok: true };
  }

  @OnEvent(APP_EVENTS.OUTBOUND_MESSAGE_REQUESTED)
  async onOutbound(event: OutboundMessageRequestedEvent) {
    const tenantId = this.conversationToTenant.get(event.conversationId);
    if (!tenantId) return;

    const subject = this.streamsByTenant.get(tenantId);
    if (!subject) return;

    const message = await this.prisma.message.create({
      data: {
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        contactId: event.contactId,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: event.text,
        status: 'SENT',
        fromBot: event.fromBot,
        metadata: { debug: true },
      },
    });

    const ts = message.createdAt.toISOString();
    subject.next({ type: 'typing_end', timestamp: ts });
    subject.next({ type: 'bot_reply', content: event.text, timestamp: ts });
  }

  @OnEvent(APP_EVENTS.CONVERSATION_HANDOFF_REQUESTED)
  onHandoff(event: ConversationHandoffRequestedEvent) {
    const tenantId = this.conversationToTenant.get(event.conversationId);
    if (!tenantId) return;

    const subject = this.streamsByTenant.get(tenantId);
    if (!subject) return;

    const ts = new Date().toISOString();
    subject.next({ type: 'typing_end', timestamp: ts });
    subject.next({
      type: 'handoff',
      content: 'Conversa transferida para atendimento humano',
      reason: event.reason,
      timestamp: ts,
    });
  }

  private async findOrCreateActiveConversation(tenantId: string, contactId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId, status: { in: ['BOT', 'HUMAN'] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId,
        contactId,
        status: 'BOT',
        metadata: { debug: true },
      },
    });
  }

  private getOrCreateStream(tenantId: string): Subject<DebugStreamEvent> {
    let subject = this.streamsByTenant.get(tenantId);
    if (!subject) {
      subject = new Subject<DebugStreamEvent>();
      this.streamsByTenant.set(tenantId, subject);
    }
    return subject;
  }
}
