import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { WhatsappService } from './whatsapp.service';
import { WhatsappPresenceService } from './whatsapp-presence.service';
import { EvolutionProvider } from './evolution/evolution.provider';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { InboundMessageProcessor } from './webhooks/inbound-message.processor';
import { EvolutionWebhookController } from './webhooks/evolution.controller';
import { WhatsappEventsListener } from './listeners/whatsapp-events.listener';
import { WhatsappController } from './whatsapp.controller';
import { AutomationsModule } from '../automations/automations.module';
import { QUEUE_NAMES } from '../../queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AutomationsModule),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND_MESSAGES },
      { name: QUEUE_NAMES.OUTBOUND_MESSAGES },
    ),
  ],
  controllers: [WhatsappController, EvolutionWebhookController],
  providers: [
    WhatsappService,
    WhatsappPresenceService,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: EvolutionProvider,
    },
    InboundMessageProcessor,
    WhatsappEventsListener,
  ],
  exports: [WhatsappService, WhatsappPresenceService],
})
export class WhatsappModule {}
