-- Ativa extensão pgvector. Requer Postgres 14+ e pgvector instalado no servidor.
-- Em desenvolvimento (Docker), o image `ankane/pgvector` ou `pgvector/pgvector:pg16` já vem com tudo.
CREATE EXTENSION IF NOT EXISTS vector;

-- ===========================================================
-- Coluna de embedding em products
-- bge-m3 retorna 1024 dimensões. Se trocar de modelo, precisa
-- DROP COLUMN + ADD com novo tamanho (não dá ALTER de dimensão).
-- ===========================================================
ALTER TABLE "products" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "products" ADD COLUMN "embeddingUpdatedAt" TIMESTAMP(3);
ALTER TABLE "products" ADD COLUMN "embeddingSourceHash" TEXT;

-- Índice HNSW pra busca por similaridade cossena.
-- m=16 ef_construction=64: padrão razoável pra <100k registros por tenant.
-- Pra milhões de registros, considerar m=24 e particionar por tenant.
CREATE INDEX "products_embedding_hnsw_idx" ON "products"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice auxiliar pra detectar produtos sem embedding ou com embedding stale.
CREATE INDEX "products_embedding_null_idx"
  ON "products" ("tenantId")
  WHERE "embedding" IS NULL;

-- ===========================================================
-- SearchInteraction: registro de cada chamada de search_products
-- pelo agente. Base pra dashboard de qualidade e training data
-- futuro (fine-tune do embedder, re-ranker).
-- ===========================================================
CREATE TABLE "search_interactions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT,
  "contactId" TEXT,
  "query" TEXT NOT NULL,
  "queryNormalized" TEXT NOT NULL,
  "queryEmbedding" vector(1024),
  "resultsShown" JSONB NOT NULL,
  "lexicalCount" INTEGER NOT NULL DEFAULT 0,
  "vectorCount" INTEGER NOT NULL DEFAULT 0,
  "fusedCount" INTEGER NOT NULL DEFAULT 0,
  "matchQuality" TEXT NOT NULL,
  "selectedProductId" TEXT,
  "outcome" TEXT,
  "outcomeAt" TIMESTAMP(3),
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "search_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "search_interactions_tenantId_createdAt_idx"
  ON "search_interactions" ("tenantId", "createdAt" DESC);

CREATE INDEX "search_interactions_tenantId_outcome_idx"
  ON "search_interactions" ("tenantId", "outcome")
  WHERE "outcome" IS NOT NULL;

CREATE INDEX "search_interactions_conversationId_idx"
  ON "search_interactions" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

ALTER TABLE "search_interactions"
  ADD CONSTRAINT "search_interactions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_interactions"
  ADD CONSTRAINT "search_interactions_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "search_interactions"
  ADD CONSTRAINT "search_interactions_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "search_interactions"
  ADD CONSTRAINT "search_interactions_selectedProductId_fkey"
  FOREIGN KEY ("selectedProductId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
