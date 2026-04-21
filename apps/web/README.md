# Frontend - WhatsApp SaaS

Painel web para o lojista gerenciar conversas, catálogo, pedidos e configurações.

## Stack

- Next.js 14 (App Router)
- TailwindCSS
- TanStack Query (cache e sincronização com a API)
- Zustand (auth state)
- React Hook Form
- Sonner (toasts)
- Lucide (ícones)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sobe em http://localhost:3000

## Estrutura

```
src/
├── app/
│   ├── (auth)/           Login e registro
│   ├── (dashboard)/      Painel protegido (requer auth)
│   │   ├── conversas/    Inbox de WhatsApp + chat
│   │   ├── catalogo/     CRUD de produtos
│   │   ├── pedidos/      Lista de pedidos
│   │   └── configuracoes/ WhatsApp, IA, FAQs
│   └── providers.tsx     React Query
├── components/
│   └── layout/           Sidebar
├── lib/
│   ├── api/              Cliente axios
│   ├── hooks/            Hooks de domínio (useAuth, useProducts, useConversations)
│   └── utils/            Helpers
└── stores/               Zustand stores
```

## Credenciais de dev (após rodar seed no backend)

- Email: admin@loja.com
- Senha: senha123
