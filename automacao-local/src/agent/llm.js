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
  if (start < 0) throw new Error('modelo não devolveu JSON');
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('JSON incompleto na saída do modelo');
}

const MIN = 60000;
// Falha com tempo de espera próprio: login ausente dura mais que um timeout.
class ProviderError extends Error { constructor(message, cooldown = 3 * MIN) { super(message); this.cooldown = cooldown; } }

function spawnCli(label, cmd, args, { timeoutMs, authPattern, quotaPattern }) {
  return new Promise((resolve, reject) => {
    // stdin fechado: nenhum CLI pode ficar esperando um código de login digitado.
    const child = spawn(cmd, args, { cwd: sandboxDir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); child.kill('SIGKILL'); fn(value); };
    const timer = setTimeout(() => finish(reject, new ProviderError(`${label}: tempo esgotado`, 5 * MIN)), timeoutMs);
    const inspect = () => {
      const all = `${out}\n${err}`.replace(/\x1b\[[0-9;]*m/g, '');
      if (authPattern?.test(all)) finish(reject, new ProviderError(`${label}: não autenticado (abra "${cmd}" no terminal e entre)`, 30 * MIN));
      else if (quotaPattern?.test(all)) finish(reject, new ProviderError(`${label}: limite ou bloqueio do serviço gratuito`, 10 * MIN));
    };
    child.stdout.on('data', d => { out += d; if (out.length > 50000) finish(reject, new ProviderError(`${label}: saída grande demais`)); else inspect(); });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); inspect(); });
    child.on('error', error => finish(reject, new ProviderError(`${label}: ${error.message}`, 30 * MIN)));
    child.on('close', code => {
      if (done) return;
      const tail = err.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-2).join(' | ').slice(0, 250);
      code === 0 ? finish(resolve, out) : finish(reject, new ProviderError(`${label}: saída ${code}${tail ? ' — ' + tail : ''}`));
    });
  });
}

const runAgy = (prompt, timeoutMs) => spawnCli('agy', 'agy', ['-p', prompt, '--mode', 'plan', '--effort', 'low', '--output-format', 'text'], { timeoutMs, authPattern: /Authentication required|Please sign in|Please visit the URL to log in/i });
const runOpencode = model => (prompt, timeoutMs) => spawnCli(model, 'opencode', ['run', '--pure', '-m', model, prompt], { timeoutMs, quotaPattern: /free tier can only be used|rate-limited|rate limit|quota/i });

const DATA_DIR = process.env.INDEXA_DATA_DIR || fileURLToPath(new URL('../../data', import.meta.url));
const readKey = () => { try { return fs.readFileSync(path.join(DATA_DIR, 'deepseek.key'), 'utf8').trim(); } catch { return process.env.DEEPSEEK_API_KEY || ''; } };

// API direta do DeepSeek (compatível com OpenAI). A chave fica em data/deepseek.key, fora do Git.
export const makeDeepseek = ({ fetchImpl = fetch, getKey = readKey, model = 'deepseek-flash' } = {}) => async (prompt, timeoutMs) => {
  const key = getKey();
  if (!key) throw new ProviderError('deepseek: sem chave (data/deepseek.key)', 30 * MIN);
  let res;
  try {
    res = await fetchImpl('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 700 }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) { throw new ProviderError(`deepseek: ${error.name === 'TimeoutError' ? 'tempo esgotado' : error.message}`, 2 * MIN); }
  if (res.status === 401) throw new ProviderError('deepseek: chave recusada', 30 * MIN);
  if (res.status === 402) throw new ProviderError('deepseek: saldo insuficiente', 30 * MIN);
  if (res.status === 429) throw new ProviderError('deepseek: limite de requisições', 2 * MIN);
  if (!res.ok) throw new ProviderError(`deepseek: HTTP ${res.status}`, 3 * MIN);
  const text = (await res.json())?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError('deepseek: resposta vazia');
  return text;
};

// Ordem de preferência. O agy fica à frente quando está logado; sem login (ou fora do ar, como no wifi
// institucional) o disjuntor o pula e o opencode assume, sem a espera de um timeout a cada mensagem.
export const PROVIDERS = [
  { id: 'agy', run: runAgy, timeoutMs: 45000 },
  { id: 'opencode/big-pickle', run: runOpencode('opencode/big-pickle'), timeoutMs: 40000 },
  { id: 'deepseek/deepseek-flash', run: makeDeepseek(), timeoutMs: 40000 },
  { id: 'opencode/mimo-v2.6-flash-free', run: runOpencode('opencode/mimo-v2.6-flash-free'), timeoutMs: 40000 },
  { id: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', run: runOpencode('openrouter/nvidia/nemotron-3-super-120b-a12b:free'), timeoutMs: 40000 }
];

const coolingUntil = new Map();
export const resetBreaker = () => coolingUntil.clear();
export const breakerState = (now = Date.now()) => Object.fromEntries([...coolingUntil].filter(([, t]) => t > now).map(([id, t]) => [id, Math.ceil((t - now) / 1000) + 's']));

// Um provedor por vez (o opencode trava com execuções simultâneas); falha põe o provedor em espera.
export async function askModel(prompt, { providers = PROVIDERS, timeoutMs = 60000, now = Date.now } = {}) {
  const errors = [];
  for (const provider of providers) {
    if ((coolingUntil.get(provider.id) || 0) > now()) { errors.push(`${provider.id}: em espera`); continue; }
    try {
      const json = extractJson(await provider.run(prompt, provider.timeoutMs ?? timeoutMs));
      coolingUntil.delete(provider.id);
      return { model: provider.id, json };
    } catch (error) {
      coolingUntil.set(provider.id, now() + (error.cooldown ?? 3 * MIN));
      errors.push(error.message);
    }
  }
  throw new Error(errors.join(' | '));
}
