import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmToolCall,
} from './llm-provider.interface';

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';

  private readonly logger = new Logger(OllamaProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = this.config.get<string>('OLLAMA_MODEL', 'llama3.1:8b');

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 120_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  supportsToolCalling(): boolean {
    const toolCapableModels = [
      'llama3.1', 'llama3.2', 'llama3.3',
      'qwen2.5', 'qwen3',
      'mistral-nemo', 'mistral-small',
      'command-r', 'hermes3',
    ];
    return toolCapableModels.some((m) => this.model.toLowerCase().includes(m));
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { data } = await this.http.get('/api/tags');
      const models = (data.models ?? []) as Array<{ name: string }>;
      const hasModel = models.some((m) => m.name.startsWith(this.model.split(':')[0]));
      if (!hasModel) {
        this.logger.warn(
          `Ollama disponível mas modelo "${this.model}" não está baixado. Rode: ollama pull ${this.model}`,
        );
      }
      return hasModel;
    } catch {
      return false;
    }
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const hasTools = !!(request.tools && request.tools.length > 0 && this.supportsToolCalling());

    const messages = this.toOllamaMessages(request, hasTools);

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 1024,
        ...(request.stopSequences && { stop: request.stopSequences }),
      },
    };

    if (hasTools) {
      payload.tools = request.tools!.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (request.responseFormat === 'json') {
      payload.format = 'json';
    }

    try {
      const { data } = await this.http.post<OllamaChatResponse>('/api/chat', payload);

      const rawText = data.message.content?.trim() ?? '';

      const nativeToolCalls: LlmToolCall[] = (data.message.tool_calls ?? []).map((tc, i) => ({
        id: `ollama-tool-${Date.now()}-${i}`,
        name: tc.function.name,
        input: tc.function.arguments,
      }));

      const validToolNames = request.tools?.map((t) => t.name) ?? [];

      const { cleanedText, recoveredToolCalls, leakedButInvalid } = hasTools
        ? this.recoverLeakedToolCalls(rawText, validToolNames)
        : { cleanedText: rawText, recoveredToolCalls: [], leakedButInvalid: false };

      const toolCalls = [...nativeToolCalls, ...recoveredToolCalls];

      if (recoveredToolCalls.length > 0) {
        this.logger.warn(
          `[ollama] recuperou ${recoveredToolCalls.length} tool call(s) vazada(s): ${recoveredToolCalls.map((t) => t.name).join(', ')}`,
        );
      }

      let finalText = cleanedText;
      if (leakedButInvalid && toolCalls.length === 0) {
        this.logger.warn(
          `[ollama] detectou tool call inválida no texto, substituindo por fallback. Raw: ${rawText.slice(0, 200)}`,
        );
        finalText =
          'Desculpe, tive um problema para consultar essa informação agora. Pode reformular a pergunta ou descrever o que você procura?';
      }

      return {
        text: finalText,
        toolCalls,
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
      };
    } catch (error: any) {
      const msg = error.response?.data?.error ?? error.message;
      this.logger.error(`Erro Ollama: ${msg}`);
      throw new Error(`Ollama request failed: ${msg}`);
    }
  }

  private recoverLeakedToolCalls(
    text: string,
    validToolNames: string[],
  ): { cleanedText: string; recoveredToolCalls: LlmToolCall[]; leakedButInvalid: boolean } {
    if (!text) return { cleanedText: '', recoveredToolCalls: [], leakedButInvalid: false };

    const recovered: LlmToolCall[] = [];
    let remaining = text;
    let sawStructuredAttempt = false;

    const extractionPatterns: RegExp[] = [
      /\{[^{}]*?"name"\s*:\s*"?([a-zA-Z_][\w-]*)"?[^{}]*?"(?:parameters|arguments|input)"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})[^{}]*?\}/g,
      /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g,
      /<function(?:_call)?[^>]*>\s*(\{[\s\S]*?\})\s*<\/function(?:_call)?>/g,
      /```(?:json|tool_call|function)?\s*(\{[\s\S]*?\})\s*```/g,
      /([a-z_][a-z0-9_]*)\s*\(\s*(\{[^}]*\}|"[^"]*"|\w[^)]*)\s*\)/gi,
      /^\s*([a-z_][a-z0-9_]*)\s+(\{[\s\S]*?\})\s*$/gim,
    ];

    for (const pattern of extractionPatterns) {
      const matches = Array.from(remaining.matchAll(pattern));
      for (const match of matches) {
        sawStructuredAttempt = true;

        const parsed = this.tryParseToolCall(match, validToolNames);
        if (parsed) {
          recovered.push({
            id: `ollama-recovered-${Date.now()}-${recovered.length}`,
            name: parsed.name,
            input: parsed.input,
          });
          remaining = remaining.replace(match[0], '').trim();
        }
      }
    }

    const suspiciousPatterns = [
      /\b[a-z]{0,5}?_?(?:product|category|handoff|check|search|list)_?[a-z_]*\s*[\(\{]/i,
      /^\s*\{[\s\S]*"(?:name|function|tool)"[\s\S]*\}\s*$/,
    ];
    const stillSuspicious =
      recovered.length === 0 &&
      suspiciousPatterns.some((p) => p.test(remaining)) &&
      remaining.length < 500;

    return {
      cleanedText: remaining.trim(),
      recoveredToolCalls: recovered,
      leakedButInvalid: sawStructuredAttempt && recovered.length === 0 || stillSuspicious,
    };
  }

  private tryParseToolCall(
    match: RegExpMatchArray,
    validToolNames: string[],
  ): { name: string; input: Record<string, unknown> } | null {
    try {
      let name: string | undefined;
      let argsRaw: string | undefined;

      if (match[1] && match[2] && !match[1].trim().startsWith('{')) {
        name = match[1];
        argsRaw = match[2];
      } else {
        const blockCandidate = match[1] ?? match[0];
        const normalized = this.normalizeJson(blockCandidate);
        const parsed = JSON.parse(normalized) as {
          name?: string;
          function?: string | { name?: string; arguments?: Record<string, unknown> };
          tool?: string;
          parameters?: Record<string, unknown>;
          arguments?: Record<string, unknown>;
          input?: Record<string, unknown>;
        };

        if (typeof parsed.function === 'object' && parsed.function !== null) {
          name = parsed.function.name;
          return this.buildResolvedCall(name, parsed.function.arguments ?? {}, validToolNames);
        }

        name = parsed.name ?? (typeof parsed.function === 'string' ? parsed.function : undefined) ?? parsed.tool;
        const input = parsed.parameters ?? parsed.arguments ?? parsed.input ?? {};
        return this.buildResolvedCall(name, input, validToolNames);
      }

      if (!name) return null;

      const normalizedArgs = this.normalizeJson(argsRaw!);
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(normalizedArgs);
      } catch {
        input = {};
      }
      return this.buildResolvedCall(name, input, validToolNames);
    } catch {
      return null;
    }
  }

  private buildResolvedCall(
    name: string | undefined,
    input: Record<string, unknown>,
    validToolNames: string[],
  ): { name: string; input: Record<string, unknown> } | null {
    if (!name) return null;

    if (validToolNames.includes(name)) {
      return { name, input };
    }

    const resolved = this.resolveToolName(name, validToolNames);
    if (resolved) {
      this.logger.warn(`[ollama] tool name "${name}" resolvido fuzzy para "${resolved}"`);
      return { name: resolved, input };
    }

    return null;
  }

  private resolveToolName(emitted: string, validNames: string[]): string | null {
    const normalized = emitted.toLowerCase().replace(/[^a-z_]/g, '');
    if (!normalized) return null;

    for (const valid of validNames) {
      if (valid.toLowerCase() === normalized) return valid;
    }

    for (const valid of validNames) {
      const v = valid.toLowerCase();
      if (v.includes(normalized) || normalized.includes(v)) return valid;
    }

    let best: { name: string; distance: number } | null = null;
    for (const valid of validNames) {
      const d = this.levenshtein(normalized, valid.toLowerCase());
      if (best === null || d < best.distance) {
        best = { name: valid, distance: d };
      }
    }

    if (best && best.distance <= Math.max(2, Math.floor(best.name.length * 0.2))) {
      return best.name;
    }

    return null;
  }

  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
        prev = temp;
      }
    }
    return dp[b.length];
  }

  private normalizeJson(raw: string): string {
    return raw
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1');
  }

  private toOllamaMessages(
    request: LlmCompletionRequest,
    hasTools: boolean,
  ): OllamaChatMessage[] {
    const result: OllamaChatMessage[] = [];

    let systemContent = request.system ?? '';
    if (hasTools) {
      systemContent += [
        '',
        '',
        'REGRAS CRÍTICAS DE USO DE FERRAMENTAS:',
        '1. Ao chamar uma ferramenta, use APENAS o mecanismo nativo de tool calling. NUNCA escreva o JSON da chamada como texto.',
        '2. NUNCA invente IDs. O parâmetro `productId` de check_product_availability SÓ pode ser um ID retornado antes por search_products.',
        '3. Para buscar produtos por características (cor, tamanho, modelo), SEMPRE use search_products passando a descrição na query. Exemplo: query="iphone laranja".',
        '4. NUNCA use check_product_availability como primeira tool — sem ID válido, use search_products.',
        '5. Se decidir chamar uma ferramenta, responda APENAS com a chamada, sem texto antes ou depois.',
      ].join('\n');
    }

    if (systemContent) {
      result.push({ role: 'system', content: systemContent });
    }

    for (const m of request.messages) {
      if (typeof m.content === 'string') {
        result.push({ role: m.role as any, content: m.content });
        continue;
      }

      for (const block of m.content) {
        if (block.type === 'text') {
          result.push({ role: m.role as any, content: block.text });
        } else if (block.type === 'tool_use') {
          result.push({
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: block.name, arguments: block.input } },
            ],
          });
        } else if (block.type === 'tool_result') {
          result.push({ role: 'tool', content: block.content });
        }
      }
    }

    return result;
  }
}
