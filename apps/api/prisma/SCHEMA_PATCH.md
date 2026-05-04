// =============================================================
// PATCH PARA apps/api/prisma/schema.prisma
// =============================================================
// Aplique as mudanças abaixo ao schema existente.
// Não substitua o arquivo todo — só adicione/modifique o indicado.
// =============================================================


// -------------------------------------------------------------
// 1. Adicionar relação em Tenant model
// -------------------------------------------------------------
model Tenant {
  // ... campos existentes mantidos ...

  // ADICIONAR:
  searchInteractions     SearchInteraction[]

  @@map("tenants")
}


// -------------------------------------------------------------
// 2. Adicionar relação em Conversation model
// -------------------------------------------------------------
model Conversation {
  // ... campos existentes mantidos ...

  // ADICIONAR:
  searchInteractions SearchInteraction[]

  // ... resto mantido ...

  @@map("conversations")
}


// -------------------------------------------------------------
// 3. Adicionar relação em Contact model
// -------------------------------------------------------------
model Contact {
  // ... campos existentes mantidos ...

  // ADICIONAR:
  searchInteractions SearchInteraction[]

  // ... resto mantido ...

  @@map("contacts")
}


// -------------------------------------------------------------
// 4. Modificar Product — adicionar embedding e relação
// -------------------------------------------------------------
model Product {
  // ... campos existentes mantidos ...

  // ADICIONAR (na ordem que preferir):
  embedding             Unsupported("vector(1024)")?
  embeddingUpdatedAt    DateTime?
  embeddingSourceHash   String?

  // ADICIONAR relação:
  searchInteractions    SearchInteraction[]

  // O índice HNSW é criado pela migration manual (Prisma não suporta).
  // Os outros índices @@index permanecem.

  @@map("products")
}


// -------------------------------------------------------------
// 5. NOVO model: SearchInteraction
// -------------------------------------------------------------
// Cada vez que CatalogTools.searchProducts roda, gravamos aqui.
// Esses dados alimentam:
//   - Dashboard de qualidade da busca (queries com 0 resultado, etc)
//   - Export pra fine-tune do embedder (pares query → produto comprado)
//   - Auditoria do que a IA está mostrando
// -------------------------------------------------------------
model SearchInteraction {
  id                String   @id @default(uuid())
  tenantId          String
  conversationId    String?
  contactId         String?

  // Texto bruto da busca (antes do tokenize/normalize).
  query             String
  // Texto normalizado (lowercase, sem acento, sem stopwords).
  queryNormalized   String
  // Embedding da query (mesma dimensão dos produtos). Usado pra
  // detectar queries semanticamente parecidas no dashboard.
  queryEmbedding    Unsupported("vector(1024)")?

  // Lista de produtos retornados, com rank e score em cada source.
  // Schema: [{ productId, name, finalRank, lexicalRank?, vectorRank?,
  //            lexicalScore?, vectorScore?, rrfScore }]
  resultsShown      Json
  lexicalCount      Int      @default(0)
  vectorCount       Int      @default(0)
  fusedCount        Int      @default(0)

  // 'exact' | 'partial' | 'none' — herdado do CatalogTools.
  matchQuality      String

  // Preenchido depois quando detectarmos qual produto o cliente
  // realmente "escolheu". Pode ser via add_to_cart, pedido fechado,
  // ou check_product_availability subsequente na mesma conversa.
  selectedProductId String?

  // Resultado inferido. Atualizado por jobs assíncronos:
  //   'purchased'      → cliente comprou esse produto
  //   'added_to_cart'  → adicionou mas não fechou
  //   'asked_more'     → pediu detalhes (segunda tool call)
  //   'no_results'     → tool retornou matchQuality=none
  //   'ignored'        → não houve follow-up dentro de 1h
  outcome           String?
  outcomeAt         DateTime?

  // Tempo total da busca em ms (lexical + vetorial + RRF).
  latencyMs         Int?

  createdAt         DateTime @default(now())

  tenant            Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  conversation      Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  contact           Contact?      @relation(fields: [contactId], references: [id], onDelete: SetNull)
  selectedProduct   Product?      @relation(fields: [selectedProductId], references: [id], onDelete: SetNull)

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([tenantId, outcome])
  @@index([conversationId])
  @@map("search_interactions")
}
