# Campos Personalizados — Arquitetura

## Problema

Cada lojista tem necessidades diferentes para cadastrar produtos:

- Loja de **moda**: cor, tamanho, material, coleção
- Loja de **eletrônicos**: voltagem, consumo, certificação
- Loja de **alimentação**: peso, validade, alergênicos
- Loja de **cosméticos**: volume, tipo de pele, fragrância

É impossível prever todos os campos no schema. A solução é deixar o lojista criar os campos que quiser.

## Opções analisadas

### Opção 1: JSON solto (descartada)

Colocar tudo em `metadata: Json?`. Flexível, mas **sem validação, sem tipos, sem descoberta** — cada produto pode ter campos diferentes, a IA não saberia que campos existem na loja, e o frontend não conseguiria renderizar formulários coerentes.

### Opção 2: EAV (Entity-Attribute-Value) (descartada)

Tabela `product_attribute_values (productId, attributeId, value)`. Permite queries complexas, mas:
- Performance ruim (muitos joins)
- SQL verboso
- Tipagem frágil (tudo é string)
- Difícil indexar por múltiplos campos ao mesmo tempo

### Opção 3: JSONB com schema separado (ESCOLHIDA) ✅

Dois artefatos trabalhando juntos:

**A. Tabela de definições (`custom_field_definitions`)**

Descreve os campos que o tenant criou. É o "schema dinâmico":

```prisma
model CustomFieldDefinition {
  id       String
  tenantId String
  entity   String     // "product", "contact", etc
  key      String     // "cor", "tamanho"
  label    String     // "Cor", "Tamanho"
  type     CustomFieldType  // TEXT, SELECT, NUMBER, COLOR...
  options  String[]   // para SELECT/MULTISELECT
  required Boolean
  ...
}
```

**B. Coluna JSONB na entidade (`products.customFields`)**

Armazena os valores por produto. Flexível e rápido:

```sql
{ "cor": "Azul", "tamanho": "M", "voltagem": "Bivolt" }
```

**C. Índice GIN no Postgres**

```sql
CREATE INDEX products_customFields_idx
  ON products USING GIN (customFields jsonb_path_ops);
```

Isso permite queries como "produtos onde `customFields @> '{"cor":"Azul"}'`" com performance de índice, mesmo com milhões de produtos.

## Fluxo

1. Lojista cria campo em `/configuracoes` → aba "Campos personalizados"
2. Sistema registra em `custom_field_definitions` (tenant-scoped)
3. Quando lojista cria/edita produto, o frontend busca as definições e renderiza os campos dinâmicos via `CustomFieldRenderer`
4. No submit, backend valida cada valor contra a definição (tipo, opções, required) via `CustomFieldsService.validateAndSanitize()`
5. Valor salva em `products.customFields` (JSONB)
6. IA (em `CatalogTools.searchProducts`) busca também dentro de `customFields` — cliente pode pedir "camisa azul" e a IA encontra mesmo se "azul" estiver no custom field

## Validação

Toda validação está centralizada em `CustomFieldsService.validateAndSanitize()`:

- `TEXT/TEXTAREA` → coerção para string
- `NUMBER` → conversão + `isFinite`
- `BOOLEAN` → truthy/falsy
- `SELECT` → valor precisa estar em `options`
- `MULTISELECT` → array de valores, todos precisam estar em `options`
- `DATE` → parse + ISO string
- `COLOR` → regex `/^#[0-9a-fA-F]{6}$/`
- `required: true` → rejeita vazio

Se algo falha, retorna `BadRequestException` com mensagem agregada.

## Benefícios concretos

1. **Sem migration** — lojista cria campos sozinho, zero intervenção do dev
2. **Performance** — índice GIN deixa queries rápidas mesmo com 1M+ produtos
3. **Tipado** — tanto backend quanto frontend sabem o tipo e validam
4. **IA-aware** — a IA consulta os campos customizados automaticamente
5. **Multi-tenant** — cada tenant tem seus próprios campos, isolados
6. **Reversível** — deletar definição não apaga dados (só tira do formulário)

## Exemplos de queries

### Produtos azuis

```typescript
await prisma.product.findMany({
  where: {
    tenantId,
    customFields: { path: ['cor'], equals: 'Azul' },
  },
});
```

### Produtos tamanho M ou G

```typescript
await prisma.product.findMany({
  where: {
    tenantId,
    customFields: { path: ['tamanho'], in: ['M', 'G'] },
  },
});
```

### Produtos bivolt

```typescript
await prisma.product.findMany({
  where: {
    tenantId,
    customFields: { path: ['voltagem'], equals: 'Bivolt' },
  },
});
```

Todas usam o índice GIN.

## Limitações e futuro

- **Não há histórico de mudanças** de schema — se o lojista mudar opções de um SELECT, produtos antigos podem ter valores "órfãos". Está OK para MVP, podemos adicionar `valueHistory` se for dor.
- **Não há filtros dinâmicos na UI** de listagem. Hoje a IA usa os campos no atendimento, mas o lojista não consegue filtrar "mostra todos os produtos vermelhos" no painel. Próximo passo natural.
- **Tipos limitados.** Não há `FILE`, `REFERENCE`, `JSON`. Adicionar novos tipos é só estender o enum + o switch no `CustomFieldRenderer` e `validateAndSanitize`.
