import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../../queue/queue.constants';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InboundDebouncerService } from '../../automations/inbound-debouncer.service';

interface InboundJobData {
  tenantId: string;
  instanceName: string;
  externalMessageId: string;
  fromPhone: string;
  pushName?: string;
  text: string;
  timestamp: number;
}

@Processor(QUEUE_NAMES.INBOUND_MESSAGES)
export class InboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => InboundDebouncerService))
    private readonly debouncer: InboundDebouncerService,
  ) {
    super();
  }

  async process(job: Job<InboundJobData>) {
    const { tenantId, instanceName, externalMessageId, fromPhone, pushName, text, timestamp } =
      job.data;

    const existing = await this.prisma.message.findFirst({
      where: { tenantId, externalId: externalMessageId },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(`[inbound] msg ${externalMessageId} já processada, skip`);
      return { skipped: true };
    }

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: fromPhone } },
      update: { ...(pushName && { name: pushName }) },
      create: { tenantId, phone: fromPhone, name: pushName ?? null },
    });

    const conversation = await this.findOrCreateActiveConversation(
      tenantId,
      contact.id,
      instanceName,
    );

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'INBOUND',
        content: text,
        externalId: externalMessageId,
        status: 'RECEIVED',
        createdAt: new Date(timestamp),
      },
    });

    if (conversation.status === 'HUMAN') {
      this.logger.debug(
        `[inbound] conv=${conversation.id} em modo HUMAN, bot bypass`,
      );
      return { saved: true, botSkipped: true };
    }

    await this.debouncer.enqueue({
      tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      phone: fromPhone,
      instanceName,
      messageId: message.id,
      messageText: text,
      isDebug: false,
    });

    return { saved: true, debounced: true };
  }

  private async findOrCreateActiveConversation(
    tenantId: string,
    contactId: string,
    instanceName: string,
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        contactId,
        status: { in: ['BOT', 'HUMAN'] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId,
        contactId,
        status: 'BOT',
        instanceName,
      },
    });
  }
}
