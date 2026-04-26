import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message as PrismaMessage } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from './catalog.tools';
import { PriceGuardrailService } from './price-guardrail.service';
import { LlmProviderFactory } from './providers/llm-provider.factory';
import {
  LlmProvider,
  LlmMessage,
  LlmContentBlock,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from './providers/llm-provider.interface';
import { withTimeout, timed, formatDuration, LlmTimeoutError } from './llm-timeout.util';

interface GenerateReplyParams {
  tenantId: string;
  conversationId: string;
  userMessage: string;
  instructions?: string;
}

interface AiReplyResult {
  text?: string;
  handoff?: boolean;
  handoffReason?: string;
}

const PRODUCT_INTENT_PATTERNS = [
  /\bo que (voc[êe]s? )?vend[ea]/i,
  /\bquais produtos/i,
  /\bquais categorias/i,
  /\bo que tem/i,
  /\bque tipo de/i,
  /\btem\s+(?:pra|para)\s+vender/i,
  /\bquero (ver|comprar|saber|um|uma)/i,
  /\bme mostra/i,
  /\bvoc[êe]s? tem\b/i,
  /\btem\b.{0,40}\?/i,
  /\bprocuro\b/i,
  /\bprecisando de/i,
  /\bcat[áa]logo/i,
  /\bprodut/i,
  /\b(iphone|xiaomi|samsung|motorola|apple|celular|smartphone|capinha|pel[íi]cula|fone|carregador|airpod|notebook|tv|cabo|capa)\b/i,
];

function looksLikeProductQuery(text: string): boolean {
  return PRODUCT_INTENT_PATTERNS.some((p) => p.test(text));
}

const TIMEOUT_FALLBACK_MESSAGE =
  'Estou com lentidão para consultar isso agora. Pode me dar mais detalhes ou tentar novamente em alguns segundos?';

class TinyLruCache<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: LlmProvider;
  private readonly totalBudgetMs: number;
  private readonly perCallTimeoutMs: number;
  private readonly maxTokensPerCall: number;
  private readonly maxIterations: number;
  private readonly replyCache = new TinyLruCache<string>(200);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: CatalogTools,
    private readonly guardrail: PriceGuardrailService,
    private readonly factory: LlmProviderFactory,
    config: ConfigService,
  ) {
    this.provider = this.factory.getMainProvider();
    this.totalBudgetMs = Number(config.get<string>('AI_TOTAL_BUDGET_MS', '90000'));
    this.perCallTimeoutMs = Number(config.get<string>('AI_PER_CALL_TIMEOUT_MS', '60000'));
    this.maxTokensPerCall = Number(config.get<string>('AI_MAX_TOKENS_PER_CALL', '512'));
    this.maxIterations = Number(config.get<string>('AI_MAX_ITERATIONS', '2'));
  }

  async generateReply(params: GenerateReplyParams): Promise<AiReplyResult> {
    const start = Date.now();
    const remainingBudget = () => Math.max(0, this.totalBudgetMs - (Date.now() - start));

    // Cache de respostas idênticas. Não cacheamos respostas com handoff.
    const cacheKey = this.buildCacheKey(params);
    const cached = this.replyCache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[ai] cache hit para "${params.userMessage.slice(0, 40)}"`);
      return { text: cached };
    }

    const history = await this.buildMessageHistory(params.conversationId);
    const systemPrompt = this.buildSystemPrompt(params.instructions);

    const messages: LlmMessage[] = [
      ...history,
      { role: 'user', content: params.userMessage },
    ];

    const toolDefinitions = this.tools.getToolDefinitions().map((t: any) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema ?? t.parameters,
    }));

    // NÃO usamos mais fast-path que injeta search_products direto. A versão
    // anterior ignorava matchQuality e o modelo via "tem produto" mesmo
    // quando matchQuality era 'none' — causando alucinação grave (vendeu
    // Galaxy S24 quando cliente pediu carregador). Agora o LLM SEMPRE chama
    // a tool e SEMPRE lê o hint, que é claro sobre o que fazer.

    const forceTool = looksLikeProductQuery(params.userMessage);
    const toolResultsSeen: string[] = [];
    let lastTextResponse: string | undefined;

    for (let i = 0; i < this.maxIterations; i++) {
      const budget = remainingBudget();
      if (budget <= 1000) {
        this.logger.warn(
          `[ai] budget total esgotado antes da iter #${i + 1} (gasto=${formatDuration(Date.now() - start)})`,
        );
        return { text: lastTextResponse ?? TIMEOUT_FALLBACK_MESSAGE };
      }

      const callTimeout = Math.min(this.perCallTimeoutMs, budget);
      let response: LlmCompletionResponse;

      try {
        const { value, durationMs } = await timed(() =>
          this.completeWithTimeout(
            {
              system: systemPrompt,
              messages,
              tools: this.provider.supportsToolCalling() ? toolDefinitions : undefined,
              maxTokens: this.maxTokensPerCall,
              temperature: 0.3,
              ...(i === 0 && forceTool && this.provider.supportsToolCalling()
                ? { toolChoice: 'any' as const }
                : {}),
            } as LlmCompletionRequest,
            callTimeout,
            `provider.complete iter#${i + 1}`,
          ),
        );
        response = value;

        const usage = response.usage
          ? ` | in=${response.usage.inputTokens} out=${response.usage.outputTokens}`
          : '';
        this.logger.debug(
          `[ai] iter#${i + 1} completou em ${formatDuration(durationMs)}${usage} | stop=${response.stopReason} | tools=${response.toolCalls.length}`,
        );
      } catch (err) {
        if (err instanceof LlmTimeoutError) {
          this.logger.error(
            `[ai] iter#${i + 1} timeout após ${formatDuration(callTimeout)}: ${err.message}`,
          );
          return { text: lastTextResponse ?? TIMEOUT_FALLBACK_MESSAGE };
        }
        throw err;
      }

      if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
        lastTextResponse = response.text;
        const validated = await this.validateAndMaybeRegenerate({
          text: response.text,
          toolResultsSeen,
          systemPrompt,
          messages,
          toolDefinitions,
          remainingBudgetMs: remainingBudget(),
        });
        if (validated.length > 0 && validated.length < 300) {
          this.replyCache.set(cacheKey, validated);
        }
        return { text: validated };
      }

      const toolResultBlocks: LlmContentBlock[] = [];
      let handoffFromTool: { reason: string } | null = null;

      for (const toolCall of response.toolCalls) {
        const { value: result, durationMs } = await timed(() =>
          this.tools.execute(params.tenantId, toolCall.name, toolCall.input),
        );
        this.logger.debug(
          `[ai] tool "${toolCall.name}" executou em ${formatDuration(durationMs)}`,
        );

        const resultJson = JSON.stringify(result);
        toolResultsSeen.push(resultJson);

        if (
          toolCall.name === 'request_human_handoff' &&
          result &&
          typeof result === 'object' &&
          'handoff' in result &&
          (result as any).handoff === true
        ) {
          handoffFromTool = {
            reason: (result as any).reason ?? 'solicitado pela IA',
          };
        }

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: resultJson,
        });
      }

      if (handoffFromTool) {
        this.logger.log(
          `[ai] handoff explícito via tool | motivo="${handoffFromTool.reason}"`,
        );
        return { handoff: true, handoffReason: handoffFromTool.reason };
      }

      const assistantBlocks: LlmContentBlock[] = [];
      if (response.text) {
        assistantBlocks.push({ type: 'text', text: response.text });
      }
      for (const tc of response.toolCalls) {
        assistantBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }

      messages.push({ role: 'assistant', content: assistantBlocks });
      messages.push({ role: 'user', content: toolResultBlocks });
    }

    this.logger.warn(
      `[ai] MAX_ITERATIONS=${this.maxIterations} atingido para "${params.userMessage.slice(0, 60)}" (total=${formatDuration(Date.now() - start)}) — devolvendo fallback`,
    );
    return {
      text:
        lastTextResponse ??
        'Desculpe, não consegui processar sua pergunta agora. Pode me dar mais detalhes? Marca, modelo, faixa de preço...',
    };
  }

  private buildCacheKey(params: GenerateReplyParams): string {
    const normalized = params.userMessage.toLowerCase().trim().replace(/\s+/g, ' ');
    return `${params.tenantId}::${normalized}`;
  }

  private completeWithTimeout(
    request: LlmCompletionRequest,
    timeoutMs: number,
    operation: string,
  ): Promise<LlmCompletionResponse> {
    return withTimeout(operation, timeoutMs, () => this.provider.complete(request));
  }

  private async validateAndMaybeRegenerate(args: {
    text: string;
    toolResultsSeen: string[];
    systemPrompt: string;
    messages: LlmMessage[];
    toolDefinitions: any[];
    remainingBudgetMs: number;
  }): Promise<string> {
    const { text, toolResultsSeen } = args;

    if (!text || toolResultsSeen.length === 0) return text;

    const allowedPrices = this.guardrail.collectAllowedPrices(toolResultsSeen);
    const hallucinated = this.guardrail.findHallucinatedPrices(text, allowedPrices);

    if (hallucinated.length === 0) return text;

    this.logger.warn(
      `[ai][guardrail] preço(s) alucinado(s): [${hallucinated.join(', ')}] | ` +
        `permitidos: [${allowedPrices.join(', ')}] | original: "${text.slice(0, 160)}"`,
    );

    if (args.remainingBudgetMs <= 5000) {
      this.logger.warn(
        `[ai][guardrail] sem budget pra regenerar (${args.remainingBudgetMs}ms), aplicando fallback direto`,
      );
      return this.stripPricesFromText(text);
    }

    try {
      const correction =
        `Sua resposta citou valores que NÃO existem nos resultados das ferramentas: ` +
        `${hallucinated.map((p) => `R$ ${p.toFixed(2).replace('.', ',')}`).join(', ')}. ` +
        `Os preços reais são: ${allowedPrices.map((p) => `R$ ${p.toFixed(2).replace('.', ',')}`).join(', ')}. ` +
        `Reescreva copiando priceDisplay LITERAL.`;

      const retryMessages: LlmMessage[] = [
        ...args.messages,
        { role: 'assistant', content: text },
        { role: 'user', content: correction },
      ];

      const retryTimeout = Math.min(this.perCallTimeoutMs, args.remainingBudgetMs);
      const { value: retry, durationMs } = await timed(() =>
        this.completeWithTimeout(
          {
            system: args.systemPrompt,
            messages: retryMessages,
            tools: this.provider.supportsToolCalling() ? args.toolDefinitions : undefined,
            maxTokens: 256,
            temperature: 0.1,
          } as LlmCompletionRequest,
          retryTimeout,
          'guardrail-regenerate',
        ),
      );
      this.logger.debug(`[ai][guardrail] regeneração em ${formatDuration(durationMs)}`);

      const retryText = retry.text?.trim() ?? '';
      const stillHallucinated: number[] = retryText
        ? this.guardrail.findHallucinatedPrices(retryText, allowedPrices)
        : [];

      if (retryText && stillHallucinated.length === 0) {
        this.logger.log(`[ai][guardrail] regeneração corrigiu a resposta.`);
        return retryText;
      }

      this.logger.warn(
        `[ai][guardrail] regeneração AINDA alucinou: [${
          stillHallucinated.length > 0 ? stillHallucinated.join(', ') : '(vazia)'
        }]. Usando fallback sem preço.`,
      );
    } catch (err) {
      this.logger.error(
        `[ai][guardrail] erro ao regenerar: ${(err as Error).message}. Usando fallback sem preço.`,
      );
    }

    return this.stripPricesFromText(text);
  }

  private stripPricesFromText(text: string): string {
    const stripped = text
      .replace(/R\$\s*[\d.]+(?:,\d{1,2})?/gi, '[consulte o valor]')
      .replace(/\d+\s*reais?\b/gi, '[consulte o valor]')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (stripped.length < 20) {
      return 'Peguei aqui! Só preciso confirmar o valor — pode repetir o produto que você quer ver?';
    }
    return `${stripped}\n\n(obs.: não consegui confirmar o valor agora, pode me perguntar o preço de novo que eu confiro?)`;
  }

  /**
   * System prompt curto + reforço EXPLÍCITO de matchQuality.
   * O incidente que motivou esta versão: cliente perguntou "carregadores
   * para samsung", a tool retornou Galaxy S24 (porque tinha "samsung" no
   * nome) e o bot vendeu Galaxy como se fosse carregador. As regras 3-4
   * tornam isso impossível.
   */
  private buildSystemPrompt(customInstructions?: string): string {
    return [
      'Você é atendente virtual de uma loja no WhatsApp. Curto, cordial, em português brasileiro.',
      '',
      'REGRAS RÍGIDAS:',
      '1. Use SOMENTE dados das ferramentas. NUNCA invente preço, cor, estoque, garantia.',
      '2. Para citar preço, COPIE LITERAL priceDisplay/fullPriceText do resultado. Não recalcule.',
      '3. matchQuality="none": NÃO existe o produto. NÃO ofereça outro tipo de produto. Diga honestamente que a loja não tem o item pedido e pergunte se aceita transferência para atendente humano.',
      '4. matchQuality="partial": existe produto PARECIDO mas com diferença (ver "notMatched"). Avise honestamente sobre a diferença ANTES de oferecer. Ex: "Não temos Samsung mas temos da Apple, te interessa?"',
      '5. matchQuality="exact": pode oferecer normalmente.',
      '6. Cores em customFields vêm como "laranja (#ff8000)" — diga só "laranja", nunca o hex.',
      '',
      'FERRAMENTAS:',
      '- search_products: cliente perguntou de produto/marca/cor/tamanho.',
      '- list_categories: cliente perguntou o que a loja vende em geral.',
      '- request_human_handoff: cliente irritado, pede atendente, problema sério, pede desconto, assistência técnica.',
      '',
      'NUNCA finja que um produto é o que o cliente pediu se não for. Se "matchQuality" disser que não bate, ACREDITE.',
      ...(customInstructions
        ? ['', 'INSTRUÇÕES DA LOJA:', customInstructions]
        : []),
    ].join('\n');
  }

  private async buildMessageHistory(conversationId: string): Promise<LlmMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        type: 'TEXT',
        content: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return messages
      .reverse()
      .slice(0, -1)
      .map((m: PrismaMessage) => ({
        role: m.direction === 'INBOUND' ? ('user' as const) : ('assistant' as const),
        content: m.content!,
      }));
  }
}
