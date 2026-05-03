const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'pra', 'por', 'com', 'sem', 'e', 'ou', 'que',
  'tem', 'ter', 'tens', 'teria',
  'ae', 'ai', 'la', 'ali', 'aqui',
  'favor', 'obrigado', 'obrigada',
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function simpleStem(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('oes')) return token.slice(0, -3) + 'ao';
  if (token.endsWith('aes')) return token.slice(0, -3) + 'ao';
  if (token.endsWith('res')) return token.slice(0, -2);
  if (token.endsWith('ses')) return token.slice(0, -2);
  if (token.endsWith('ns')) return token.slice(0, -2) + 'm';
  if (token.endsWith('is') && token.length > 4) return token.slice(0, -2) + 'l';
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .map(simpleStem);
}

export function fingerprint(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return normalize(text).trim();
  return tokens.sort().join(' ');
}

export { STOP_WORDS };
