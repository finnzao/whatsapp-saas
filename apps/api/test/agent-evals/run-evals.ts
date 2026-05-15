import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const API_URL = process.env.EVAL_API_URL ?? 'http://localhost:3001';
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS ?? '60000');
const FILTER = process.env.EVAL_FILTER ?? '';
const CASES_FILE =
  process.env.EVAL_FILE ?? path.join(__dirname, 'cases.json');
// ambientes de dev.
const CREDENTIALS_TRY_ORDER: Array<{ email: string; password: string; label: string }> = [
  ...(process.env.EVAL_EMAIL && process.env.EVAL_PASSWORD
    ? [{ email: process.env.EVAL_EMAIL, password: process.env.EVAL_PASSWORD, label: 'env' }]
    : []),
  { email: 'admin@loja.com', password: 'senha123', label: 'seed default' },
  { email: 'emailteste@gmail.com', password: '#Teste12345', label: 'fallback alt' },
];

interface ExpectClause {
  contains?: string[];
  containsAny?: string[];
  containsAny2?: string[];
  notContains?: string[];
  handoff?: boolean;
  maxLength?: number;
}

interface CaseStep {
  send: string;
  expect: ExpectClause;
}

interface EvalCase {
  name: string;
  skip?: boolean;
  description?: string;
  seed?: boolean;
  messages: CaseStep[];
}

interface CaseResult {
  name: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
  steps: Array<{ sent: string; received: string; failures: string[] }>;
}

// ----------------------------- HTTP helpers ------------------------------

function request(
  method: string,
  url: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          try {
            const parsed = chunks ? JSON.parse(chunks) : null;
            resolve({ status: res.statusCode ?? 0, body: parsed });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: chunks });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function consumeOneReply(token: string): Promise<
  | { type: 'bot_reply'; content: string }
  | { type: 'handoff'; content: string; reason: string }
  | { type: 'timeout' }
> {
  return new Promise((resolve) => {
    const u = new URL(`${API_URL}/debug/stream?token=${encodeURIComponent(token)}`);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        let buf = '';
        let done = false;

        const finish = (result: any) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          res.destroy();
          resolve(result);
        };

        const timer = setTimeout(() => finish({ type: 'timeout' }), TIMEOUT_MS);

        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json);
              if (ev.type === 'bot_reply') finish({ type: 'bot_reply', content: ev.content });
              else if (ev.type === 'handoff') finish({ type: 'handoff', content: ev.content, reason: ev.reason });
            } catch {
              // ignora payload mal formatado
            }
          }
        });
        res.on('error', () => finish({ type: 'timeout' }));
        res.on('end', () => finish({ type: 'timeout' }));
      },
    );
    req.on('error', () => resolve({ type: 'timeout' }));
  });
}

// ------------------------------ Validators -------------------------------

function checkExpect(received: string, expect: ExpectClause, wasHandoff: boolean): string[] {
  const failures: string[] = [];
  const lower = (received ?? '').toLowerCase();

  if (expect.handoff && !wasHandoff) {
    failures.push(`esperava handoff, mas recebeu resposta normal: "${received.slice(0, 80)}"`);
    return failures;
  }
  if (!expect.handoff && wasHandoff) {
    failures.push(`não esperava handoff, mas conversa foi transferida`);
    return failures;
  }
  if (wasHandoff) return failures;

  if (expect.contains) {
    for (const needle of expect.contains) {
      if (!lower.includes(needle.toLowerCase())) {
        failures.push(`esperava conter "${needle}"`);
      }
    }
  }

  const checkAny = (list: string[] | undefined, label: string) => {
    if (!list || list.length === 0) return;
    const ok = list.some((s) => lower.includes(s.toLowerCase()));
    if (!ok) failures.push(`${label} — nenhum de [${list.map((x) => `"${x}"`).join(', ')}] apareceu`);
  };
  checkAny(expect.containsAny, 'containsAny');
  checkAny(expect.containsAny2, 'containsAny2');

  if (expect.notContains) {
    for (const needle of expect.notContains) {
      if (lower.includes(needle.toLowerCase())) {
        failures.push(`não podia conter "${needle}"`);
      }
    }
  }

  if (expect.maxLength && received.length > expect.maxLength) {
    failures.push(`resposta longa demais (${received.length} > ${expect.maxLength} chars)`);
  }

  return failures;
}

// --------------------------------- Main ----------------------------------

