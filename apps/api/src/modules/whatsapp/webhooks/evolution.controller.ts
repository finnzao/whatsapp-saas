import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';

import { EvolutionWebhookEvent } from './evolution-events.dto';
import { QUEUE_NAMES, JOB_NAMES } from '../../../queue/queue.constants';

/**
 * Webhook da Evolution API.
 * Regra #1: NUNCA processar síncrono aqui. Responder 200 e enfileirar.
 * Se travar, a Evolution acumula e pode cair a conexão.
 */
@ApiTags('webhooks')
@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.INBOUND_MESSAGES)
    private readonly inboundQueue: Queue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleEvent(
    @Body() event: EvolutionWebhookEvent,
    @Headers('apikey') apiKey?: string,
  ) {
    // Log minimalista (evita vazar payload inteiro em produção)
    this.logger.debug(`Evento recebido: ${event.event} | instance: ${event.instance}`);

    if (!event.event || !event.instance) {
      return { ok: true, ignored: 'invalid payload' };
    }

    // Enfileira por tipo de evento. Cada worker trata diferente.
    switch (event.event) {
      case 'messages.upsert':
      case 'MESSAGES_UPSERT':
        await this.inboundQueue.add(
          JOB_NAMES.PROCESS_INBOUND,
          { type: 'message', event },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
        break;

      case 'messages.update':
      case 'MESSAGES_UPDATE':
        await this.inboundQueue.add(
          JOB_NAMES.PROCESS_INBOUND,
          { type: 'status', event },
          { attempts: 2 },
        );
        break;

      case 'connection.update':
      case 'CONNECTION_UPDATE':
        await this.inboundQueue.add(
          JOB_NAMES.PROCESS_INBOUND,
          { type: 'connection', event },
          { attempts: 2 },
        );
        break;

      case 'qrcode.updated':
      case 'QRCODE_UPDATED':
        await this.inboundQueue.add(
          JOB_NAMES.PROCESS_INBOUND,
          { type: 'qrcode', event },
          { attempts: 1 },
        );
        break;

      default:
        this.logger.debug(`Evento não tratado: ${event.event}`);
    }

    return { ok: true };
  }
}
