import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.js';
import { Runner, isOptOut, phoneKey, msgId, splitParts } from '../src/runner.js';

const job = { id: 'job-1', claim_token: 'lease-1', phone: '5584999991111', body: 'Olá' };
function fixture(t, changes = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-test-'));
  const journal = new Journal(join(dir, 'db.sqlite'));
  t.after(() => { journal.close(); rmSync(dir, { recursive: true, force: true }); });
  let sends = 0; const results = [];
  const rpc = async (name, args) => { if (name === 'wa_claim') return job; if (name === 'wa_can_send') return true; if (name === 'wa_finish') results.push(args); };
  const whatsapp = { ready: true, resolve: async () => '5584999991111@c.us', send: async () => { sends++; return { id: { _serialized: 'remote-1' } }; }, ...changes };
  return { journal, results, rpc, whatsapp, sends: () => sends, runner: new Runner({ rpc, journal, whatsapp, pause: async () => {} }) };
}
test('registra confirmação e não repete o mesmo job recebido novamente', async t => {
  const f = fixture(t); await f.runner.tick(); await f.runner.tick();
  assert.equal(f.sends(), 1); assert.equal(f.results[0].p_status, 'sent'); assert.equal(f.results[0].p_remote_id, 'remote-1');
});
test('não envia se o WhatsApp estiver desconectado', async t => {
  const f = fixture(t, { ready: false }); await f.runner.tick(); assert.equal(f.sends(), 0);
});
test('número inexistente falha antes de enviar', async t => {
  const f = fixture(t, { resolve: async () => null }); await f.runner.tick(); assert.equal(f.sends(), 0); assert.equal(f.results[0].p_status, 'failed');
});
test('erro na chamada de envio fica incerto e nunca repete automaticamente', async t => {
  let calls = 0; const f = fixture(t, { send: async () => { calls++; throw Error('Conexão caiu'); } });
  await f.runner.tick(); await f.runner.tick(); assert.equal(calls, 1); assert.equal(f.results[0].p_status, 'uncertain');
});
test('perda da confirmação na nuvem reenvia só o resultado, nunca a mensagem', async t => {
  const f = fixture(t); let finishCalls = 0;
  f.runner.rpc = async (name,args) => { if (name === 'wa_finish' && ++finishCalls === 1) throw Error('offline'); return f.rpc(name,args); };
  await assert.rejects(f.runner.tick(), /offline/); await f.runner.tick(); assert.equal(f.sends(), 1); assert.equal(finishCalls, 2);
});
test('pausa, bloqueio ou resposta imediatamente antes do envio impede a chamada', async t => {
  const f = fixture(t); f.runner.rpc = async (name,args) => name === 'wa_can_send' ? false : f.rpc(name,args);
  await f.runner.tick(); assert.equal(f.sends(), 0);
});
test('respostas recuperadas antes do envio são sincronizadas antes da conferência', async t => {
  const f = fixture(t); const order = [];
  f.whatsapp.beforeSend = async () => f.journal.reply({ p_id: 'reply-1', p_phone: job.phone });
  f.runner.rpc = async (name,args) => { order.push(name); return name === 'wa_can_send' ? false : f.rpc(name,args); };
  await f.runner.tick(); assert.ok(order.indexOf('wa_reply') < order.indexOf('wa_can_send')); assert.equal(f.sends(), 0);
});
test('chamadas concorrentes do timer não executam em paralelo', async t => {
  const f = fixture(t); await Promise.all([f.runner.tick(), f.runner.tick(), f.runner.tick()]); assert.equal(f.sends(), 1);
});
test('reinício transforma chamada interrompida em resultado incerto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-restart-')); const file = join(dir, 'db.sqlite');
  let j = new Journal(file); j.begin(job); j.close(); j = new Journal(file);
  assert.equal(j.pending()[0].status, 'uncertain'); assert.equal(j.begin(job), false); j.close(); rmSync(dir, { recursive: true });
});
test('recusa explícita e equivalência do nono dígito', () => {
  assert.ok(isOptOut('Não tenho interesse.')); assert.ok(isOptOut('PARAR')); assert.equal(isOptOut('Quero saber o preço'), false);
  assert.equal(phoneKey('5584999991111'), '558499991111'); assert.equal(phoneKey('558432111234'), '558432111234');
});

