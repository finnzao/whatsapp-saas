import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AutomationsService } from './automations.service';
import { InboundDebouncerService } from './inbound-debouncer.service';
import { DebouncedMessageProcessor } from './debounced-message.processor';
import { AiModule } from '../ai/ai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { QUEUE_NAMES } from '../../queue/queue.constants';

@Module({
  imports: [
    AiModule,
    forwardRef(() => WhatsappModule),
    BullModule.registerQueue({ name: QUEUE_NAMES.DEBOUNCED_PROCESSING }),
  ],
  providers: [AutomationsService, InboundDebouncerService, DebouncedMessageProcessor],
  exports: [AutomationsService, InboundDebouncerService],
})
export class AutomationsModule {}
