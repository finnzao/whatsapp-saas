# Guia de início rápido

Passo a passo para subir o projeto do zero em um ambiente de desenvolvimento local.

## Pré-requisitos

- Node.js 20 ou superior
- Docker e Docker Compose
- npm 10 ou superior

## Passo 1 - Instalar dependências

Na raiz do projeto:

```bash
npm install
```

Isso instala dependências de todos os workspaces (raiz, api, web) de uma vez.

## Passo 2 - Subir infraestrutura via Docker

```bash
cp docker/.env.example docker/.env
npm run docker:up
```

Isso sobe:
- PostgreSQL na porta 5432
- Redis na porta 6379
- Evolution API na porta 8080

Confira se tudo subiu: `docker ps` deve mostrar 3 containers rodando.

## Passo 3 - Configurar variáveis de ambiente

Backend:
```bash
cp apps/api/.env.example apps/api/.env
```

Abra `apps/api/.env` e preencha:
- `ANTHROPIC_API_KEY`: sua chave da Anthropic (para a IA)
- `JWT_SECRET`: troque para uma string aleatória longa

Frontend:
```bash
cp apps/web/.env.example apps/web/.env.local
```

O default já aponta para localhost:3001 (backend).

## Passo 4 - Rodar migrations e seed

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
cd ../..
```

O seed cria uma loja demo com:
- Usuário: admin@loja.com / senha123
- 3 categorias (Celulares, Acessórios, Áudio)
- 6 produtos de exemplo
- 4 FAQs

## Passo 5 - Iniciar os serviços

Em um terminal:
```bash
npm run dev
```

Isso sobe a API (porta 3001) e o painel (porta 3000) em paralelo.

## Passo 6 - Testar

1. Abra http://localhost:3000
2. Faça login com admin@loja.com / senha123
3. Vá em Configurações > WhatsApp
4. Clique em "Conectar WhatsApp"
5. Escaneie o QR Code com o WhatsApp que quiser usar para testes
6. Peça para um amigo mandar uma mensagem (ou use outro número)
7. Veja a mensagem chegar na aba Conversas
8. Teste a IA perguntando "tem iPhone 13?" - ela vai consultar o catálogo e responder

## URLs úteis

- Painel: http://localhost:3000
- API: http://localhost:3001
- Swagger (docs da API): http://localhost:3001/docs
- Evolution API: http://localhost:8080
- Prisma Studio (inspeção do banco): rode `npm run db:studio` dentro de `apps/api`

## Dicas

- Se o webhook da Evolution não estiver chegando no backend, confirme que `WEBHOOK_URL` no docker usa `host.docker.internal` (funciona no Docker Desktop)
- Em Linux puro, troque por `http://172.17.0.1:3001/webhooks/evolution`
- Se precisar expor o webhook pra internet em dev, use `ngrok http 3001` e coloque a URL do ngrok em `WEBHOOK_URL`
- O lojista não precisa abrir o WhatsApp Web, mas o celular que ele escaneou deve estar ligado e conectado à internet
- Para resetar o banco: `docker compose -f docker/docker-compose.yml down -v` apaga os volumes

## Problemas comuns

**QR Code não aparece**: verifique os logs da Evolution (`npm run docker:logs`). Pode levar 5-10 segundos após criar instância.

**IA não responde**: confirme que `ANTHROPIC_API_KEY` está configurada no `apps/api/.env`.

**Webhook não chega**: `curl -X POST http://localhost:3001/webhooks/evolution -d '{}' -H "Content-Type: application/json"` deve retornar 200. Se retornar, o problema é da Evolution não estar chamando a URL - confira `WEBHOOK_URL` no docker.

**Banco "database does not exist"**: o Postgres do Docker já cria `whatsapp_saas`, mas a Evolution precisa do seu próprio DB `evolution`. Ambos são criados automaticamente pelo Prisma.
