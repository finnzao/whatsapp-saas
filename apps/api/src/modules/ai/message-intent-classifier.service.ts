import { Injectable, Logger } from '@nestjs/common';

import { LlmProviderFactory } from './providers/llm-provider.factory';
import { LlmProvider } from './providers/llm-provider.interface';
import { fingerprint, normalize } from '../../common/utils/text-normalize';

export type MessageIntent =
  | 'product_search'
  | 'product_question'
  | 'category_browse'
  | 'price_inquiry'
  | 'order_status'
  | 'complaint'
  | 'greeting'
  | 'small_talk'
  | 'handoff_request'
  | 'unclear';

export interface MessageIntentResult {
  intent: MessageIntent;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
  durationMs: number;
}

const INTENT_DESCRIPTIONS: Record<MessageIntent, string> = {
  product_search: 'cliente quer encontrar/comprar um produto, mencionando tipo, marca, característica',
  product_question: 'cliente pergunta detalhes sobre produto específico (cor, tamanho, garantia, originalidade)',
  category_browse: 'cliente pergunta genericamente o que a loja vende ou quer ver categorias',
  price_inquiry: 'cliente pergunta valor/preço de produto específico',
  order_status: 'cliente quer saber status de pedido/entrega já feito',
  complaint: 'cliente reclama de produto, serviço, atraso, defeito',
  greeting: 'apenas saudação inicial sem pedido (oi, bom dia, olá)',
  small_talk: 'agradecimento, despedida, conversa social sem pedido',
  handoff_request: 'cliente pede explicitamente para falar com humano/atendente',
  unclear: 'mensagem não se enquadra em nenhuma das anteriores ou é ambígua',
};

const GREETING_PATTERNS = [
  /^(oi+|ola+|olá+|opa+|eae+|salve+|bom\s+dia|boa\s+tarde|boa\s+noite)\.?!?$/i,
  /^(hey|hi|hello)\.?!?$/i,
];

const SMALL_TALK_PATTERNS = [
  /^(obrigad[oa]+|valeu+|brigad[oa]+|grat[oa]+|tks|thanks)\.?!?$/i,
  /^(tchau+|ate\s+mais|até\s+mais|flw|falou+)\.?!?$/i,
  /^(tudo\s+bem\??|td\s+bem\??|blz\??|beleza\??)$/i,
];

const HANDOFF_PATTERNS = [
  /\b(falar|atendente|humano|pessoa|vendedor|atende)\b.*\b(humano|atendente|pessoa)\b/i,
  /\bquero\s+(falar|conversar)\s+com\s+(uma?\s+)?(humano|pessoa|atendente)/i,
  /\bme\s+passa\s+(pra|para)\s+(um\s+)?(humano|atendente)/i,
];

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
export class MessageIntentClassifier {
  private readonly logger = new Logger(MessageIntentClassifier.name);
  private readonly provider: LlmProvider;
  private readonly cache = new TinyLruCache<MessageIntent>(500);

  constructor(factory: LlmProviderFactory) {
    this.provider = factory.getClassifierProvider();
  }

  async classify(userMessage: string): Promise<MessageIntentResult> {
    const start = Date.now();
    const trimmed = userMessage.trim();

    const fast = this.fastPath(trimmed);
    if (fast) {
      return { ...fast, durationMs: Date.now() - start };
    }

    const cacheKey = fingerprint(trimmed);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[msg-intent] cache hit "${trimmed.slice(0, 40)}" → ${cached}`);
      return { intent: cached, confidence: 'high', reason: 'cache hit', durationMs: Date.now() - start };
    }

    const available = await this.provider.isAvailable();
    if (!available) {
      this.logger.warn(`[msg-intent] provider ${this.provider.name} indisponível`);
      return { intent: 'unclear', confidence: 'low', reason: 'provider unavailable', durationMs: Date.now() - start };
    }

    try {
      const intent = await this.classifyWithLlm(trimmed);
      this.cache.set(cacheKey, intent);
      this.logger.debug(`[msg-intent] "${trimmed.slice(0, 40)}" → ${intent} (${Date.now() - start}ms)`);
      return { intent, confidence: 'high', durationMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`[msg-intent] erro: ${(err as Error).message}`);
      return { intent: 'unclear', confidence: 'low', reason: 'classifier error', durationMs: Date.now() - start };
    }
  }

  private fastPath(text: string): Omit<MessageIntentResult, 'durationMs'> | null {
    const norm = normalize(text);

    if (GREETING_PATTERNS.some((p) => p.test(norm))) {
      return { intent: 'greeting', confidence: 'high', reason: 'pattern match' };
    }
    if (SMALL_TALK_PATTERNS.some((p) => p.test(norm))) {
      return { intent: 'small_talk', confidence: 'high', reason: 'pattern match' };
    }
    if (HANDOFF_PATTERNS.some((p) => p.test(norm))) {
      return { intent: 'handoff_request', confidence: 'high', reason: 'pattern match' };
    }

    return null;
  }

  private async classifyWithLlm(userMessage: string): Promise<MessageIntent> {
    const intentList = (Object.entries(INTENT_DESCRIPTIONS) as [MessageIntent, string][])
      .map(([key, desc]) => `- ${key}: ${desc}`)
      .join('\n');

    const systemPrompt = `Você classifica mensagens de clientes de loja em UMA das categorias abaixo.

Categorias:
${intentList}

Regras:
- Escolha SOMENTE uma categoria.
- Responda APENAS com JSON válido, sem markdown, sem prefixo: {"intent": "<categoria>"}
- Em caso de dúvida real, use "unclear".
- "tem iphone?" é product_search, não product_question.
- "esse iphone é original?" é product_question.
- "quanto custa?" sozinho ou "qual o preço?" é price_inquiry.
- Reclamação de defeito/atraso/erro = complaint, mesmo educada.`;

    const response = await this.provider.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: `Mensagem: "${userMessage}"\n\nResponda APENAS o JSON.` }],
      maxTokens: 60,
      temperature: 0.0,
      responseFormat: 'json',
    });

    const text = response.text.trim();
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error(`resposta sem JSON: ${text.slice(0, 80)}`);

    const parsed = JSON.parse(match[0]) as { intent?: string };
    const intent = parsed.intent as MessageIntent | undefined;

    if (!intent || !(intent in INTENT_DESCRIPTIONS)) {
      throw new Error(`intent inválida: ${intent}`);
    }
    return intent;
  }
}
