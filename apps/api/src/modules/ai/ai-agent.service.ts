import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from './catalog.tools';
import { LlmProviderFactory } from './providers/llm-provider.factory';
import type {
  LlmMessage,
  LlmContentBlock,
  LlmCompletionRequest,
} from './providers/llm-provider.interface';

const PRODUCT_INTENT_PATTERNS = [
  /\bo que (voc[êe]s? )?vend[ea]/i,
  /\bquais produtos/i,
  /\bquais categorias/i,
  /\bo que tem(?:\s+(?:aí|ae|ai|la|aqui))?\??/i,
  /\bque tipo de (coisa|produto)/i,
  /\btem[\s\S]{0,30}(pra|para) vender/i,
  /\bquero (ver|comprar|saber)/i,
  /\bme mostra/i,
  /\btem\b/i,
  /\bcat[áa]logo/i,
  /\bprodut/i,
];

function looksLikeProductIntent(text: string): boolean {
  return PRODUCT_INTENT_PATTERNS.some((p) => p.test(text));
}

interface AgentContext {
  tenantId: string;
  conversationId: string;
  contactName?: string;
  userMessage: string;
  history: LlmMessage[];
  systemPromptExtra?: string;
}

interface AgentResult {
  reply?: string;
  handoff?: { reason: string };
  usage?: { inputTokens: number; outputTokens: number };
}

const MAX_ITERATIONS = 5;

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogTools,
    private readonly providerFactory: LlmProviderFactory,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const provider = this.providerFactory.getMainProvider();
    const tools = this.catalog.getToolDefinitions();

    const systemPrompt = this.buildSystemPrompt(ctx);
    const messages: LlmMessage[] = [...ctx.history];

    let totalInput = 0;
    let totalOutput = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const forceTool = iteration === 0 && looksLikeProductIntent(ctx.userMessage);

      const request: LlmCompletionRequest = {
        system: systemPrompt,
        messages,
        tools,
        temperature: 0.3,
        maxTokens: 1024,
        ...(forceTool && { toolChoice: 'any' }),
      };

      if (forceTool) {
        this.logger.debug(`[agent] forçando tool_choice=any (intent de produto detectada)`);
      }

      const response = await provider.complete(request);

      totalInput += response.usage?.inputTokens ?? 0;
      totalOutput += response.usage?.outputTokens ?? 0;

      if (response.toolCalls && response.toolCalls.length > 0) {
        const assistantBlocks: LlmContentBlock[] = [];
        if (response.text) {
          assistantBlocks.push({ type: 'text', text: response.text });
        }
        for (const call of response.toolCalls) {
          assistantBlocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.input,
          });
        }
        messages.push({ role: 'assistant', content: assistantBlocks });

        const toolResults: LlmContentBlock[] = [];
        for (const call of response.toolCalls) {
          const result = await this.catalog.execute(ctx.tenantId, call.name, call.input);

          if (
            result &&
            typeof result === 'object' &&
            !Array.isArray(result) &&
            (result as any).handoff === true
          ) {
            return {
              handoff: { reason: (result as any).reason ?? 'solicitado pela IA' },
              usage: { inputTokens: totalInput, outputTokens: totalOutput },
            };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(result),
          });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      return {
        reply: response.text,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
      };
    }

    this.logger.warn('[agent] MAX_ITERATIONS atingido');
    return {
      reply:
        'Desculpe, tive um problema para processar isso. Pode reformular sua pergunta ou pedir para falar com um atendente?',
      usage: { inputTokens: totalInput, outputTokens: totalOutput },
    };
  }

  private buildSystemPrompt(ctx: AgentContext): string {
    const base = [
      'Você é um atendente virtual de uma loja, educado, objetivo e focado em vendas.',
      'Responda com rapidez, clareza e cordialidade, no estilo WhatsApp (curto e natural).',
      '',
      'REGRAS ABSOLUTAS — não negociáveis:',
      '1. NUNCA invente produtos, categorias, preços, estoque, prazos ou características.',
      '2. Quando o cliente perguntar o que a loja vende ou quais produtos existem (incluindo perguntas genéricas como "o que tem aí?", "o que vocês vendem?"), SEMPRE chame a ferramenta list_categories ANTES de responder. NUNCA liste categorias de cabeça.',
      '3. Quando o cliente mencionar um produto específico ou característica (marca, cor, tamanho), SEMPRE chame search_products ANTES de responder. NUNCA diga "temos X" sem confirmar via tool.',
      '4. Se uma tool não retornar resultados, diga honestamente que não encontrou e pergunte mais detalhes, ou ofereça transferir para atendente.',
      '5. Nunca ofereça descontos sem autorização.',
      '6. Se o cliente pedir atendente, estiver irritado ou reclamar, chame request_human_handoff.',
      '',
      'COMPORTAMENTO DE VENDAS (quando a tool retornar produtos):',
      '- Cite apenas produtos que a tool retornou.',
      '- Destaque 1-2 benefícios em vez de listar todas as specs.',
      '- Ao mencionar um celular, ofereça película/capa/carregador no final.',
      '- Tente fechar: "posso separar pra você?" / "quer que eu finalize o pedido?".',
      '',
      'Cliente atual: ' + (ctx.contactName ?? 'Cliente'),
    ];

    if (ctx.systemPromptExtra) {
      base.push('', 'INSTRUÇÕES ESPECÍFICAS DA LOJA:', ctx.systemPromptExtra);
    }

    return base.join('\n');
  }
}
