import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Diretório vazio e sem permissões: o modelo só pode devolver texto.
function sandboxDir() {
  const dir = path.join(os.tmpdir(), 'indexa-agent-sandbox');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json', permission: { bash: 'deny', edit: 'deny', webfetch: 'deny', read: 'deny', external_directory: 'deny' } }));
  return dir;
}

export function extractJson(output) {
  const text = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  const start = text.indexOf('{');
  if (start < 0) throw new ProviderError('modelo não devolveu JSON', 'formato');
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { throw new ProviderError('JSON inválido na saída do modelo', 'formato'); }
    }
  }
  throw new ProviderError('JSON incompleto na saída do modelo', 'formato');
}

const SEC = 1000, MIN = 60 * SEC;

// Cada tipo de falha tem uma espera base; falhas seguidas dobram a espera (até 30 min), com variação
// aleatória para não voltar todo mundo ao mesmo tempo. Login e saldo não melhoram sozinhos: espera longa e fixa.
export const BASE_COOLDOWN = { auth: 30 * MIN, saldo: 60 * MIN, bloqueado: 10 * MIN, limite: 1 * MIN, tempo: 2 * MIN, lento: 10 * MIN, rede: 30 * SEC, formato: 30 * SEC, erro: 1 * MIN };
const FIXED = new Set(['auth', 'saldo']);
const MAX_COOLDOWN = 30 * MIN;

export class ProviderError extends Error {
  constructor(message, kind = 'erro', retryAfterMs = null) { super(message); this.kind = kind; this.retryAfterMs = retryAfterMs; }
}

// Lê o texto de erro de CLIs e APIs e decide o tipo de falha.
export function classify(text) {
  const t = String(text);
  if (/Authentication required|Please sign in|Please visit the URL to log in|\b401\b|unauthori[sz]ed|invalid api key|chave recusada/i.test(t)) return 'auth';
  if (/\b402\b|insufficient (balance|funds)|saldo insuficiente|payment required/i.test(t)) return 'saldo';
  if (/free tier can only be used/i.test(t)) return 'bloqueado';
  if (/\b429\b|rate.?limit|too many requests|quota|temporarily rate-limited|overloaded|\b503\b/i.test(t)) return 'limite';
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|fetch failed|network|socket hang up/i.test(t)) return 'rede';
  return 'erro';
}

export function cooldownFor(kind, fails, retryAfterMs, random = Math.random) {
  if (retryAfterMs > 0) return Math.min(retryAfterMs, MAX_COOLDOWN);
  const base = BASE_COOLDOWN[kind] ?? BASE_COOLDOWN.erro;
  if (FIXED.has(kind)) return base;
  return Math.round(Math.min(MAX_COOLDOWN, base * 2 ** Math.max(0, fails - 1)) * (0.8 + 0.4 * random()));
}

function spawnCli(label, cmd, args, { timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    // stdin fechado: nenhum CLI pode ficar esperando um código de login digitado.
    const child = spawn(cmd, args, { cwd: sandboxDir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); child.kill('SIGKILL'); fn(value); };
    const onAbort = () => finish(reject, new ProviderError(`${label}: cancelado`, 'cancelado'));
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => finish(reject, new ProviderError(`${label}: tempo esgotado (${Math.round(timeoutMs / 1000)}s)`, 'tempo')), timeoutMs);
    const inspect = () => {
      const all = `${out}\n${err}`.replace(/\x1b\[[0-9;]*m/g, '');
      const kind = classify(all);
      // Falhas que o CLI anuncia na tela sem encerrar (login, limite): corta na hora em vez de esperar o timeout.
      if (['auth', 'saldo', 'bloqueado', 'limite'].includes(kind)) finish(reject, new ProviderError(`${label}: ${all.trim().split('\n').filter(Boolean).pop()?.slice(0, 160) || kind}`, kind));
    };
    child.stdout.on('data', d => { out += d; if (out.length > 50000) finish(reject, new ProviderError(`${label}: saída grande demais`)); else inspect(); });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); inspect(); });
    child.on('error', error => finish(reject, new ProviderError(`${label}: ${error.message}`, error.code === 'ENOENT' ? 'auth' : 'erro')));
    child.on('close', code => {
      if (done) return;
      const tail = err.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-2).join(' | ').slice(0, 250);
      code === 0 ? finish(resolve, out) : finish(reject, new ProviderError(`${label}: saída ${code}${tail ? ' — ' + tail : ''}`, classify(tail)));
    });
  });
}

