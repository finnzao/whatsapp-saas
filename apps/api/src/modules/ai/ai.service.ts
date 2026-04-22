import { Injectable, Logger } from '@nestjs/common';
import { Message as PrismaMessage } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogTools } from './catalog.tools';
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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: LlmProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: CatalogTools,
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
      parameters: t.input_schema,
    }));

    const MAX_ITERATIONS = 5;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.provider.complete({
        system: systemPrompt,
        messages,
        tools: this.provider.supportsToolCalling() ? toolDefinitions : undefined,
        maxTokens: 1024,
      });

      if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
        return { text: response.text };
      }

      const toolResultBlocks: LlmContentBlock[] = [];

      for (const toolCall of response.toolCalls) {
        const result = await this.tools.execute(params.tenantId, toolCall.name, toolCall.input);

        if (result && typeof result === 'object' && 'handoff' in result && (result as any).handoff) {
          return { handoff: true, handoffReason: (result as any).reason };
        }

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result),
        });
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
