import { Injectable, Logger } from '@nestjs/common';

/**
 * Valida que a resposta textual do modelo não contém preços "inventados" —
 * isto é, preços em reais que NÃO aparecem em nenhum resultado de tool
 * que o modelo viu nesta conversa.
 *
 * Estratégia:
 * 1. Extrai todos os preços em BRL do texto gerado (padrão "R$ X,YZ" / "R$ X mil" / etc).
 * 2. Compara com um conjunto de preços permitidos (coletados dos tool_results).
 * 3. Se o modelo citou um preço que não está no conjunto, a resposta é
 *    considerada alucinada.
 *
 * Em produção, sistemas como Perplexity e Claude citations fazem algo análogo
 * com citation anchors. Aqui fazemos a versão leve e específica para preços,
 * que é o tipo de alucinação mais frequente e mais grave em e-commerce.
 */
@Injectable()
export class PriceGuardrailService {
  private readonly logger = new Logger(PriceGuardrailService.name);

  // Captura padrões como "R$ 14,14", "R$14.99", "R$ 2500", "R$ 2.500,00", "2500 reais".
  private readonly PRICE_REGEX =
    /(?:R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?))|(\d{1,6}(?:[.,]\d{1,2})?)\s*reais?\b/gi;

  /**
   * Extrai valores numéricos a partir do texto, normalizando formato
   * brasileiro (ponto = milhar, vírgula = decimal) para número JS.
   */
  extractPricesFromText(text: string): number[] {
    const prices: number[] = [];
    const seen = new Set<number>();

    for (const match of text.matchAll(this.PRICE_REGEX)) {
      const raw = (match[1] ?? match[2] ?? '').trim();
      if (!raw) continue;

      const n = this.parseBrl(raw);
      if (n === null) continue;
      // Evitamos falsos positivos tipo "iPhone 13" → "13 reais":
      // regex já exige a palavra "reais" nessa forma, mas se vier sozinha
      // sem "R$" OU "reais" não bate — ok.
      if (!seen.has(n)) {
        seen.add(n);
        prices.push(n);
      }
    }

    return prices;
  }

  private parseBrl(raw: string): number | null {
    // "2.500,00" → 2500.00
    // "2500,00"  → 2500.00
    // "2500"     → 2500
    // "14.99"    → 14.99 (formato ambíguo, tratamos como ponto decimal)
    if (!raw) return null;

    let cleaned = raw.replace(/\s/g, '');

    // Se tem vírgula, assumimos BR: ponto é milhar, vírgula é decimal.
    if (cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Sem vírgula: se tem ponto seguido de EXATAMENTE 3 dígitos, é separador
    // de milhar ("1.500" → 1500). Se tem ponto com 1-2 dígitos, é decimal ("14.99").
    else if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      const last = parts[parts.length - 1];
      if (last.length === 3) {
        cleaned = cleaned.replace(/\./g, '');
      }
    }

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Compara preços citados no texto contra o conjunto de preços permitidos.
   * Retorna quais foram alucinados (citados mas não estão no conjunto).
   */
  findHallucinatedPrices(text: string, allowedPrices: number[]): number[] {
    const cited = this.extractPricesFromText(text);
    if (cited.length === 0) return [];

    const allowedSet = new Set(allowedPrices.map((p) => this.roundToCents(p)));
    const hallucinated: number[] = [];

    for (const c of cited) {
      const rounded = this.roundToCents(c);
      if (!allowedSet.has(rounded)) {
        hallucinated.push(c);
      }
    }

    return hallucinated;
  }

  private roundToCents(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * Coleta todos os preços permitidos a partir dos tool_results acumulados
   * durante a conversa. Varre o JSON buscando campos conhecidos que contêm
   * preços (`_priceValue`, `price`, `priceCash`, `priceInstallment`) e
   * também tenta extrair números dos campos `priceDisplay` / `fullPriceText`.
   */
  collectAllowedPrices(toolResults: string[]): number[] {
    const prices = new Set<number>();

    for (const resultJson of toolResults) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(resultJson);
      } catch {
        continue;
      }

      this.walkAndCollect(parsed, prices);
    }

    return Array.from(prices);
  }

  private walkAndCollect(node: unknown, out: Set<number>): void {
    if (node === null || node === undefined) return;

    if (typeof node === 'number' && Number.isFinite(node)) {
      // Ignora números muito pequenos ou muito grandes que dificilmente
      // são preços (ex: installments=12, stock=4).
      if (node >= 0.5 && node <= 1_000_000) {
        out.add(this.roundToCents(node));
      }
      return;
    }

    if (typeof node === 'string') {
      // Extrai preços formatados de strings (priceDisplay, fullPriceText, etc).
      const found = this.extractPricesFromText(node);
      for (const p of found) out.add(this.roundToCents(p));
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) this.walkAndCollect(item, out);
      return;
    }

    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        // Ignora campos que sabemos que contêm números sem ser preço.
        if (
          [
            'id',
            'stock',
            'installments',
            'totalCandidates',
            'quantity',
            'order',
            'priority',
          ].includes(key)
        ) {
          continue;
        }
        this.walkAndCollect(value, out);
      }
    }
  }
}
