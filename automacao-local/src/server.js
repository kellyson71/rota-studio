import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import wwebjs from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { Journal } from './journal.js';
import { Runner, isOptOut, phoneKey } from './runner.js';
import { AgentWorker } from './agent/worker.js';
import { execFile } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.INDEXA_DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.chmodSync(dataDir, 0o700);
const configPath = path.join(dataDir, 'connection.json');
const localSecretPath = path.join(dataDir, 'local-key');
if (!fs.existsSync(localSecretPath)) fs.writeFileSync(localSecretPath, randomBytes(24).toString('hex'), { mode: 0o600 });
const localSecret = fs.readFileSync(localSecretPath, 'utf8').trim();
let journal;
let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
let cloud, runner, client, starting = false, stopping = false, qr = null, status = 'offline', lastError = null, cloudError = null;
let watched = new Set(), worker;
const kb = JSON.parse(fs.readFileSync(new URL('./agent/kb.json', import.meta.url), 'utf8'));
const adapter = {
  get ready() { return status === 'ready'; },
  resolve: async phone => {
    watched.add(phoneKey(phone));
    try { return (await client.getNumberId(phone))?._serialized; }
    catch (error) { throw new Error(`Falha ao localizar o número (${error.message})`); }
  },
  beforeSend: async (address, job) => {
    // Recupera respostas recebidas enquanto o PC estava desligado. Lê o modelo da conversa direto:
    // WWebJS.getChat quebra ao serializar conversas com identificador @lid.
    let recent;
    try {
      recent = await client.pupPage.evaluate((id, since) => {
        const chat = window.require('WAWebCollections').Chat.get(id);
        if (!chat) return [];
        const ignore = ['call_log', 'e2e_notification', 'gp2', 'notification', 'notification_template', 'protocol'];
        return chat.msgs.getModelsArray()
          .filter(m => !m.id.fromMe && m.id._serialized && m.t >= since && !ignore.includes(m.type))
          .slice(-50).map(m => ({ id: m.id._serialized, body: m.body || '', type: m.type, t: m.t }));
      }, address, new Date(job.created_at).getTime() / 1000);
    } catch (error) { throw new Error(`Falha ao conferir respostas (${error.message})`); }
    for (const message of recent) {
      journal.reply({ p_id: message.id, p_phone: job.phone, p_body: message.body || `[${message.type}]`, p_received_at: new Date(message.t * 1000).toISOString(), p_optout: isOptOut(message.body || '') });
    }
  },
  send: async (address, body) => {
    let timer;
    try {
      return await Promise.race([client.sendMessage(address, body, { sendSeen: false }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo de confirmação esgotado; confira o WhatsApp')), 90000); })]);
    } finally { clearTimeout(timer); }
  }
};
async function rpc(name, args = {}) {
  const { data, error } = await cloud.rpc(name, { p_token: config.token, ...args });
  if (error) throw new Error(error.message);
  return data;
}
function setupCloud() {
  if (journal) journal.close();
  // Um vínculo novo não pode herdar resultados pendentes do dispositivo antigo.
  const journalId = createHash('sha256').update(config.token).digest('hex').slice(0, 16);
  journal = new Journal(path.join(dataDir, `journal-${journalId}.sqlite`));
  cloud = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) }) }
  });
  runner = new Runner({ rpc, journal, whatsapp: adapter });
  worker = new AgentWorker({ rpc, journal, kb, notify: ({ name, body, decision }) => execFile('notify-send', ['-a', 'Indexa', `Rascunho do agente: ${name || 'contato'}`, `${body.slice(0, 120)}\n→ ${decision.why}`], () => {}) });
}
async function heartbeat() {
  if (!cloud) return;
  try { const result = await rpc('wa_heartbeat', { p_status: status, p_qr: qr, p_error: lastError }); watched = new Set((result.watched || []).map(phoneKey)); cloudError = null; }
  catch (error) { cloudError = error.message; }
}
async function connect() {
  if (!config || starting || stopping || ['ready','qr','authenticated'].includes(status)) return;
  starting = true;
  status = 'starting'; lastError = null; qr = null;
  try {
    // Valida o vínculo antes de abrir o navegador.
    await rpc('wa_heartbeat', { p_status: status });
    if (client) await client.destroy().catch(() => {});
    client = new wwebjs.Client({
      authStrategy: new wwebjs.LocalAuth({ dataPath: path.join(dataDir, 'whatsapp') }),
      puppeteer: { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--disable-dev-shm-usage'] }
    });
    client.on('qr', async value => {
      try { qr = await QRCode.toDataURL(value, { width: 300, margin: 2 }); status = 'qr'; await heartbeat(); }
      catch (error) { lastError = error.message; }
    });
    client.on('authenticated', () => { status = 'authenticated'; qr = null; void heartbeat(); });
    client.on('ready', () => { status = 'ready'; qr = null; lastError = null; void heartbeat(); });
    client.on('auth_failure', message => { status = 'error'; qr = null; lastError = String(message); void heartbeat(); });
    client.on('disconnected', reason => { status = 'offline'; qr = null; lastError = String(reason); void heartbeat(); });
    client.on('message', async message => {
      if (message.fromMe || message.from.endsWith('@g.us') || message.from.endsWith('@broadcast') || message.from.endsWith('@newsletter')) return;
      try {
        let phone = message.from.split('@')[0];
        if (message.from.endsWith('@lid')) {
          const pairs = await client.getContactLidAndPhone([message.from]);
          phone = pairs?.[0]?.pn?.split('@')[0] || '';
        }
        if (!/^[1-9]\d{9,14}$/.test(phone) || !watched.has(phoneKey(phone))) return;
        const body = message.body || `[${message.type}]`;
        journal.reply({ p_id: message.id._serialized, p_phone: phone, p_body: body, p_received_at: new Date(message.timestamp * 1000).toISOString(), p_optout: isOptOut(message.body || '') });
        journal.agentEnqueue({ id: message.id._serialized, phone, body });
      } catch (error) { lastError = `Falha ao registrar resposta: ${error.message}`; }
    });
    await client.initialize();
  } catch (error) { status = 'error'; lastError = error.message; await heartbeat(); }
  finally { starting = false; }
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'" });
  const host = req.hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return res.sendStatus(403);
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req, res, next) => {
  const given = Buffer.from(req.get('X-Indexa-Key') || '');
  const expected = Buffer.from(localSecret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).json({ error: 'Abra o endereço com a chave local, conforme o arquivo de acesso.' });
  next();
});
app.get('/api/status', (_req, res) => res.json({ configured: Boolean(config), status, qr, error: lastError, cloudError }));
app.post('/api/config', async (req, res) => {
  if (config) return res.status(409).json({ error: 'Este executor já está vinculado. Para trocar, pare o serviço e remova data/connection.json.' });
  const { supabaseUrl, supabaseKey, token } = req.body;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl || '') || !/^[a-f0-9]{64}$/.test(token || '') || typeof supabaseKey !== 'string' || supabaseKey.length < 20 || supabaseKey.length > 1000) return res.status(400).json({ error: 'Cole o arquivo de conexão gerado no painel Indexa.' });
  config = { supabaseUrl, supabaseKey, token };
  setupCloud();
  try {
    await rpc('wa_heartbeat', { p_status: 'offline' });
    fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    res.json({ ok: true });
    void connect();
  } catch (error) { config = null; cloud = null; runner = null; res.status(400).json({ error: error.message }); }
});
app.post('/api/connect', (_req, res) => { if (!config) return res.status(400).json({ error: 'Vincule o computador primeiro' }); void connect(); res.json({ ok: true }); });
app.use(express.static(path.join(root, 'public')));
app.use((error, _req, res, _next) => res.status(400).json({ error: 'Solicitação inválida' }));

