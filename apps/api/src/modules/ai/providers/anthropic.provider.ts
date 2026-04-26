import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
  LlmToolChoice,
} from './llm-provider.interface';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY', '');
    this.model = this.config.get<string>('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001');
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const anthropicMessages = this.toAnthropicMessages(request.messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: request.system,
      stop_sequences: request.stopSequences,
      messages: anthropicMessages,
      ...(request.tools && {
        tools: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
        ...(request.toolChoice && {
          tool_choice: this.mapToolChoice(request.toolChoice),
        }),
      }),
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    const toolCalls: LlmToolCall[] = response.content
      .filter((b) => b.type === 'tool_use')
      .map((b: any) => ({
        id: b.id,
        name: b.name,
        input: b.input,
      }));

    return {
      text,
      toolCalls,
      stopReason: this.mapStopReason(response.stop_reason),
      rawContent: response.content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private mapToolChoice(choice: LlmToolChoice): any {
    if (choice === 'auto') return { type: 'auto' };
    if (choice === 'any') return { type: 'any' };
    if (choice === 'none') return { type: 'none' };
    if (typeof choice === 'object' && choice.type === 'tool') {
      return { type: 'tool', name: choice.name };
    }
    return { type: 'auto' };
  }

  private toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
    return messages.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }

      const role = m.role === 'tool' ? 'user' : (m.role as 'user' | 'assistant');
      return { role, content: m.content as any };
    });
  }

  private mapStopReason(reason: string | null): LlmCompletionResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'unknown';
    }
  }
}
