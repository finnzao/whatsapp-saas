/**
 * Utilitários para limitar duração de chamadas externas e medir tempo.
 *
 * Foco em defesa contra TRAVAMENTO (provider que nunca responde),
 * NÃO em interromper geração lenta porém funcional. Por isso os timeouts
 * no AiService são generosos quando o backend é Ollama local.
 */

export class LlmTimeoutError extends Error {
  readonly code = 'LLM_TIMEOUT';
  constructor(readonly timeoutMs: number, readonly operation: string) {
    super(`Timeout de ${timeoutMs}ms excedido em "${operation}"`);
    this.name = 'LlmTimeoutError';
  }
}

export async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  // ReturnType<typeof setTimeout> evita exigir @types/node como peer.
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(timeoutMs, operation));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; durationMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, durationMs: Date.now() - start };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
