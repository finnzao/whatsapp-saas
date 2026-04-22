import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
} from './llm-provider.interface';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAiChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';

  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('LLM_BASE_URL', 'http://localhost:8000/v1');
    this.model = this.config.get<string>('LLM_MODEL', 'meta-llama/Meta-Llama-3.1-8B-Instruct');
    this.apiKey = this.config.get<string>('LLM_API_KEY', 'no-key-required');

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 120_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/models');
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const messages = this.toOpenAiMessages(request);

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
      ...(request.stopSequences && { stop: request.stopSequences }),
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (request.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const { data } = await this.http.post<OpenAiChatResponse>('/chat/completions', payload);

      const choice = data.choices[0];
      const text = choice.message.content?.trim() ?? '';

      const toolCalls: LlmToolCall[] = (choice.message.tool_calls ?? []).map((tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          this.logger.warn(`Tool call com argumentos não-JSON: ${tc.function.arguments}`);
        }
        return {
          id: tc.id,
          name: tc.function.name,
          input: parsedArgs,
        };
      });

      return {
        text,
        toolCalls,
        stopReason: this.mapFinishReason(choice.finish_reason),
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error: any) {
      const msg = error.response?.data?.error?.message ?? error.message;
      this.logger.error(`Erro OpenAI-compatible: ${msg}`);
      throw new Error(`LLM request failed: ${msg}`);
    }
  }

  private toOpenAiMessages(request: LlmCompletionRequest): OpenAiMessage[] {
    const result: OpenAiMessage[] = [];

    if (request.system) {
      result.push({ role: 'system', content: request.system });
    }

    for (const m of request.messages) {
      if (typeof m.content === 'string') {
        result.push({ role: m.role as any, content: m.content });
        continue;
      }

      const toolUses = m.content.filter((b) => b.type === 'tool_use');
      const toolResults = m.content.filter((b) => b.type === 'tool_result');
      const textBlocks = m.content.filter((b) => b.type === 'text');

      if (toolUses.length > 0) {
        result.push({
          role: 'assistant',
          content: textBlocks.map((b: any) => b.text).join('\n') || null,
          tool_calls: toolUses.map((b: any) => ({
            id: b.id,
            type: 'function' as const,
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
          })),
        });
      } else if (toolResults.length > 0) {
        for (const tr of toolResults as any[]) {
          result.push({
            role: 'tool',
            content: tr.content,
            tool_call_id: tr.tool_use_id,
          });
        }
      } else if (textBlocks.length > 0) {
        result.push({
          role: m.role as any,
          content: textBlocks.map((b: any) => b.text).join('\n'),
        });
      }
    }

    return result;
  }

  private mapFinishReason(reason: string): LlmCompletionResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      default:
        return 'unknown';
    }
  }
}