const runAgy = (prompt, { timeoutMs, signal }) => spawnCli('agy', 'agy', ['-p', prompt, '--mode', 'plan', '--effort', 'low', '--output-format', 'text'], { timeoutMs, signal });
const runOpencode = model => (prompt, { timeoutMs, signal }) => spawnCli(model, 'opencode', ['run', '--pure', '-m', model, prompt], { timeoutMs, signal });

const DATA_DIR = process.env.INDEXA_DATA_DIR || fileURLToPath(new URL('../../data', import.meta.url));
const readKey = () => { try { return fs.readFileSync(path.join(DATA_DIR, 'deepseek.key'), 'utf8').trim(); } catch { return process.env.DEEPSEEK_API_KEY || ''; } };

// API direta do DeepSeek (compatível com OpenAI). A chave fica em data/deepseek.key, fora do Git.
export const makeDeepseek = ({ fetchImpl = fetch, getKey = readKey, model = 'deepseek-flash' } = {}) => async (prompt, { timeoutMs, signal } = {}) => {
  const key = getKey();
  if (!key) throw new ProviderError('deepseek: sem chave (data/deepseek.key)', 'auth');
  let res;
  try {
    res = await fetchImpl('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.4, max_tokens: 700 }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (signal?.aborted) throw new ProviderError('deepseek: cancelado', 'cancelado');
    throw new ProviderError(`deepseek: ${error.name === 'TimeoutError' ? 'tempo esgotado' : error.message}`, error.name === 'TimeoutError' ? 'tempo' : 'rede');
  }
  const retryAfter = Number(res.headers?.get?.('retry-after')) * SEC || null;
  if (res.status === 401) throw new ProviderError('deepseek: chave recusada', 'auth');
  if (res.status === 402) throw new ProviderError('deepseek: saldo insuficiente', 'saldo');
  if (res.status === 429 || res.status === 503) throw new ProviderError(`deepseek: limite de requisições (HTTP ${res.status})`, 'limite', retryAfter);
  if (!res.ok) throw new ProviderError(`deepseek: HTTP ${res.status}`, res.status >= 500 ? 'limite' : 'erro', retryAfter);
  const text = (await res.json())?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError('deepseek: resposta vazia', 'formato');
  return text;
};

// Ordem de preferência. "group": provedores do mesmo grupo nunca rodam juntos (o opencode trava em paralelo).
export const PROVIDERS = [
  { id: 'agy', group: 'agy', run: runAgy, timeoutMs: 45 * SEC },
  { id: 'opencode/big-pickle', group: 'opencode', run: runOpencode('opencode/big-pickle'), timeoutMs: 40 * SEC },
  { id: 'deepseek/deepseek-flash', group: 'deepseek', run: makeDeepseek(), timeoutMs: 30 * SEC },
  { id: 'opencode/mimo-v2.6-flash-free', group: 'opencode', run: runOpencode('opencode/mimo-v2.6-flash-free'), timeoutMs: 40 * SEC },
  { id: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', group: 'opencode', run: runOpencode('openrouter/nvidia/nemotron-3-super-120b-a12b:free'), timeoutMs: 40 * SEC }
];

// Saúde de cada provedor: espera até quando, falhas seguidas, derrotas por lentidão, último erro e latência.
let health = {}, healthFile = null;
export function configureHealth({ file } = {}) {
  healthFile = file || null;
  try { health = healthFile ? JSON.parse(fs.readFileSync(healthFile, 'utf8')) : {}; } catch { health = {}; }
}
const save = () => { if (healthFile) try { fs.writeFileSync(healthFile, JSON.stringify(health), { mode: 0o600 }); } catch {} };
const rec = id => (health[id] ??= { until: 0, fails: 0, slow: 0, lastError: null, okAt: null, ms: null });
export const resetBreaker = () => { health = {}; save(); };
export function providerHealth(now = Date.now()) {
  return Object.fromEntries(Object.entries(health).map(([id, h]) => [id, { disponivel: h.until <= now, voltaEm: h.until > now ? Math.ceil((h.until - now) / 1000) + 's' : null, falhasSeguidas: h.fails, ultimoErro: h.lastError, latenciaMs: h.ms }]));
}
export const breakerState = (now = Date.now()) => Object.fromEntries(Object.entries(health).filter(([, h]) => h.until > now).map(([id, h]) => [id, Math.ceil((h.until - now) / 1000) + 's']));

function recordFailure(id, error, now, random) {
  const h = rec(id); h.fails++; h.lastError = String(error.message).slice(0, 200);
  // Resposta vazia ou JSON quebrado é problema daquela resposta, não da rota: só pune a partir da 3ª seguida.
  h.until = error.kind === 'formato' && h.fails < 3 ? 0 : now + cooldownFor(error.kind, h.fails, error.retryAfterMs, random);
}
function recordSuccess(id, ms, now) { const h = rec(id); h.fails = 0; h.slow = 0; h.until = 0; h.lastError = null; h.okAt = now; h.ms = h.ms == null ? ms : Math.round(h.ms * 0.7 + ms * 0.3); }

// Corrida com reforço: começa pelo preferido; se ele demora mais que hedgeAfterMs (ou falha), dispara o próximo
// de outro grupo em paralelo. A primeira resposta válida vence e as demais são canceladas.
export function askModel(prompt, { providers = PROVIDERS, hedgeAfterMs = 10 * SEC, deadlineMs = 90 * SEC, now = Date.now, random = Math.random } = {}) {
  const start = now();
  const ready = providers.filter(p => (health[p.id]?.until || 0) <= start);
  if (!ready.length) {
    const next = Math.min(...providers.map(p => health[p.id]?.until || start)) - start;
    const error = new Error(`todos os provedores em espera; o primeiro volta em ${Math.ceil(next / 1000)}s`);
    error.retryInMs = Math.max(next, 5 * SEC);
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const queue = [...ready], running = new Map(), errors = [];
    let settled = false, hedgeTimer = null;
    const deadline = setTimeout(() => finish(null, new Error(`nenhum provedor respondeu em ${Math.round(deadlineMs / 1000)}s: ${errors.join(' | ') || 'sem resposta'}`)), deadlineMs);
    function finish(result, error) {
      if (settled) return;
      settled = true; clearTimeout(deadline); clearTimeout(hedgeTimer);
      for (const [id, { controller, startedAt }] of running) {
        controller.abort();
        // Perdeu a corrida por lentidão três vezes seguidas: fica de fora por um tempo.
        if (result && now() - startedAt >= hedgeAfterMs) { const h = rec(id); if (++h.slow >= 3) { h.until = now() + cooldownFor('lento', 1, null, random); h.lastError = 'lento: perdeu a corrida 3 vezes seguidas'; h.slow = 0; } }
      }
      save();
      if (result) resolve(result);
      else { error.retryInMs = Math.max(5 * SEC, Math.min(...providers.map(p => (health[p.id]?.until || now()) - now()).filter(x => x > 0), 60 * SEC)); reject(error); }
    }
    function launch() {
      if (settled) return;
      const busy = new Set([...running.values()].map(r => r.group));
      const i = queue.findIndex(p => !busy.has(p.group));
      if (i < 0) { if (!running.size) finish(null, new Error(errors.join(' | '))); return; }
      const p = queue.splice(i, 1)[0];
      const controller = new AbortController(), startedAt = now();
      running.set(p.id, { controller, startedAt, group: p.group });
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, hedgeAfterMs);
      Promise.resolve().then(() => p.run(prompt, { timeoutMs: p.timeoutMs ?? 40 * SEC, signal: controller.signal })).then(raw => {
        running.delete(p.id);
        if (settled) return;
        const json = extractJson(raw);
        recordSuccess(p.id, now() - startedAt, now());
        finish({ model: p.id, json, ms: now() - start });
      }).catch(error => {
        running.delete(p.id);
        if (settled || error.kind === 'cancelado') return;
        recordFailure(p.id, error, now(), random);
        errors.push(error.message);
        if (error.kind === 'formato' && !p.retried) queue.unshift({ ...p, retried: true }); // mesma rota, de novo, uma vez
        launch(); // falhou: o próximo entra na hora, sem esperar o reforço
      });
    }
    launch();
  });
}
