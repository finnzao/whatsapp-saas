import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { CatalogTools } from './catalog.tools';

@Module({
  providers: [AiService, CatalogTools],
  exports: [AiService],
})
export class AiModule {}
