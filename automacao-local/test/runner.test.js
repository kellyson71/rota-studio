import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.js';
import { Runner, isOptOut, phoneKey } from '../src/runner.js';

const job = { id: 'job-1', claim_token: 'lease-1', phone: '5584999991111', body: 'Olá' };
function fixture(t, changes = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'indexa-test-'));
  const journal = new Journal(join(dir, 'db.sqlite'));
  t.after(() => { journal.close(); rmSync(dir, { recursive: true, force: true }); });
  let sends = 0; const results = [];
  const rpc = async (name, args) => { if (name === 'wa_claim') return job; if (name === 'wa_can_send') return true; if (name === 'wa_finish') results.push(args); };
  const whatsapp = { ready: true, resolve: async () => '5584999991111@c.us', send: async () => { sends++; return { id: { _serialized: 'remote-1' } }; }, ...changes };
  return { journal, results, rpc, whatsapp, sends: () => sends, runner: new Runner({ rpc, journal, whatsapp }) };
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
