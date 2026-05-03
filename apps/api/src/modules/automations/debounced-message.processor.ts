import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../queue/queue.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboundDebouncerService } from './inbound-debouncer.service';
import { AutomationsService } from './automations.service';
import { WhatsappPresenceService } from '../whatsapp/whatsapp-presence.service';

@Processor(QUEUE_NAMES.DEBOUNCED_PROCESSING)
export class DebouncedMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(DebouncedMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly debouncer: InboundDebouncerService,
    private readonly automations: AutomationsService,
    private readonly presence: WhatsappPresenceService,
  ) {
    super();
  }

  async process(job: Job<{ conversationId: string }>) {
    const { conversationId } = job.data;
    const startedAt = Date.now();

    const { state, messageIds } = await this.debouncer.drain(conversationId);

    if (!state || messageIds.length === 0) {
      this.logger.debug(`[debounced] conv=${conversationId} sem estado, skip`);
      return { skipped: true };
    }

    const messages = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, tenantId: state.tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true },
    });

    const aggregated = messages
      .map((m) => m.content?.trim())
      .filter((c): c is string => !!c && c.length > 0)
      .join('\n');

    if (!aggregated) {
      this.logger.debug(`[debounced] conv=${conversationId} sem conteúdo agregável`);
      return { empty: true };
    }

    this.logger.log(
      `[debounced] FIRE conv=${conversationId} batch=${messages.length} wait=${
        Date.now() - state.firstAt
      }ms aggregated="${aggregated.slice(0, 80)}"`,
    );

    const shouldShowTyping = !state.isDebug && state.phone;

    if (shouldShowTyping) {
      await this.presence.startTyping(state.tenantId, state.phone);
    }

    try {
      await this.automations.handleIncomingMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        contactId: state.contactId,
        messageText: aggregated,
      });
    } finally {
      if (shouldShowTyping) {
        await this.presence.stopTyping(state.tenantId, state.phone);
      }
      this.logger.debug(
        `[debounced] DONE conv=${conversationId} took=${Date.now() - startedAt}ms`,
      );
    }

    return { processed: messages.length };
  }
}
