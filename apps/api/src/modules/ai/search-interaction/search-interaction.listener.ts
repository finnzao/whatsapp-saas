import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  SEARCH_INTERACTION_RECORDED,
  SearchInteractionRecordedEvent,
} from './search-interaction.events';

@Injectable()
export class SearchInteractionListener {
  private readonly logger = new Logger(SearchInteractionListener.name);

  constructor(private readonly prisma: PrismaService) {}

  // async:true -> roda em microtask, não bloqueia a resposta ao cliente.
  @OnEvent(SEARCH_INTERACTION_RECORDED, { async: true })
  async handle(ev: SearchInteractionRecordedEvent): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "search_interactions" (
          "id", "tenantId", "conversationId", "contactId",
          "query", "queryNormalized", "queryEmbedding",
          "resultsShown", "lexicalCount", "vectorCount", "fusedCount",
          "matchQuality", "outcome", "latencyMs"
        ) VALUES (
          gen_random_uuid(),
          ${ev.tenantId},
          ${ev.conversationId},
          ${ev.contactId},
          ${ev.query},
          ${ev.queryNormalized},
          ${ev.queryVectorLiteral ? Prisma.sql`${ev.queryVectorLiteral}::vector` : null},
          ${JSON.stringify(ev.resultsShown)}::jsonb,
          ${ev.lexicalCount},
          ${ev.vectorCount},
          ${ev.fusedCount},
          ${ev.matchQuality},
          ${ev.outcome},
          ${ev.latencyMs}
        )
      `;
    } catch (err) {
      this.logger.warn(`[search-interaction] falha ao gravar: ${(err as Error).message}`);
    }
  }
}
