export function maskPhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Máscara de moeda BRL "digitando da direita pra esquerda", estilo e-commerce.
 * Exemplo: usuário digita "1234" → mostra "12,34". Digita mais um "5" → "123,45".
 * Sempre mantém 2 casas decimais e separa milhar com ponto acima de mil.
 */
export function maskMoneyBr(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  const num = Number(digits) / 100;
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte string mascarada (ex: "1.234,56") para número (1234.56).
 * Retorna 0 para entradas inválidas.
 */
export function parseMoneyBr(masked: string | null | undefined): number {
  if (!masked) return 0;
  const normalized = String(masked).replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formata um número como string BRL sem o "R$" (útil pra preencher inputs com máscara).
 * Ex: 1234.56 → "1.234,56"
 */
export function formatMoneyBr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata como moeda completa (com R$). Para exibição, não pra input.
 */
export function formatCurrencyBrl(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calcula o valor por parcela, arredondando pra 2 casas decimais.
 * Retorna null se os inputs não formarem um cálculo válido.
 */
export function calculateInstallmentValue(
  totalInstallmentAmount: number | null | undefined,
  installments: number | null | undefined,
): number | null {
  if (
    !totalInstallmentAmount ||
    !Number.isFinite(totalInstallmentAmount) ||
    totalInstallmentAmount <= 0 ||
    !installments ||
    !Number.isInteger(installments) ||
    installments < 1
  ) {
    return null;
  }
  return Math.round((totalInstallmentAmount / installments) * 100) / 100;
}

export function maskSku(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
}

export function maskSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

export function maskCustomFieldKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[0-9]+/, '')
    .slice(0, 40);
}
