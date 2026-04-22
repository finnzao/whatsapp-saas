import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { DebugService } from './debug.service';
import { CatalogDiagController, CatalogDiagService } from './catalog-diag';
import { CatalogTools } from '../ai/catalog.tools';
import { AiModule } from '../ai/ai.module';
import { AutomationsModule } from '../automations/automations.module';

@Module({
  imports: [AiModule, AutomationsModule],
  controllers: [DebugController, CatalogDiagController],
  providers: [DebugService, CatalogDiagService, CatalogTools],
  exports: [DebugService],
})
export class DebugModule {}
