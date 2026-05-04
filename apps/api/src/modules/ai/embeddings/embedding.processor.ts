import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { JOB_NAMES, QUEUE_NAMES } from '../../../queue/queue.constants';
import { EmbeddingService } from './embedding.service';

interface EmbedProductJob {
  productId: string;
}

interface ReembedTenantJob {
  tenantId: string;
}

@Processor(QUEUE_NAMES.EMBEDDINGS, {
  concurrency: Number(process.env.EMBEDDING_WORKER_CONCURRENCY ?? '2'),
})
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(private readonly service: EmbeddingService) {
    super();
  }

  async process(job: Job<EmbedProductJob | ReembedTenantJob>) {
    switch (job.name) {
      case JOB_NAMES.EMBED_PRODUCT:
        return this.handleEmbedProduct(job as Job<EmbedProductJob>);
      case JOB_NAMES.REEMBED_TENANT:
        return this.handleReembedTenant(job as Job<ReembedTenantJob>);
      default:
        this.logger.warn(`[embedding-worker] job desconhecido: ${job.name}`);
        return { skipped: true };
    }
  }

  private async handleEmbedProduct(job: Job<EmbedProductJob>) {
    const result = await this.service.embedProduct(job.data.productId);
    if (result.skipped === 'product_not_found') {
      this.logger.debug(`[embedding-worker] produto ${job.data.productId} sumiu, ignorando`);
    }
    return result;
  }

  private async handleReembedTenant(job: Job<ReembedTenantJob>) {
    return this.service.backfillTenant(job.data.tenantId);
  }
}
