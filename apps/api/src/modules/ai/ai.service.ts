import { Injectable, Logger } from '@nestjs/common';
import { Message as PrismaMessage } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from './catalog.tools';
import { PriceGuardrailService } from './price-guardrail.service';
import { LlmProviderFactory } from './providers/llm-provider.factory';
import {
  LlmProvider,
  LlmMessage,
  LlmContentBlock,
} from './providers/llm-provider.interface';

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
  /\b(iphone|xiaomi|samsung|motorola|apple|celular|smartphone|capinha|pel[íi]cula|fone|carregador|airpod|notebook|tv)\b/i,
];

function looksLikeProductQuery(text: string): boolean {
  return PRODUCT_INTENT_PATTERNS.some((p) => p.test(text));
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: LlmProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: CatalogTools,
    private readonly guardrail: PriceGuardrailService,
    private readonly factory: LlmProviderFactory,
  ) {
    this.provider = this.factory.getMainProvider();
  }

  async generateReply(params: GenerateReplyParams): Promise<AiReplyResult> {
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

    const forceTool = looksLikeProductQuery(params.userMessage);
    if (forceTool) {
      this.logger.debug(
        `[ai] intenção de produto detectada em "${params.userMessage.slice(0, 60)}", forçando consulta ao catálogo`,
      );
    }

    // Coletamos todos os tool_results da conversa atual para o guardrail.
    // Um conjunto vazio = modelo não viu preços nesta conversa ainda, logo
    // qualquer preço citado por ele é alucinação.
    const toolResultsSeen: string[] = [];

    const MAX_ITERATIONS = 5;
    let lastTextResponse: string | undefined;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.provider.complete({
        system: systemPrompt,
        messages,
        tools: this.provider.supportsToolCalling() ? toolDefinitions : undefined,
        maxTokens: 1024,
        temperature: 0.3,
        ...(i === 0 && forceTool && this.provider.supportsToolCalling()
          ? { toolChoice: 'any' as const }
          : {}),
      } as any);

      if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
        lastTextResponse = response.text;
        const validated = await this.validateAndMaybeRegenerate({
          text: response.text,
          toolResultsSeen,
          systemPrompt,
          messages,
          toolDefinitions,
        });
        return { text: validated };
      }

      const toolResultBlocks: LlmContentBlock[] = [];
      let handoffFromTool: { reason: string } | null = null;

      for (const toolCall of response.toolCalls) {
        const result = await this.tools.execute(
          params.tenantId,
          toolCall.name,
          toolCall.input,
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
      `[ai] MAX_ITERATIONS atingido para "${params.userMessage.slice(0, 60)}" — devolvendo fallback sem escalar`,
    );
    return {
      text:
        lastTextResponse ??
        'Desculpe, não consegui processar sua pergunta agora. Pode me dar mais detalhes sobre o que você procura? Marca, modelo, faixa de preço...',
    };
  }

  /**
   * Executa a checagem do guardrail de preço. Se achar preço alucinado,
   * pede ao modelo pra regerar UMA vez com instrução explícita corrigindo.
   * Se ainda assim alucinar, substitui por uma resposta segura que NÃO
   * cita valor.
   */
  private async validateAndMaybeRegenerate(args: {
    text: string;
    toolResultsSeen: string[];
    systemPrompt: string;
    messages: LlmMessage[];
    toolDefinitions: any[];
  }): Promise<string> {
    const { text, toolResultsSeen } = args;

    if (!text || toolResultsSeen.length === 0) return text;

    const allowedPrices = this.guardrail.collectAllowedPrices(toolResultsSeen);
    const hallucinated = this.guardrail.findHallucinatedPrices(text, allowedPrices);

    if (hallucinated.length === 0) return text;

    this.logger.warn(
      `[ai][guardrail] preço(s) alucinado(s) detectado(s): [${hallucinated.join(', ')}] | ` +
        `permitidos: [${allowedPrices.join(', ')}] | resposta original: "${text.slice(0, 160)}"`,
    );

    // Tentativa 1 de regeneração: injeta correção e pede nova resposta.
    try {
      const correction =
        `Sua resposta anterior citou valores monetários que NÃO existem nos resultados das ferramentas: ` +
        `${hallucinated.map((p) => `R$ ${p.toFixed(2).replace('.', ',')}`).join(', ')}. ` +
        `Os preços reais dos produtos consultados são: ` +
        `${allowedPrices.map((p) => `R$ ${p.toFixed(2).replace('.', ',')}`).join(', ')}. ` +
        `Reescreva sua resposta usando os campos priceDisplay/fullPriceText LITERAIS dos resultados. ` +
        `Se precisar citar preço, copie a string exatamente como aparece em priceDisplay.`;

      const retryMessages: LlmMessage[] = [
        ...args.messages,
        { role: 'assistant', content: text },
        { role: 'user', content: correction },
      ];

      const retry = await this.provider.complete({
        system: args.systemPrompt,
        messages: retryMessages,
        tools: this.provider.supportsToolCalling() ? args.toolDefinitions : undefined,
        maxTokens: 512,
        temperature: 0.1,
      } as any);

      const retryText = retry.text?.trim() ?? '';

      const stillHallucinated =
        retryText && this.guardrail.findHallucinatedPrices(retryText, allowedPrices);

      if (retryText && (!stillHallucinated || stillHallucinated.length === 0)) {
        this.logger.log(`[ai][guardrail] regeneração corrigiu a resposta.`);
        return retryText;
      }

      this.logger.warn(
        `[ai][guardrail] regeneração AINDA alucinou: [${stillHallucinated?.join(', ') ?? '(vazia)'}]. Usando fallback sem preço.`,
      );
    } catch (err) {
      this.logger.error(
        `[ai][guardrail] erro ao regenerar: ${(err as Error).message}. Usando fallback sem preço.`,
      );
    }

    // Fallback defensivo: remove menções de valor e substitui por frase neutra.
    // Isso garante que o cliente NUNCA recebe preço errado. Pior cenário: ele
    // não recebe preço e repergunta — muito melhor que receber valor inventado.
    return this.stripPricesFromText(text);
  }

  /**
   * Remove menções de valor (R$ X, X reais) do texto e deixa um placeholder
   * pro cliente pedir o valor de novo. Usado como último recurso.
   */
  private stripPricesFromText(text: string): string {
    const stripped = text
      .replace(/R\$\s*[\d.]+(?:,\d{1,2})?/gi, '[consulte o valor]')
      .replace(/\d+\s*reais?\b/gi, '[consulte o valor]')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Se sobrou muito pouco depois do strip, devolve mensagem genérica.
    if (stripped.length < 20) {
      return 'Peguei aqui! Só preciso confirmar o valor — pode repetir o produto que você quer ver?';
    }
    return `${stripped}\n\n(obs.: não consegui confirmar o valor agora, pode me perguntar o preço de novo que eu confiro?)`;
  }

  private buildSystemPrompt(customInstructions?: string): string {
    return [
      'Você é um atendente virtual de uma loja no WhatsApp, cordial e objetivo.',
      'Responda em português brasileiro, em tom de WhatsApp (curto, 1-3 frases, informal mas profissional).',
      '',
      '═══════════════════════════════════════════════════════════════',
      'REGRAS DE GROUNDING — CRÍTICAS, NÃO NEGOCIÁVEIS',
      '═══════════════════════════════════════════════════════════════',
      '',
      '1. NUNCA invente preços. Os resultados das ferramentas já vêm com os',
      '   campos `priceDisplay`, `fullPriceText`, `priceCashDisplay` e',
      '   `installmentsDisplay` PRÉ-FORMATADOS em reais. Você DEVE COPIAR',
      '   a string exatamente como aparece. NÃO converta, NÃO arredonde, NÃO',
      '   recalcule, NÃO ajuste — mesmo que o valor pareça estranho ou baixo.',
      '',
      '2. SE o resultado diz priceDisplay: "R$ 14,14", você escreve EXATAMENTE',
      '   "R$ 14,14" — não "R$ 14" nem "R$ 2500" nem "R$ 14,00". Caractere',
      '   por caractere.',
      '',
      '3. NUNCA invente dados em geral. Cores, tamanhos, estoque, garantia,',
      '   condição (novo/seminovo) — tudo DEVE vir literalmente do resultado.',
      '',
      '4. VERIFIQUE O matchQuality. Todo retorno de search_products vem com:',
      '   - "exact": o produto bate com o que o cliente pediu → ofereça normalmente.',
      '   - "partial": o produto É PARECIDO MAS NÃO É o que o cliente pediu → você',
      '     DEVE avisar honestamente. Use o campo "notMatched" de cada resultado.',
      '     Ex: cliente pediu "azul", notMatched: ["azul"] → "Não temos azul, mas',
      '     temos este modelo em [cor real]. Interessa?"',
      '   - "none": não tem nada → diga honestamente e peça alternativa.',
      '',
      '5. CORES em customFields já vêm traduzidas (ex: "laranja (#ff8000)"). Use',
      '   só o nome da cor na resposta, NUNCA o código hex.',
      '',
      '═══════════════════════════════════════════════════════════════',
      'COMO USAR AS FERRAMENTAS',
      '═══════════════════════════════════════════════════════════════',
      '',
      'Cliente pergunta sobre produto específico (mesmo informal: "tem iphone azul ae?"):',
      '  → SEMPRE chame search_products ANTES de responder.',
      '  → Passe todas as características na query: query="iphone azul 128gb".',
      '',
      'Cliente pergunta o que a loja vende genericamente:',
      '  → Chame list_categories.',
      '',
      'Cliente pergunta o preço de um produto já mostrado:',
      '  → Copie `fullPriceText` do resultado anterior. NÃO chame tool de novo',
      '    SÓ pra buscar preço.',
      '',
      '═══════════════════════════════════════════════════════════════',
      'QUANDO ESCALAR PARA HUMANO (request_human_handoff)',
      '═══════════════════════════════════════════════════════════════',
      '',
      'ESCALE apenas se:',
      '- Cliente pede explicitamente ("quero falar com atendente")',
      '- Cliente está irritado/reclamando de pedido existente',
      '- Cliente pede desconto, negociação ou condição especial',
      '- Cliente pergunta sobre assistência técnica, conserto, garantia já vendida',
      '- Cliente relata problema grave (produto com defeito, entrega perdida, cobrança errada)',
      '',
      'NÃO ESCALE se:',
      '- Cliente só perguntou sobre um produto que você não encontrou → ofereça alternativa',
      '- Cliente deu pouca informação → peça mais detalhes',
      '- Você "não tem certeza" → consulte a tool e copie o que ela retornou',
      '',
      '═══════════════════════════════════════════════════════════════',
      'ESTILO DE VENDA',
      '═══════════════════════════════════════════════════════════════',
      '',
      '- Ao mostrar produto: nome + priceDisplay literal + stockText + 1 característica.',
      '- Feche perguntando: "quer que eu separe?" / "posso finalizar o pedido?".',
      '- Ao vender celular, sugira acessório (capa, película, fone).',
      ...(customInstructions
        ? [
            '',
            '═══════════════════════════════════════════════════════════════',
            'INSTRUÇÕES ESPECÍFICAS DA LOJA',
            '═══════════════════════════════════════════════════════════════',
            '',
            customInstructions,
          ]
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
      take: 10,
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
