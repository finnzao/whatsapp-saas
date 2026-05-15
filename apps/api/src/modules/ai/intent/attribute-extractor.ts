import { normalize } from '../../../common/utils/text-normalize';

// mapa de sinônimos → chave canônica do atributo.
// lojista cadastra customFields com keys livres ("cor", "armazenamento", "voltagem"),
// cliente pergunta com gírias ("quantos gbs", "é bivolt?"). Esse mapa une os dois.
const ATTRIBUTE_SYNONYMS: Record<string, string[]> = {
  armazenamento: ['gb', 'gbs', 'gigas', 'memoria', 'memória', 'storage', 'capacidade', 'tb'],
  cor: ['cor', 'color', 'tonalidade'],
  tamanho: ['tamanho', 'numero', 'numero do', 'numeração', 'numeracao', 'pp', 'gg'],
  voltagem: ['voltagem', 'volt', 'bivolt', '110', '220', '110v', '220v'],
  material: ['material', 'tecido', 'composicao', 'composição'],
  peso: ['peso', 'kg', 'gramas'],
  garantia: ['garantia', 'garante'],
  marca: ['marca', 'fabricante'],
  modelo: ['modelo', 'versao', 'versão'],
};

// Padrões de pergunta que indicam intent de atributo específico.
// Fast-path: se bater aqui, nem precisa chamar LLM classifier.
const ATTRIBUTE_QUESTION_PATTERNS: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: 'armazenamento', pattern: /\b(quant[oa]s?|qual)\s+(gb|gbs?|gigas?|memoria|memória|armazenamento|tb|capacidade)\b/i },
  { canonical: 'cor', pattern: /\b(qual|que)\s+(a\s+)?cor\b/i },
  { canonical: 'cor', pattern: /\bque\s+cores\s+(tem|tê?m|disponível|disponiveis)/i },
  { canonical: 'tamanho', pattern: /\b(qual|que)\s+(o\s+)?tamanho\b/i },
  { canonical: 'tamanho', pattern: /\b(que|quais)\s+tamanhos\b/i },
  { canonical: 'voltagem', pattern: /\b(é|e)\s+(bivolt|110|220)\b/i },
  { canonical: 'voltagem', pattern: /\b(qual|que)\s+(a\s+)?voltagem\b/i },
  { canonical: 'material', pattern: /\b(qual|que)\s+(o\s+)?material\b/i },
  { canonical: 'peso', pattern: /\b(qual|que|quanto)\s+(o\s+)?peso\b/i },
  { canonical: 'garantia', pattern: /\b(tem|qual)\s+garantia\b/i },
];

export interface AttributeMatch {
  canonical: string;
  raw: string;
}

// Detecta se a mensagem é uma pergunta sobre atributo específico.
// Retorna o atributo canônico (ex: "armazenamento") e o termo que disparou ("gbs").
export function detectAttributeIntent(message: string): AttributeMatch | null {
  const norm = normalize(message);
  for (const { canonical, pattern } of ATTRIBUTE_QUESTION_PATTERNS) {
    const m = pattern.exec(message) || pattern.exec(norm);
    if (m) return { canonical, raw: m[0] };
  }
  return null;
}

// Procura um campo em customFields que corresponda à query do atributo.
// Tenta match direto pela key, depois via sinônimos.
export function findCustomFieldByAttribute(
  attributeQuery: string,
  customFields: Record<string, unknown> | null | undefined,
): { field: string; value: unknown } | null {
  if (!customFields) return null;
  const queryNorm = normalize(attributeQuery);

  for (const [key, value] of Object.entries(customFields)) {
    const keyNorm = normalize(key);
    if (keyNorm === queryNorm || keyNorm.includes(queryNorm) || queryNorm.includes(keyNorm)) {
      return { field: key, value };
    }
  }

  for (const [canonical, syns] of Object.entries(ATTRIBUTE_SYNONYMS)) {
    const matchedBySyn = syns.some((s) => queryNorm.includes(normalize(s)));
    if (!matchedBySyn && normalize(canonical) !== queryNorm) continue;

    for (const [key, value] of Object.entries(customFields)) {
      const keyNorm = normalize(key);
      if (keyNorm === normalize(canonical) || keyNorm.includes(normalize(canonical))) {
        return { field: key, value };
      }
    }
  }

  return null;
}

// Lista canônicos conhecidos — usado pelo prompt pra orientar o modelo.
export function listKnownAttributes(): string[] {
  return Object.keys(ATTRIBUTE_SYNONYMS);
}
