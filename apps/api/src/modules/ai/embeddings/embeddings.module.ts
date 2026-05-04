import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { EmbeddingService } from './embedding.service';
import { EmbeddingProcessor } from './embedding.processor';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from './embedding-provider.interface';
import { QUEUE_NAMES } from '../../../queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.EMBEDDINGS }),
  ],
  providers: [
    OllamaEmbeddingProvider,
    OpenAiEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService, OllamaEmbeddingProvider, OpenAiEmbeddingProvider],
      useFactory: (
        config: ConfigService,
        ollama: OllamaEmbeddingProvider,
        openai: OpenAiEmbeddingProvider,
      ): EmbeddingProvider => {
        const backend = (config.get<string>('AI_EMBEDDING_BACKEND', 'ollama') ?? 'ollama').toLowerCase();
        switch (backend) {
          case 'openai':
          case 'openai-compatible':
            return openai;
          case 'ollama':
          default:
            return ollama;
        }
      },
    },
    EmbeddingService,
    EmbeddingProcessor,
  ],
  exports: [EmbeddingService],
})
export class EmbeddingsModule {}
