import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LlmProvider } from './llm-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

export type LlmBackend = 'anthropic' | 'ollama' | 'openai-compatible';

// Default 'ollama': fase de teste local. Para usar Claude, defina AI_BACKEND=anthropic.
const DEFAULT_BACKEND: LlmBackend = 'ollama';

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
    const backend = this.resolveBackend('AI_BACKEND', DEFAULT_BACKEND);
    const provider = this.pickProvider(backend);
    this.logger.log(`[llm] provider principal: ${provider.name}`);
    return provider;
  }

  getClassifierProvider(): LlmProvider {
    // Classificador herda AI_BACKEND quando AI_CLASSIFIER_BACKEND não é definido.
    const backend = this.resolveBackend(
      'AI_CLASSIFIER_BACKEND',
      this.config.get<string>('AI_BACKEND', DEFAULT_BACKEND),
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
    this.logger.warn(`[llm] backend "${value}" desconhecido, usando ${DEFAULT_BACKEND}`);
    return DEFAULT_BACKEND;
  }

  private pickProvider(backend: LlmBackend): LlmProvider {
    switch (backend) {
      case 'anthropic':
        return this.anthropic;
      case 'openai-compatible':
        return this.openaiCompatible;
      case 'ollama':
      default:
        return this.ollama;
    }
  }
}
