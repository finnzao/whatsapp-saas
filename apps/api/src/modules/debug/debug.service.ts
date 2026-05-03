import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, fromEvent, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { PrismaService } from '../../common/prisma/prisma.service';
import { InboundDebouncerService } from '../automations/inbound-debouncer.service';
import { APP_EVENTS } from '../../common/events/event.constants';
import {
  OutboundMessageRequestedEvent,
  HandoffEscalatedEvent,
} from '../../common/events/event.types';

export type DebugStreamEvent =
  | {
      type: 'message';
      payload: {
        id: string;
        direction: 'INBOUND' | 'OUTBOUND';
        content: string;
        createdAt: string;
        conversationId: string;
      };
    }
  | { type: 'typing_start'; payload: { conversationId: string } }
  | { type: 'typing_end'; payload: { conversationId: string } }
  | {
      type: 'handoff';
      payload: { conversationId: string; reason: string };
    }
  | { type: 'heartbeat'; payload: { ts: number } };

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
      const ts = Date.now();
      for (const subject of this.streamsByTenant.values()) {
        subject.next({ type: 'heartbeat', payload: { ts } });
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

  streamForTenant(tenantId: string) {
    const subject = this.getOrCreateStream(tenantId);
    return merge(
      of({ type: 'heartbeat' as const, payload: { ts: Date.now() } }),
      subject.asObservable(),
    ).pipe(map((event) => ({ data: event })));
  }

  async simulateInbound(
    tenantId: string,
    text: string,
  ): Promise<{ accepted: true; conversationId: string }> {
    const phone = `${DEBUG_CONTACT_PREFIX}${tenantId.slice(0, 8)}`;

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: {},
      create: {
        tenantId,
        phone,
        name: 'Debug Console',
      },
    });

    const conversation = await this.findOrCreateActiveConversation(tenantId, contact.id);

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'INBOUND',
        content: text,
        status: 'RECEIVED',
      },
    });

    this.conversationToTenant.set(conversation.id, tenantId);

    const subject = this.getOrCreateStream(tenantId);
    subject.next({
      type: 'message',
      payload: {
        id: message.id,
        direction: 'INBOUND',
        content: text,
        createdAt: message.createdAt.toISOString(),
        conversationId: conversation.id,
      },
    });
    subject.next({
      type: 'typing_start',
      payload: { conversationId: conversation.id },
    });

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

  @OnEvent(APP_EVENTS.OUTBOUND_MESSAGE_REQUESTED)
  onOutbound(event: OutboundMessageRequestedEvent) {
    const tenantId = this.conversationToTenant.get(event.conversationId);
    if (!tenantId) return;

    const subject = this.streamsByTenant.get(tenantId);
    if (!subject) return;

    subject.next({
      type: 'typing_end',
      payload: { conversationId: event.conversationId },
    });
    subject.next({
      type: 'message',
      payload: {
        id: event.messageId,
        direction: 'OUTBOUND',
        content: event.content,
        createdAt: new Date().toISOString(),
        conversationId: event.conversationId,
      },
    });
  }

  @OnEvent(APP_EVENTS.HANDOFF_ESCALATED)
  onHandoff(event: HandoffEscalatedEvent) {
    const tenantId = this.conversationToTenant.get(event.conversationId);
    if (!tenantId) return;

    const subject = this.streamsByTenant.get(tenantId);
    if (!subject) return;

    subject.next({
      type: 'typing_end',
      payload: { conversationId: event.conversationId },
    });
    subject.next({
      type: 'handoff',
      payload: { conversationId: event.conversationId, reason: event.reason },
    });
  }

  private async findOrCreateActiveConversation(tenantId: string, contactId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId, status: { in: ['BOT', 'HUMAN'] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: { tenantId, contactId, status: 'BOT', instanceName: 'debug' },
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
