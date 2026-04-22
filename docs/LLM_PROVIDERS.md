# Guia de Providers de IA

O sistema suporta 3 backends de LLM através de uma interface única. Você pode alternar entre eles sem mudar uma linha de código do app — só muda variáveis de ambiente.

## Quando usar cada um

| Provider | Melhor para | Custo | Setup |
|---|---|---|---|
| `anthropic` | Produção inicial, qualidade máxima | $ pago por token | Só criar API key |
| `ollama` | Desenvolvimento local, testes, uso pessoal | Grátis | Instalar + baixar modelo |
| `openai-compatible` | Produção escalada (vLLM self-hosted) ou APIs gerenciadas (Together, Fireworks) | Grátis (self-hosted) ou $/token | Subir servidor inference |

## Como escolher via env

No `apps/api/.env`:

```bash
AI_BACKEND=anthropic           # padrão
# AI_BACKEND=ollama
# AI_BACKEND=openai-compatible
```

Opcionalmente, você pode usar providers **diferentes** para o agente principal e o classificador de intenção:

```bash
AI_BACKEND=anthropic                 # agente principal usa Claude (melhor tool use)
AI_CLASSIFIER_BACKEND=ollama         # classificador roda local (economiza $)
```

Isso é uma otimização comum: o classificador de intenção é uma tarefa simples de classificação, um modelo 7B local resolve perfeitamente. Já o agente principal com function calling se beneficia de um modelo de ponta.

---

## 1. Ollama (desenvolvimento local)

### Instalação

**Windows/Mac:**
Baixe em https://ollama.com/download e instale.

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Via Docker (recomendado se você já usa Docker):**
```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.ollama.yml up -d
```

### Baixar modelos

```bash
# Modelo balanceado, bom para tool use (5GB)
ollama pull llama3.1:8b

# Melhor em português (9GB)
ollama pull qwen2.5:14b

# Apenas para classificação (~2GB, não precisa tool use)
ollama pull llama3.2:3b
```

Verifique:
```bash
ollama list
```

### Configurar no .env

```bash
AI_BACKEND=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

### Testar

Com o backend rodando (`npm run dev`), vá em `/debug` no frontend e envie:
- "qual horário vocês abrem?" — deve responder FAQ
- "tem iPhone disponível?" — deve usar tool calling no catálogo

Acompanhe os logs:
```
[llm] provider principal: ollama
[AiService] ...
```

### Modelos que suportam tool calling confiável

O Ollama ativa tool calling somente quando detecta que o modelo suporta. Modelos verificados:

- `llama3.1` (todas versões) — recomendado
- `llama3.2` (1B/3B para classificação, 11B/90B para agente)
- `qwen2.5` (todas versões) — excelente em português
- `mistral-nemo` — bom balance
- `mistral-small` — melhor qualidade
- `command-r` — otimizado para RAG

Modelos **sem** tool calling (use só para classificação):
- `gemma2`, `phi3`, `tinyllama`

### Troubleshooting

**"model not found"** — rode `ollama pull NOME_DO_MODELO`.

**Respostas lentas** — modelos sem GPU são ~10x mais lentos. Rode `nvidia-smi` durante uma inferência para confirmar que a GPU está sendo usada.

**Tool calling não funciona** — verifique se seu modelo suporta (lista acima). Troque para `llama3.1:8b` se estiver em dúvida.

**Ollama no Docker não acessa GPU** — você precisa do NVIDIA Container Toolkit instalado (`sudo apt install nvidia-container-toolkit` no Linux, ou Docker Desktop com WSL2 + nvidia drivers no Windows).

---

## 2. Anthropic (Claude)

### Setup

1. Crie conta em https://console.anthropic.com
2. Em Settings → API Keys, gere uma chave
3. Configure:

```bash
AI_BACKEND=anthropic
ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

### Modelos recomendados

- `claude-haiku-4-5-20251001` — rápido e barato, ótimo para MVP
- `claude-sonnet-4-7-20260101` (ou outro Sonnet atual) — melhor qualidade, 5x mais caro
- `claude-opus-4-7` — topo de linha, caro

### Custo aproximado

Haiku: ~$0,80 por 1M tokens input, ~$4 output. Na prática, ~$0.002 por conversa típica.

---

## 3. OpenAI-compatible (vLLM e APIs gerenciadas)

### Opção A: vLLM self-hosted (produção)

**Cenário ideal:** você tem 1+ GPU dedicada (A10, A100, H100, RTX 4090, etc) e quer servir seu próprio modelo com alto throughput.

**Por que não Ollama em produção:** Ollama processa **uma** requisição por vez por modelo. vLLM faz **batching contínuo** — 50-200 requisições simultâneas na mesma GPU, latência similar, throughput 10-20x maior.

#### Deploy rápido com Docker

