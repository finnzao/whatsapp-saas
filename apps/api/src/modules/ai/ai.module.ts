import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { CatalogTools } from './catalog.tools';
import { IntentClassifier } from './intent-classifier.service';
import { MessageIntentClassifier } from './message-intent-classifier.service';
import { PriceGuardrailService } from './price-guardrail.service';
import { LlmProviderFactory } from './providers/llm-provider.factory';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

@Module({
  providers: [
    AiService,
    CatalogTools,
    IntentClassifier,
    MessageIntentClassifier,
    PriceGuardrailService,
    LlmProviderFactory,
    AnthropicProvider,
    OllamaProvider,
    OpenAiCompatibleProvider,
  ],
  exports: [AiService, IntentClassifier, MessageIntentClassifier],
})
export class AiModule {}
