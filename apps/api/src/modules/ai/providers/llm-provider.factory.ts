import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LlmProvider } from './llm-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

export type LlmBackend = 'anthropic' | 'ollama' | 'openai-compatible';

@Injectable()
export class LlmProviderFactory {
  private readonly logger = new Logger(LlmProviderFactory.name);

  constructor(
    private readonly config: ConfigService,
    private readonly anthropic: AnthropicProvider,
    private readonly ollama: OllamaProvider,
    private readonly openaiCompatible: OpenAiCompatibleProvider,
  ) {}

  getMainProvider(): LlmProvider {
    const backend = this.resolveBackend('AI_BACKEND', 'anthropic');
    const provider = this.pickProvider(backend);
    this.logger.log(`[llm] provider principal: ${provider.name}`);
    return provider;
  }

  getClassifierProvider(): LlmProvider {
    const backend = this.resolveBackend(
      'AI_CLASSIFIER_BACKEND',
      this.config.get<string>('AI_BACKEND', 'anthropic'),
    );
    const provider = this.pickProvider(backend);
    this.logger.log(`[llm] provider classificador: ${provider.name}`);
    return provider;
  }

  private resolveBackend(envKey: string, fallback: string): LlmBackend {
    const value = (this.config.get<string>(envKey, fallback) ?? fallback).toLowerCase();
    if (value === 'anthropic' || value === 'ollama' || value === 'openai-compatible') {
      return value;
    }
    this.logger.warn(`[llm] backend "${value}" desconhecido, usando anthropic`);
    return 'anthropic';
  }

  private pickProvider(backend: LlmBackend): LlmProvider {
    switch (backend) {
      case 'ollama':
        return this.ollama;
      case 'openai-compatible':
        return this.openaiCompatible;
      case 'anthropic':
      default:
        return this.anthropic;
    }
  }
}