// Tenta logar com cada credencial em ordem. Retorna no primeiro 200.
// Se todas falham, lança erro consolidado com detalhes pra facilitar debug.
async function loginWithFallback(): Promise<{ token: string; usedLabel: string; usedEmail: string }> {
  const attempts: Array<{ label: string; email: string; status: number; bodyMsg?: string }> = [];

  for (const cred of CREDENTIALS_TRY_ORDER) {
    const res = await request('POST', `${API_URL}/auth/login`, {
      email: cred.email,
      password: cred.password,
    });

    if (res.status === 200) {
      const token = res.body?.accessToken ?? res.body?.token ?? res.body?.access_token;
      if (token) {
        return { token, usedLabel: cred.label, usedEmail: cred.email };
      }
      attempts.push({ label: cred.label, email: cred.email, status: 200, bodyMsg: 'sem accessToken na resposta' });
      continue;
    }

    const msg =
      typeof res.body === 'object' && res.body
        ? res.body.message ?? JSON.stringify(res.body)
        : String(res.body);
    attempts.push({ label: cred.label, email: cred.email, status: res.status, bodyMsg: msg });
  }

  const summary = attempts
    .map((a) => `  - [${a.label}] ${a.email}: ${a.status}${a.bodyMsg ? ` (${a.bodyMsg})` : ''}`)
    .join('\n');

  throw new Error(
    `nenhuma credencial funcionou. Tentativas:\n${summary}\n\n` +
      `Solucao:\n` +
      `  1. Rode 'npm run db:seed' em apps/api (cria admin@loja.com/senha123)\n` +
      `  2. Ou crie uma conta via POST /auth/register e exporte as creds:\n` +
      `       set EVAL_EMAIL=seu@email.com && set EVAL_PASSWORD=suasenha\n` +
      `       npm run eval`,
  );
}

async function resetConversation(token: string) {
  await request('DELETE', `${API_URL}/debug/reset`, undefined, token);
}

async function runSeed(token: string) {
  await request('POST', `${API_URL}/dev/seed`, undefined, token);
}

async function sendAndWaitReply(token: string, text: string) {
  const replyPromise = consumeOneReply(token);
  await new Promise((r) => setTimeout(r, 100));
  const res = await request(
    'POST',
    `${API_URL}/debug/simulate-inbound`,
    { text, contactName: 'eval-bot' },
    token,
  );
  if (res.status !== 202 && res.status !== 200) {
    throw new Error(`simulate-inbound falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return replyPromise;
}

async function runCase(token: string, c: EvalCase): Promise<CaseResult> {
  const start = Date.now();
  const result: CaseResult = {
    name: c.name,
    passed: true,
    failures: [],
    durationMs: 0,
    steps: [],
  };

  try {
    await resetConversation(token);
    if (c.seed) await runSeed(token);

    for (let i = 0; i < c.messages.length; i++) {
      const step = c.messages[i];
      const reply = await sendAndWaitReply(token, step.send);

      let received = '';
      let wasHandoff = false;

      if (reply.type === 'timeout') {
        result.passed = false;
        const failure = `step ${i + 1}: TIMEOUT esperando resposta para "${step.send}"`;
        result.failures.push(failure);
        result.steps.push({ sent: step.send, received: '(timeout)', failures: [failure] });
        break;
      }
      if (reply.type === 'handoff') {
        wasHandoff = true;
        received = `[HANDOFF: ${reply.reason}]`;
      } else {
        received = reply.content;
      }

      const stepFailures = checkExpect(received, step.expect, wasHandoff);
      result.steps.push({ sent: step.send, received, failures: stepFailures });
      if (stepFailures.length > 0) {
        result.passed = false;
        for (const f of stepFailures) {
          result.failures.push(`step ${i + 1}: ${f}`);
        }
      }
    }
  } catch (err) {
    result.passed = false;
    result.failures.push(`erro inesperado: ${(err as Error).message}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

function printResult(r: CaseResult) {
  const icon = r.passed ? '✓' : '✗';
  const color = r.passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${icon} ${r.name}${reset} (${r.durationMs}ms)`);
  for (const step of r.steps) {
    const sentLine = `    → ${step.sent}`;
    const recvLine = `    ← ${step.received.replace(/\n/g, ' ').slice(0, 140)}`;
    console.log(sentLine);
    console.log(recvLine);
    for (const f of step.failures) {
      console.log(`      \x1b[31m✗ ${f}${reset}`);
    }
  }
  if (!r.passed && r.failures.length > 0 && r.steps.length === 0) {
    for (const f of r.failures) console.log(`    \x1b[31m✗ ${f}${reset}`);
  }
}

async function main() {
  console.log(`Eval runner — API: ${API_URL}`);

  const fileContent = fs.readFileSync(CASES_FILE, 'utf8');
  const parsed = JSON.parse(fileContent) as { cases: EvalCase[] };
  let cases = parsed.cases.filter((c) => !c.skip);
  if (FILTER) cases = cases.filter((c) => c.name.includes(FILTER));

  if (cases.length === 0) {
    console.log('Nenhum caso para rodar');
    process.exit(0);
  }
  console.log(`Rodando ${cases.length} caso(s)\n`);

  const auth = await loginWithFallback();
  console.log(`Autenticado como ${auth.usedEmail} (${auth.usedLabel})\n`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    const result = await runCase(auth.token, c);
    results.push(result);
    printResult(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

  console.log('');
  console.log('─'.repeat(60));
  console.log(`Total: ${results.length} | ✓ ${passed} | ✗ ${failed} | ${totalMs}ms`);
  console.log('─'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});