import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from './catalog.tools';

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

/**
 * Camada de IA. Usa Claude com function calling pra consultar o catálogo.
 * Fácil de trocar por OpenAI mudando o client (schema das tools é compatível).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tools: CatalogTools,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY', ''),
    });
    this.model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
  }

  async generateReply(params: GenerateReplyParams): Promise<AiReplyResult> {
    const history = await this.buildMessageHistory(params.conversationId);
    const systemPrompt = this.buildSystemPrompt(params.instructions);

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: params.userMessage },
    ];

    // Loop de tool use — modelo pode chamar ferramentas várias vezes
    const MAX_ITERATIONS = 5;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: this.tools.getToolDefinitions() as any,
        messages,
      });

      // Se modelo terminou sem chamar tool, retorna resposta
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
          .trim();

        return { text };
      }

      // Se chamou tool, executa e volta pro loop
      if (response.stop_reason === 'tool_use') {
        const toolUses = response.content.filter((b) => b.type === 'tool_use') as any[];
        const toolResults: any[] = [];

        for (const toolUse of toolUses) {
          const result = await this.tools.execute(params.tenantId, toolUse.name, toolUse.input);

          // Handoff: interrompe e sinaliza
          if (result?.handoff) {
            return { handoff: true, handoffReason: result.reason };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        // Adiciona resposta do modelo e resultados das tools ao histórico
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    this.logger.warn('IA excedeu max iterations sem concluir');
    return { handoff: true, handoffReason: 'max iterations' };
  }

  private buildSystemPrompt(customInstructions?: string): string {
    return `Você é um atendente virtual de uma loja de eletrônicos e celulares no Brasil.

Seu trabalho é ajudar clientes no WhatsApp a encontrar produtos, tirar dúvidas sobre preço, estoque, garantia e fechar pedidos.

Regras importantes:
- Responda sempre em português brasileiro, de forma cordial e objetiva
- Mensagens curtas — WhatsApp não é e-mail. 2-3 frases por mensagem
- SEMPRE consulte o catálogo via ferramenta antes de falar de produto. NUNCA invente preço, estoque ou especificação
- Se o cliente pedir desconto, perguntar sobre assistência técnica, reclamar, ou pedir pra falar com alguém, use a ferramenta request_human_handoff
- Se não souber responder com certeza, use request_human_handoff — melhor escalar do que errar
- Ao mostrar produto, informe nome, preço (à vista e parcelado se houver), condição (lacrado/seminovo) e disponibilidade
- Sugira acessórios compatíveis quando o cliente pedir um celular (capa, película, fone)
${customInstructions ? `\nInstruções específicas da loja:\n${customInstructions}` : ''}`;
  }

  private async buildMessageHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
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
      .slice(0, -1) // remove a última (que é a mensagem atual do user)
      .map((m) => ({
        role: m.direction === 'INBOUND' ? 'user' : 'assistant',
        content: m.content!,
      }));
  }
}
