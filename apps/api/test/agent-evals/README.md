# Agent Evals — guardrail de regressão

Suite de testes que dispara contra `/debug/simulate-inbound` e valida as respostas via SSE. Roda contra a API real, com o LLM real configurado no `.env`. Sem mocks: pega regressão de prompt, de tool, de classificador e de tudo no meio.

## Como rodar

```bash
# Em um terminal, a API rodando
cd apps/api
npm run dev

# Em outro
cd apps/api
npx ts-node test/agent-evals/run-evals.ts
```

Saída esperada — código 0 se tudo passa, 1 se algum caso falha. Use em CI.

## Adicionando casos

Edite `cases.json`. Estrutura:

```json
{
  "name": "id-unico",
  "seed": true,                     // opcional: roda POST /dev/seed antes
  "messages": [
    {
      "send": "texto do cliente",
      "expect": {
        "contains": ["fragmento obrigatório"],
        "containsAny": ["um", "ou", "outro"],
        "notContains": ["isto não pode aparecer"],
        "maxLength": 200,
        "handoff": false
      }
    }
  ]
}
```

Múltiplos `messages` simulam uma conversa em sequência. Bom para casos onde o contexto importa, como o bug do "quantos gbs" que só aparece depois de o cliente já ter perguntado do produto.

## Variáveis de ambiente

| var | default | uso |
| --- | --- | --- |
| `EVAL_API_URL` | `http://localhost:3001` | endpoint da API |
| `EVAL_EMAIL` | `admin@loja.com` | login |
| `EVAL_PASSWORD` | `senha123` | login |
| `EVAL_TIMEOUT_MS` | `60000` | tempo máximo de espera por bot_reply |
| `EVAL_FILTER` | — | substring para rodar só alguns casos |
| `EVAL_FILE` | `./cases.json` | arquivo de casos |

Exemplo:

```bash
EVAL_FILTER=attribute npx ts-node test/agent-evals/run-evals.ts
```

## O que ele detecta

- Bot que responde preço quando cliente perguntou atributo
- Bot que inventa atributos não cadastrados
- Bot que vira humano sem motivo (ou que não vira quando deveria)
- Resposta longa demais (verbosidade)
- Regressões de FAQ / saudação / handoff por keyword
- Quebra de prompt que faz produto sumir

## Limitações

- Não é determinístico: temperatura > 0 no LLM principal. Casos devem usar matchers tolerantes (`containsAny`, não match exato).
- Roda contra dados reais do banco. O `seed: true` ajuda mas pode acumular sujeira entre execuções — recomendo rodar em tenant dedicado de eval.
- Não testa latência. Cada caso é binário (passou/falhou). Se quiser tracking de p95, agregue os `durationMs` retornados.
