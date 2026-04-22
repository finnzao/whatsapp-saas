import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { CatalogTools } from '../ai/catalog.tools';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DevController],
  providers: [DevService, CatalogTools],
})
export class DevModule {}
