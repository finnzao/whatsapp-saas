# WhatsApp SaaS — Atendimento Inteligente para Varejo

Plataforma SaaS multi-tenant que integra WhatsApp (Evolution API) com IA para atendimento automatizado de varejo, com foco inicial em lojas de eletrônicos e celulares.

## Arquitetura

Monorepo organizado em apps e packages:

```
whatsapp-saas/
├── apps/
│   ├── api/          Backend NestJS (API + workers + webhooks)
│   └── web/          Frontend Next.js (painel do lojista)
├── packages/
│   ├── database/     Schema Prisma compartilhado
│   └── shared/       Tipos e utilitários compartilhados
└── docker/           Docker compose com Postgres, Redis, Evolution API
```

## Stack

Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO
Frontend: Next.js 14 (App Router), TailwindCSS, TanStack Query, Zustand
Infra: Docker Compose, Evolution API (WhatsApp)
IA: Anthropic Claude ou OpenAI (function calling no catálogo)

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm 10+

## Setup inicial

```bash
# 1. Instalar dependências
npm install

# 2. Subir infraestrutura (Postgres, Redis, Evolution API)
npm run docker:up

# 3. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Rodar migrations
npm run db:migrate

# 5. Iniciar em desenvolvimento
npm run dev
```

A API sobe em http://localhost:3001
O painel sobe em http://localhost:3000
A Evolution API sobe em http://localhost:8080

## Estrutura modular do backend

Cada módulo é independente e representa um domínio do negócio:

- `auth` — autenticação JWT, registro, login
- `tenants` — lojistas (multi-tenancy)
- `users` — usuários do painel por tenant
- `whatsapp` — integração com Evolution API (instâncias + webhooks)
- `conversations` — gestão de conversas
- `messages` — mensagens enviadas e recebidas
- `contacts` — clientes finais (quem fala com a loja)
- `catalog` — produtos e categorias
- `orders` — pedidos gerados via conversa
- `ai` — camada de IA com function calling no catálogo
- `automations` — respostas automáticas, menus, horário
- `settings` — configurações por tenant

## Fluxo de mensagem

1. Cliente envia mensagem no WhatsApp
2. Evolution API recebe e dispara webhook em `/webhooks/evolution`
3. Handler valida, identifica tenant pela instância, e enfileira em BullMQ
4. Worker processa: classifica intenção, roteia (FAQ, IA, pedido, humano)
5. Resposta é enviada de volta via Evolution API
6. Painel atualiza em tempo real via Socket.IO

## Desenvolvimento

Ver documentação específica em cada app:
- [apps/api/README.md](./apps/api/README.md)
- [apps/web/README.md](./apps/web/README.md)
