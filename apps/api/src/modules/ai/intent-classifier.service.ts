import { Injectable, Logger } from '@nestjs/common';

import { LlmProviderFactory } from './providers/llm-provider.factory';
import { LlmProvider } from './providers/llm-provider.interface';

export interface FaqCandidate {
  id: string;
  question: string;
  keywords: string[];
}

export interface IntentClassificationResult {
  matched: boolean;
  faqId?: string;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

@Injectable()
export class IntentClassifier {
  private readonly logger = new Logger(IntentClassifier.name);
  private readonly provider: LlmProvider;
  private readonly cache = new Map<string, IntentClassificationResult>();
  private readonly MAX_CACHE_SIZE = 500;

  constructor(private readonly factory: LlmProviderFactory) {
    this.provider = this.factory.getClassifierProvider();
  }

  async classify(
    userMessage: string,
    candidates: FaqCandidate[],
  ): Promise<IntentClassificationResult> {
    if (candidates.length === 0) {
      return { matched: false, confidence: 'high', reason: 'no candidates' };
    }

    if (candidates.length === 1 && this.isUnambiguous(userMessage, candidates[0])) {
      return {
        matched: true,
        faqId: candidates[0].id,
        confidence: 'high',
        reason: 'unambiguous keyword match',
      };
    }

    const cacheKey = this.buildCacheKey(userMessage, candidates);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[intent] cache hit para "${userMessage.slice(0, 40)}"`);
      return cached;
    }

    const available = await this.provider.isAvailable();
    if (!available) {
      this.logger.warn(
        `[intent] provider ${this.provider.name} indisponível, caindo no primeiro match`,
      );
      return {
        matched: true,
        faqId: candidates[0].id,
        confidence: 'low',
        reason: 'provider unavailable, fallback',
      };
    }

    try {
      const result = await this.classifyWithLlm(userMessage, candidates);
      this.addToCache(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error(`[intent] erro ao classificar: ${(error as Error).message}`);
      return {
        matched: true,
        faqId: candidates[0].id,
        confidence: 'low',
        reason: 'classifier error, fallback',
      };
    }
  }

  private isUnambiguous(message: string, faq: FaqCandidate): boolean {
    const wordCount = message.trim().split(/\s+/).length;
    if (wordCount > 8) return false;

    const normalized = message.toLowerCase();
    const matchingKeywords = faq.keywords.filter((kw) =>
      normalized.includes(kw.toLowerCase()),
    );
    return matchingKeywords.length >= 2 || (wordCount <= 4 && matchingKeywords.length >= 1);
  }

  private async classifyWithLlm(
    userMessage: string,
    candidates: FaqCandidate[],
  ): Promise<IntentClassificationResult> {
    const faqList = candidates
      .map((c, i) => `${i + 1}. [id=${c.id}] ${c.question}`)
      .join('\n');

    const systemPrompt = `Você é um classificador de intenção de mensagens de clientes de uma loja.
Recebe uma mensagem do cliente e uma lista de FAQs candidatas (que deram match por palavra-chave).
Seu trabalho é decidir se a mensagem é REALMENTE sobre um desses FAQs, ou se a palavra-chave deu um falso positivo.

Retorne SOMENTE um JSON válido com este formato exato:
{"faqId": "ID_DA_FAQ_OU_NULL", "confidence": "high", "reason": "breve explicação"}

Regras:
- Se a mensagem for claramente sobre uma das FAQs, retorne o id e confidence "high"
- Se for ambíguo mas provável, retorne o id mais provável e confidence "medium"
- Se a palavra-chave deu match mas a intenção real é OUTRA (ex: "qual horário posso retirar minhas compras" tem "horário" mas pergunta sobre retirada de pedido, não horário de funcionamento), retorne faqId: "null"
- Seja rigoroso: na dúvida, prefira retornar "null" e deixar a IA principal lidar`;

    const response = await this.provider.complete({
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Mensagem do cliente: "${userMessage}"\n\nFAQs candidatas:\n${faqList}\n\nResponda APENAS com o JSON.`,
        },
      ],
      maxTokens: 200,
      temperature: 0.1,
      responseFormat: 'json',
    });

    const text = response.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`resposta sem JSON válido: ${text}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      faqId: string | null | 'null';
      confidence: 'high' | 'medium' | 'low';
      reason?: string;
    };

    const faqId =
      parsed.faqId === null || parsed.faqId === 'null' || !parsed.faqId ? undefined : parsed.faqId;

    this.logger.debug(
      `[intent] "${userMessage.slice(0, 40)}" -> faqId=${faqId ?? 'null'} conf=${parsed.confidence} (${parsed.reason})`,
    );

    return {
      matched: faqId !== undefined,
      faqId,
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  }

  private buildCacheKey(message: string, candidates: FaqCandidate[]): string {
    const ids = candidates
      .map((c) => c.id)
      .sort()
      .join(',');
    return `${message.toLowerCase().trim()}::${ids}`;
  }

  private addToCache(key: string, result: IntentClassificationResult): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }
}