test('identificador do WhatsApp Web atual ($1) confirma o envio e resposta sem id não trava a fila', async t => {
  const f = fixture(t, { send: async () => ({ id: { fromMe: true, remote: '1@lid', id: 'ABC', $1: 'true_1@lid_ABC' } }) });
  await f.runner.tick(); assert.equal(f.results[0].p_status, 'sent'); assert.equal(f.results[0].p_remote_id, 'true_1@lid_ABC');
  assert.equal(msgId({ _serialized: 'x' }), 'x'); assert.equal(msgId({ fromMe: false, remote: '2@lid', id: 'Z' }), 'false_2@lid_Z'); assert.equal(msgId(undefined), null);
  f.journal.reply({ p_phone: '5584999991111', p_body: 'sem id' }); assert.equal(f.journal.replies().length, 0);
});
test('linha antiga sem identificador é descartada ao abrir o diário', () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-null-')); const file = join(dir, 'db.sqlite');
  let j = new Journal(file); j.db.prepare('INSERT INTO replies(id,payload) VALUES(NULL,?)').run('{}'); assert.equal(j.replies().length, 1); j.close();
  j = new Journal(file); assert.equal(j.replies().length, 0); j.close(); rmSync(dir, { recursive: true });
});

const duo = 'Oi, tudo bem? Sou o Kellyson.\n\nComo vocês confirmam as consultas?';
test('parágrafos viram mensagens separadas, na ordem, com pausa entre elas', async t => {
  const sentTexts = []; let pauses = 0;
  const f = fixture(t, { send: async (_a, text) => { sentTexts.push(text); return { id: { $1: 'id-' + sentTexts.length } }; } });
  f.runner.pause = async () => { pauses++; };
  f.runner.rpc = async (name, args) => name === 'wa_claim' ? { ...job, body: duo } : f.rpc(name, args);
  await f.runner.tick();
  assert.deepEqual(sentTexts, ['Oi, tudo bem? Sou o Kellyson.', 'Como vocês confirmam as consultas?']); assert.equal(pauses, 1);
  assert.equal(f.results[0].p_status, 'sent'); assert.equal(f.results[0].p_remote_id, 'id-1');
});
test('se a 2ª parte falha, fica incerto e a 1ª nunca é reenviada', async t => {
  let calls = 0; const f = fixture(t, { send: async () => { if (++calls === 2) throw new Error('caiu'); return { id: { $1: 'id-1' } }; } });
  f.runner.rpc = async (name, args) => name === 'wa_claim' ? { ...job, body: duo } : f.rpc(name, args);
  await f.runner.tick(); await f.runner.tick();
  assert.equal(calls, 2); assert.equal(f.results[0].p_status, 'uncertain'); assert.match(f.results[0].p_error, /parte 2 de 2/);
});
test('splitParts: sem parágrafo = 1 mensagem; limite de 3', () => {
  assert.deepEqual(splitParts('uma linha\ncontinua aqui'), ['uma linha\ncontinua aqui']);
  assert.equal(splitParts('a\n\nb\n\nc\n\nd\n\ne').length, 3); assert.equal(splitParts('a\n\nb\n\nc\n\nd')[2], 'c\n\nd');
  assert.deepEqual(splitParts('  a \n \n\n  b  '), ['a', 'b']);
});

test('retorno do envio sem id: confirma pela conversa e não duplica a mensagem', async t => {
  let sends = 0; const f = fixture(t, { send: async () => { sends++; return {}; }, confirm: async (_a, text) => `conferido-${text.length}` });
  await f.runner.tick(); await f.runner.tick();
  assert.equal(sends, 1); assert.equal(f.results[0].p_status, 'sent'); assert.match(f.results[0].p_remote_id, /^conferido-/);
});
test('sem id e sem como conferir, fica incerto (nunca falha silenciosamente)', async t => {
  const f = fixture(t, { send: async () => ({}), confirm: async () => null }); await f.runner.tick();
  assert.equal(f.results[0].p_status, 'uncertain');
});
