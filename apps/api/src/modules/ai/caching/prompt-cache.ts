// Camada neutra de "contexto cacheável" (estilo MCP): descreve, de forma
// agnóstica ao provider, o que é estável o suficiente para ser cacheado entre
// turnos/iterações. Providers que suportam (Anthropic) aplicam nativamente;
// os demais (Ollama, OpenAI-compatible) ignoram o hint sem quebrar.
export interface PromptCacheHint {
  // System prompt (papel + regras + categorias) é estável -> cacheável.
  system?: boolean;
  // Schema das tools é estável entre chamadas -> cacheável.
  tools?: boolean;
}

// Preset usado pelo agente: system + tools são o prefixo estável da conversa.
export const STABLE_CONTEXT_CACHE: PromptCacheHint = { system: true, tools: true };
