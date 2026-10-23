import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MODELS = ['opencode/big-pickle', 'opencode/mimo-v2.6-flash-free'];

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

function run(model, prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', ['run', '--pure', '-m', model, prompt], { cwd: sandboxDir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${model}: tempo esgotado`)); }, timeoutMs);
    child.stdout.on('data', d => { out += d; if (out.length > 50000) child.kill('SIGKILL'); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`${model}: saída ${code}`)); });
  });
}

// Principal e reserva em sequência; nunca em paralelo (o OpenCode trava com várias execuções).
export async function askModel(prompt, { models = MODELS, timeoutMs = 60000 } = {}) {
  const errors = [];
  for (const model of models) {
    try { return { model, json: extractJson(await run(model, prompt, timeoutMs)) }; }
    catch (error) { errors.push(error.message); }
  }
  throw new Error(errors.join(' | '));
}
