import { Module } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
