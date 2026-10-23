import test from 'node:test';
import assert from 'node:assert/strict';
import { askModel, resetBreaker, breakerState, makeDeepseek } from '../src/agent/llm.js';

const ok = id => ({ id, run: async () => 'ruído {"acao":"responder"} fim' });
const fail = (id, cooldown) => ({ id, run: async () => { const e = new Error(`${id} falhou`); if (cooldown) e.cooldown = cooldown; throw e; } });

test('usa o primeiro provedor que funciona e devolve qual foi', async () => {
  resetBreaker(); const r = await askModel('p', { providers: [ok('a'), ok('b')] });
  assert.equal(r.model, 'a'); assert.deepEqual(r.json, { acao: 'responder' });
});
test('provedor que falha entra em espera: o seguinte assume e o primeiro não é tentado de novo', async () => {
  resetBreaker(); let tentativas = 0; let t = 0;
  const agy = { id: 'agy', run: async () => { tentativas++; const e = new Error('agy: não autenticado'); e.cooldown = 1800000; throw e; } };
  const prov = [agy, ok('opencode')];
  assert.equal((await askModel('p', { providers: prov, now: () => t })).model, 'opencode');
  t += 60000; assert.equal((await askModel('p', { providers: prov, now: () => t })).model, 'opencode');
  assert.equal(tentativas, 1, 'agy não repete enquanto está em espera');
  assert.ok(breakerState(t).agy);
  t += 1800001; await askModel('p', { providers: prov, now: () => t }); assert.equal(tentativas, 2, 'volta a tentar depois da espera');
});
test('todos falhando devolve um erro que lista cada causa', async () => {
  resetBreaker(); await assert.rejects(askModel('p', { providers: [fail('x'), fail('y')] }), /x falhou \| y falhou/);
  await assert.rejects(askModel('p', { providers: [fail('x'), fail('y')] }), /x: em espera \| y: em espera/);
});
test('saída sem JSON conta como falha e passa para o próximo', async () => {
  resetBreaker(); const r = await askModel('p', { providers: [{ id: 'lixo', run: async () => 'sem json' }, ok('bom')] });
  assert.equal(r.model, 'bom');
});

const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
test('DeepSeek: envia a chave só no cabeçalho, pede JSON e devolve o conteúdo', async () => {
  let seen; const run = makeDeepseek({ getKey: () => 'sk-teste', fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, { choices: [{ message: { content: '{"acao":"responder"}' } }] })(); } });
  assert.equal(await run('prompt json', 1000), '{"acao":"responder"}');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk-teste'); assert.ok(!seen.init.body.includes('sk-teste'), 'a chave não vai no corpo');
  const body = JSON.parse(seen.init.body); assert.equal(body.response_format.type, 'json_object'); assert.equal(body.model, 'deepseek-flash');
});
test('DeepSeek: sem chave, chave recusada, sem saldo e limite viram falhas com espera própria', async () => {
  const run = (status, key = 'k') => makeDeepseek({ getKey: () => key, fetchImpl: reply(status, {}) })('p', 1000);
  await assert.rejects(run(200, ''), e => /sem chave/.test(e.message) && e.cooldown >= 1800000);
  await assert.rejects(run(401), e => /recusada/.test(e.message) && e.cooldown >= 1800000);
  await assert.rejects(run(402), e => /saldo/.test(e.message) && e.cooldown >= 1800000);
  await assert.rejects(run(429), e => /limite/.test(e.message) && e.cooldown <= 180000);
});
test('cada provedor pode ter o próprio timeout', async () => {
  resetBreaker(); let recebido; await askModel('p', { timeoutMs: 60000, providers: [{ id: 'x', timeoutMs: 1234, run: async (_p, t) => { recebido = t; return '{"a":1}'; } }] });
  assert.equal(recebido, 1234);
});
