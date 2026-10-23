import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.js';
import { AgentWorker } from '../src/agent/worker.js';

function fixture(t, handle, rpcOverride, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-worker-'));
  const journal = new Journal(join(dir, 'db.sqlite'));
  t.after(() => { journal.close(); rmSync(dir, { recursive: true, force: true }); });
  const calls = [], notices = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (rpcOverride) return rpcOverride(name, args);
    if (name === 'wa_agent_context') return { contact: { id: 'c1', name: 'Clínica X', price: 'R$ 1.500 + R$ 150/mês' }, blocked: false, history: [{ de: 'eu', texto: 'Abertura' }, { de: 'cliente', texto: 'Quanto custa?' }] };
    if (name === 'wa_draft_create') return 'draft-1';
  };
  const autos = [];
  const worker = new AgentWorker({ rpc, journal, kb: {}, handle, notify: n => notices.push(n), onAuto: d => autos.push(d), ...opts });
  return { journal, worker, calls, notices, autos };
}
const task = { id: 'in-1', phone: '5584999991111', body: 'Quanto custa?' };

test('resposta vira rascunho em modo sombra, com contexto, e notifica uma vez', async t => {
  let seen; const f = fixture(t, async args => { seen = args; return { final: 'draft', text: 'Depende do escopo.', why: 'preço exige aprovação', intencao: 'preco', model: 'm' }; });
  f.journal.agentEnqueue(task); f.journal.agentEnqueue(task);
  assert.equal(await f.worker.tick(), true); assert.equal(await f.worker.tick(), false);
  assert.equal(seen.mode, 'shadow'); assert.equal(seen.lastSent, 'Abertura'); assert.equal(seen.history.length, 1, 'a mensagem atual não repete no histórico');
  const draft = f.calls.find(c => c.name === 'wa_draft_create').args;
  assert.equal(draft.p_suggestion, 'Depende do escopo.'); assert.equal(draft.p_decision.final, 'draft');
  assert.equal(f.notices.length, 1);
});
test('falha do agente ou da nuvem mantém a tarefa para nova tentativa, sem perder a resposta', async t => {
  let fail = true; const f = fixture(t, async () => ({ final: 'draft', text: 'ok', why: 'x' }), (name) => { if (name === 'wa_draft_create') { if (fail) throw new Error('offline'); return 'd'; } return { contact: null, blocked: false, history: [] }; });
  f.journal.agentEnqueue(task);
  await assert.rejects(f.worker.tick(), /offline/);
  fail = false; assert.equal(await f.worker.tick(), true); assert.equal(f.journal.agentNext(), undefined);
});
test('bloqueado ou ignorado não cria rascunho; após 5 falhas a tarefa é abandonada', async t => {
  const f = fixture(t, async () => ({ final: 'ignore', why: 'contato bloqueado' }));
  f.journal.agentEnqueue(task); await f.worker.tick();
  assert.equal(f.calls.filter(c => c.name === 'wa_draft_create').length, 0); assert.equal(f.journal.agentNext(), undefined);
  const g = fixture(t, async () => { throw new Error('quebrou'); });
  g.journal.agentEnqueue(task);
  for (let i = 0; i < 5; i++) await assert.rejects(g.worker.tick(), /quebrou/);
  assert.equal(g.journal.agentNext(), undefined);
});
test('tarefas sobrevivem a um reinício do executor', t => {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-worker-')); const file = join(dir, 'db.sqlite');
  let j = new Journal(file); j.agentEnqueue(task); j.close(); j = new Journal(file);
  assert.equal(JSON.parse(j.agentNext().payload).id, 'in-1'); j.close(); rmSync(dir, { recursive: true });
});

test('modelo inacessível: espera crescente e, no fim, rascunho vazio para resposta manual', async t => {
  const f = fixture(t, async () => ({ final: 'draft', unavailable: true, text: '', why: 'agente indisponível: sem rede' }));
  f.journal.agentEnqueue(task);
  for (let i = 0; i < 4; i++) {
    await f.worker.tick();
    assert.equal(f.calls.filter(c => c.name === 'wa_draft_create').length, 0, 'ainda tentando');
    assert.equal(f.journal.agentNext(), undefined, 'aguardando a espera terminar');
    f.journal.db.prepare('UPDATE agent_tasks SET next_at=0').run();
  }
  await f.worker.tick();
  const draft = f.calls.find(c => c.name === 'wa_draft_create').args;
  assert.equal(draft.p_suggestion, ''); assert.match(draft.p_decision.why, /indisponível/);
});

test('tarefa sem identificador não é enfileirada e a linha antiga é descartada ao abrir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-poison-')); const file = join(dir, 'db.sqlite');
  let j = new Journal(file); j.agentEnqueue({ phone: '5584999991111', body: 'sem id' }); assert.equal(j.agentNext(), undefined);
  j.db.prepare('INSERT INTO agent_tasks(id,payload) VALUES(NULL,?)').run('{}'); assert.ok(j.agentNext()); j.close();
  j = new Journal(file); assert.equal(j.agentNext(), undefined); j.close(); rmSync(dir, { recursive: true });
});