```bash
docker run -d --gpus all \
  --name vllm \
  -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model meta-llama/Meta-Llama-3.1-8B-Instruct \
  --enable-auto-tool-choice \
  --tool-call-parser llama3_json \
  --max-model-len 8192
```

#### Configurar no .env

```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=http://localhost:8000/v1
LLM_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
LLM_API_KEY=no-key-required
```

#### Escolha de hardware (custos em dez/2025)

| GPU | VRAM | Preço hora (cloud) | Modelo recomendado |
|---|---|---|---|
| RTX 4090 | 24GB | ~$0.40/h (Runpod) | Llama 3.1 8B (fp16) ou 13B quantizado |
| A10 | 24GB | ~$0.75/h (AWS) | Llama 3.1 8B em fp16 |
| A100 40GB | 40GB | ~$1.50/h | Llama 3.1 70B quantizado (AWQ) |
| A100 80GB | 80GB | ~$2.50/h | Llama 3.1 70B em fp16 |
| H100 | 80GB | ~$3.50/h | Múltiplos modelos grandes |

Para um SaaS começando, **1x RTX 4090 com Llama 3.1 8B** aguenta com tranquilidade ~500 lojistas ativos (5-10 msgs/seg). Custo ~$300/mês na Runpod.

#### Providers de GPU cloud (baratos)

- **Runpod** — pay-per-second, fácil de escalar
- **Lambda Labs** — GPUs dedicadas mensais
- **Hetzner GEX44** — bare metal com GPU, barato na Europa
- **Vast.ai** — marketplace P2P, mais barato mas menos confiável

### Opção B: APIs gerenciadas

Se você não quer gerenciar infra mas quer pagar por token em vez de assinatura fechada:

#### Together AI
```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=https://api.together.xyz/v1
LLM_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo
LLM_API_KEY=sua-key-together
```
Custo: ~$0.18 por 1M tokens no Llama 3.1 8B (muito mais barato que Claude).

#### Fireworks AI
```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=https://api.fireworks.ai/inference/v1
LLM_MODEL=accounts/fireworks/models/llama-v3p1-8b-instruct
LLM_API_KEY=sua-key-fireworks
```

#### Groq (ultra-rápido)
```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=sua-key-groq
```

### Opção C: LocalAI

Alternativa ao vLLM, mais simples mas performance menor. Docker:
```bash
docker run -d -p 8080:8080 localai/localai:latest
```

```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=http://localhost:8080/v1
LLM_MODEL=gpt-4   # LocalAI aliases os modelos
```

---

## Rodada de testes recomendada

1. **Começa com `anthropic`** para ter baseline de qualidade
2. **Troca pra `ollama`** e compara: ele sabe chamar `search_products`? Responde bem em português?
3. **Se Ollama ficou bom**, planeja produção com `openai-compatible` + vLLM em GPU cloud

---

## Arquitetura por baixo

Tudo usa a mesma interface `LlmProvider`:

```typescript
interface LlmProvider {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  supportsToolCalling(): boolean;
  isAvailable(): Promise<boolean>;
}
```

Isso significa que **adicionar um novo provider** (ex: Google Gemini, Cohere, seu próprio endpoint) é só criar uma classe que implementa a interface e registrar no `AiModule`.

O `AiService` e o `IntentClassifier` não sabem qual provider está rodando por baixo — só chamam `this.provider.complete(...)`.

---

## Como migrar de dev (Ollama) para prod (vLLM)

Zero alteração de código. Só muda variáveis:

**Dev local:**
```bash
AI_BACKEND=ollama
OLLAMA_MODEL=llama3.1:8b
```

**Produção:**
```bash
AI_BACKEND=openai-compatible
LLM_BASE_URL=http://vllm-server.internal:8000/v1
LLM_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
```

Mesmo modelo (Llama 3.1 8B), mesmo comportamento, só o inference engine diferente. Seus prompts, suas tools, sua lógica — tudo continua igual.

---

## Limitações conhecidas

**Tool calling em Ollama:** é um pouco mais flaky que Claude. Mensagens complexas podem ocasionalmente não chamar a tool certa. Se notar isso, considere:
- Usar modelo maior (`qwen2.5:14b` ou `llama3.1:70b`)
- Deixar o `AI_BACKEND=anthropic` só no agente principal e `AI_CLASSIFIER_BACKEND=ollama` só no classificador

**Latência:** LLMs locais sem GPU são impraticáveis (30-60s por resposta). Com GPU decente, ~1-3s. Claude via API: ~1-2s.

**Multi-tenancy em modelo único:** um único vLLM serve todos os tenants. Se precisar de isolamento forte (ex: cada lojista tem seu fine-tune), precisa de múltiplas instâncias ou LoRA adapters — fora do escopo deste MVP.
