import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionProvider } from './evolution/evolution.provider';
import { EvolutionWebhookController } from './webhooks/evolution.controller';
import { InboundMessageProcessor } from './webhooks/inbound-message.processor';
import { WhatsappEventsListener } from './listeners/whatsapp-events.listener';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { AutomationsModule } from '../automations/automations.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND_MESSAGES },
      { name: QUEUE_NAMES.OUTBOUND_MESSAGES },
    ),
    AutomationsModule,
    AiModule,
  ],
  controllers: [WhatsappController, EvolutionWebhookController],
  providers: [
    WhatsappService,
    InboundMessageProcessor,
    WhatsappEventsListener,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: EvolutionProvider,
    },
  ],
  exports: [WhatsappService, WHATSAPP_PROVIDER],
})
export class WhatsappModule {}