test('mensagens seguidas do mesmo contato geram um único rascunho, sobre a última', async t => {
  const seen = []; const f = fixture(t, async args => { seen.push(args.message); return { final: 'draft', text: 'resposta única', why: 'x' }; });
  f.journal.agentEnqueue({ ...task, id: 'm1', body: 'oi' }); f.journal.agentEnqueue({ ...task, id: 'm2', body: 'ola?' }); f.journal.agentEnqueue({ ...task, id: 'm3', body: 'olaa?' });
  f.journal.agentEnqueue({ id: 'o1', phone: '5584888882222', body: 'outro contato' });
  while (await f.worker.tick()) { /* processa tudo */ }
  assert.deepEqual(seen, ['olaa?', 'outro contato']);
  assert.equal(f.calls.filter(c => c.name === 'wa_draft_create').length, 2);
  assert.equal(f.calls.find(c => c.name === 'wa_draft_create').args.p_inbound_id, 'm3');
});

test('agentSeen reconhece mensagens já enfileiradas, mesmo depois de processadas', t => {
  const f = fixture(t, async () => ({ final: 'draft', text: 'x', why: 'x' }));
  assert.equal(f.journal.agentSeen('in-1'), false); f.journal.agentEnqueue(task); f.journal.agentDone('in-1');
  assert.equal(f.journal.agentSeen('in-1'), true);
});

test('reagenda para quando o disjuntor libera o primeiro provedor', async t => {
  const f = fixture(t, async () => ({ final: 'draft', unavailable: true, retryInMs: 42000, text: '', why: 'agente indisponível: todos em espera' }));
  f.journal.agentEnqueue(task); const before = Math.floor(Date.now() / 1000);
  await f.worker.tick();
  const row = f.journal.db.prepare('SELECT next_at FROM agent_tasks WHERE id=?').get('in-1');
  assert.ok(row.next_at - before >= 41 && row.next_at - before <= 43, `next_at em ~42s (foi ${row.next_at - before}s)`);
});

test('diário: comando é tratado uma vez só, aviso sai uma vez e lembrete guarda o horário', t => {
  const f = fixture(t, async () => ({ final: 'draft', text: 'x', why: 'x' }));
  assert.equal(f.journal.commandFirst('cmd-1'), true); assert.equal(f.journal.commandFirst('cmd-1'), false, 'tempo real + varredura não decidem duas vezes');
  f.journal.noticeEnqueue('draft:1', 'aviso'); f.journal.noticeEnqueue('draft:1', 'aviso repetido');
  assert.equal(f.journal.noticesPending().length, 1); f.journal.noticeSent('draft:1'); assert.equal(f.journal.noticesPending().length, 0);
  assert.equal(f.journal.reminderLast('d1'), null); f.journal.reminderSet('d1', 1000); f.journal.reminderSet('d1', 2000); assert.equal(f.journal.reminderLast('d1'), 2000);
});

const safe = async () => ({ final: 'send', text: 'E ainda acontece de paciente faltar?', why: 'resposta segura', intencao: 'contexto' });
test('modo live: resposta segura sai sozinha, sem incomodar o dono', async t => {
  const f = fixture(t, safe, null, { mode: 'live', inHours: () => true });
  f.journal.agentEnqueue(task); await f.worker.tick();
  assert.ok(f.calls.some(c => c.name === 'wa_draft_autosend' && c.args.p_id === 'draft-1'));
  assert.equal(f.notices.length, 0); assert.equal(f.autos.length, 1);
});
test('modo live: fora do horário, no teto por contato ou com falha no envio, vira aviso ao dono', async t => {
  const fora = fixture(t, safe, null, { mode: 'live', inHours: () => false });
  fora.journal.agentEnqueue(task); await fora.worker.tick();
  assert.ok(!fora.calls.some(c => c.name === 'wa_draft_autosend')); assert.match(fora.notices[0].decision.why, /fora do horário/);
  const ctx = { contact: { name: 'X' }, blocked: false, history: [], autoCount: 10 };
  const teto = fixture(t, safe, n => n === 'wa_agent_context' ? ctx : n === 'wa_draft_create' ? 'd' : undefined, { mode: 'live', inHours: () => true });
  teto.journal.agentEnqueue(task); await teto.worker.tick();
  assert.ok(!teto.calls.some(c => c.name === 'wa_draft_autosend')); assert.match(teto.notices[0].decision.why, /10 respostas automáticas/);
  const falha = fixture(t, safe, n => { if (n === 'wa_draft_autosend') throw new Error('Contato está na lista de não contatar'); return n === 'wa_draft_create' ? 'd' : { contact: null, blocked: false, history: [] }; }, { mode: 'live', inHours: () => true });
  falha.journal.agentEnqueue(task); await falha.worker.tick();
  assert.match(falha.notices[0].decision.why, /não foi possível: Contato está na lista/); assert.equal(falha.autos.length, 0);
});
test('rascunho que precisa de decisão segue para o dono também no modo live', async t => {
  const f = fixture(t, async () => ({ final: 'draft', text: 'Começa em R$ 1.500.', why: 'intenção preco exige aprovação', intencao: 'preco' }), null, { mode: 'live', inHours: () => true });
  f.journal.agentEnqueue(task); await f.worker.tick();
  assert.ok(!f.calls.some(c => c.name === 'wa_draft_autosend')); assert.equal(f.notices.length, 1);
});
test('descadastro e encerramento não criam rascunho nem aviso', async t => {
  for (const handle of [async () => ({ final: 'send', rule: 'optout', text: 'Sem problema', why: 'regra optout' }), async () => ({ final: 'close', text: '', why: 'cliente recusou' })]) {
    const f = fixture(t, handle, null, { mode: 'live', inHours: () => true });
    f.journal.agentEnqueue(task); await f.worker.tick();
    assert.ok(!f.calls.some(c => c.name === 'wa_draft_create')); assert.equal(f.notices.length, 0); assert.equal(f.journal.agentNext(), undefined);
  }
});