const port = Number(process.env.PORT || 4318);
const server = app.listen(port, '127.0.0.1', () => {
  const boundPort = server.address().port;
  // A chave fica no fragmento; não é enviada em URLs nem em logs HTTP.
  fs.writeFileSync(path.join(dataDir, 'acesso-local.txt'), `http://127.0.0.1:${boundPort}/#${localSecret}\n`, { mode: 0o600 });
  console.log(`Indexa local em http://127.0.0.1:${boundPort}. Acesso: ${path.join(dataDir, 'acesso-local.txt')}`);
  if (config) { setupCloud(); void connect(); }
});
const heartbeatTimer = setInterval(() => void heartbeat(), 10000);
const workTimer = setInterval(async () => {
  if (!runner || stopping) return;
  try { await runner.tick(); cloudError = null; } catch (error) { cloudError = error.message; }
}, 5000);
const agentTimer = setInterval(async () => {
  if (!worker || stopping) return;
  try { await worker.tick(); } catch (error) { cloudError = `Agente: ${error.message}`.slice(0, 300); }
}, 5000);
const reconnectTimer = setInterval(() => { if (config && ['offline','error'].includes(status) && !stopping) void connect(); }, 60000);
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeatTimer); clearInterval(workTimer); clearInterval(agentTimer); clearInterval(reconnectTimer);
  server.close();
  const kill = setTimeout(() => process.exit(0), 12000);
  status = 'offline'; qr = null;
  await heartbeat();
  if (client) await client.destroy().catch(() => {});
  clearTimeout(kill);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
