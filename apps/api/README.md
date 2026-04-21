# Backend API - WhatsApp SaaS

Backend NestJS com integração WhatsApp (Evolution API) e IA (Claude com function calling).

## Setup

```bash
npm install
cp .env.example .env

# Garanta que o docker-compose está rodando (Postgres + Redis + Evolution)
cd ../.. && npm run docker:up && cd apps/api

npm run db:migrate
npm run db:seed    # cria loja demo com produtos e FAQs
npm run dev
```

API sobe em http://localhost:3001, docs em http://localhost:3001/docs

## Estrutura

```
src/
├── common/
│   ├── prisma/          PrismaService global
│   ├── decorators/      @CurrentTenant, @CurrentUser
│   └── types/           JwtPayload, AuthenticatedUser
├── queue/               Constantes de BullMQ
├── modules/
│   ├── auth/            Registro, login, JWT
│   ├── tenants/         Info do tenant atual
│   ├── users/           Usuários do tenant
│   ├── whatsapp/        Evolution provider + webhooks + worker
│   ├── conversations/   Gestão de conversas
│   ├── messages/        Envio manual
│   ├── contacts/        Clientes finais
│   ├── catalog/         Produtos e categorias
│   ├── orders/          Pedidos
│   ├── ai/              Claude + function calling no catálogo
│   ├── automations/     Orquestrador FAQ -> IA -> handoff
│   └── settings/        Configurações do tenant
└── main.ts
```

## Fluxo de mensagem

1. Cliente manda WhatsApp
2. Evolution API dispara webhook em `POST /webhooks/evolution`
3. `EvolutionWebhookController` valida, enfileira no BullMQ, responde 200
4. `InboundMessageProcessor` (worker) consome:
   - Resolve tenant pela instanceName
   - Ignora fromMe e grupos
   - Upsert do Contact
   - Cria/obtém Conversation
   - Salva Message
   - Se conversa está em BOT, chama `AutomationsService`
5. `AutomationsService`:
   - Checa palavras-chave de handoff
   - Tenta casar com FAQ (resposta instantânea, sem IA)
   - Fallback: chama `AiService` com function calling no catálogo
6. Se IA pediu handoff, converte conversa pra HUMAN; senão envia resposta via Evolution API

## Trocando o provider de WhatsApp

Para migrar da Evolution para Cloud API oficial (Meta):

1. Criar `src/modules/whatsapp/cloud/cloud-api.provider.ts` implementando `WhatsappProvider`
2. No `whatsapp.module.ts`, trocar:
   ```ts
   { provide: WHATSAPP_PROVIDER, useClass: CloudApiProvider }
   ```
3. Ajustar adapter no worker pra novo formato de webhook

A lógica de negócio (conversations, messages, AI) não muda.

## IA e function calling

O `AiService` roda um loop: modelo pode chamar tools (`search_products`, `check_product_availability`, `list_categories`, `request_human_handoff`) quantas vezes precisar (até 5 iterações) antes de responder.

As tools estão em `ai/catalog.tools.ts` e consultam o banco em tempo real com scope por tenant.

Para trocar por OpenAI, basta adaptar o client em `ai.service.ts` - o schema das tools é compatível.

## Segurança

- JWT com expiração 7d (configurável)
- Multi-tenant: todas as queries filtram por `tenantId` via `@CurrentTenant()`
- Bcrypt com salt 10 para senhas
- Helmet + CORS + ValidationPipe globais
- Throttler: 100 req/min por IP
