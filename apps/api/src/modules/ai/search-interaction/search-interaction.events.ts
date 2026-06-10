export const SEARCH_INTERACTION_RECORDED = 'search.interaction.recorded';

// Payload já com o vetor da query no formato literal pgvector ('[...]') ou null.
// Não embeda nada aqui — o vetor vem reaproveitado da busca.
export interface SearchInteractionRecordedEvent {
  tenantId: string;
  conversationId: string | null;
  contactId: string | null;
  query: string;
  queryNormalized: string;
  queryVectorLiteral: string | null;
  resultsShown: unknown[];
  lexicalCount: number;
  vectorCount: number;
  fusedCount: number;
  matchQuality: string;
  outcome: string | null;
  latencyMs: number;
}
