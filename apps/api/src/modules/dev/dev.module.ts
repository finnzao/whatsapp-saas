import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { TrainingDataService } from './training-data.service';
import { CatalogTools } from '../ai/catalog.tools';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DevController],
  providers: [
    DevService,
    SearchAnalyticsService,
    TrainingDataService,
    CatalogTools,
  ],
})
export class DevModule {}
