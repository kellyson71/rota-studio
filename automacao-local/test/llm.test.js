import test from 'node:test';
import assert from 'node:assert/strict';
import { askModel, resetBreaker, breakerState, makeDeepseek, classify, cooldownFor, ProviderError, BASE_COOLDOWN } from '../src/agent/llm.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const ok = (id, group = id, ms = 0) => ({ id, group, run: async () => { await wait(ms); return 'ruído {"acao":"responder"} fim'; } });
const fail = (id, kind = 'erro', group = id) => ({ id, group, run: async () => { throw new ProviderError(`${id} falhou`, kind); } });
// Fica pendurado até ser cancelado, como um CLI travado na rede.
const hang = (id, group = id, seen = {}) => ({ id, group, run: (_p, { signal }) => new Promise((_, reject) => { seen[id] = 'rodando'; signal.addEventListener('abort', () => { seen[id] = 'cancelado'; reject(new ProviderError('x', 'cancelado')); }); }) });

test('classifica os erros reais dos CLIs e APIs', () => {
  assert.equal(classify('Authentication required. Please visit the URL to log in'), 'auth');
  assert.equal(classify("Error: OpenCode's free tier can only be used from within OpenCode"), 'bloqueado');
  assert.equal(classify('google/gemma is temporarily rate-limited upstream'), 'limite');
  assert.equal(classify('HTTP 429 Too Many Requests'), 'limite');
  assert.equal(classify('402 insufficient balance'), 'saldo');
  assert.equal(classify('getaddrinfo ENOTFOUND api.deepseek.com'), 'rede');
  assert.equal(classify('algo estranho'), 'erro');
});
test('espera cresce com falhas seguidas, respeita Retry-After e tem teto; login e saldo são fixos', () => {
  const half = () => 0.5; // variação neutra
  assert.equal(cooldownFor('limite', 1, null, half), BASE_COOLDOWN.limite);
  assert.equal(cooldownFor('limite', 3, null, half), BASE_COOLDOWN.limite * 4);
  assert.equal(cooldownFor('limite', 20, null, half), 30 * 60000);
  assert.equal(cooldownFor('auth', 5, null, half), BASE_COOLDOWN.auth);
  assert.equal(cooldownFor('limite', 1, 7000, half), 7000);
  const spread = new Set([0, 0.25, 0.75, 1].map(r => cooldownFor('tempo', 1, null, () => r)));
  assert.ok(spread.size > 1, 'variação aleatória evita que todos voltem juntos');
});
test('usa o primeiro que responde e informa qual foi', async () => {
  resetBreaker(); const r = await askModel('p', { providers: [ok('a'), ok('b')] });
  assert.equal(r.model, 'a'); assert.deepEqual(r.json, { acao: 'responder' });
});
test('falha passa na hora para o próximo; quem falhou fica em espera e depois volta', async () => {
  resetBreaker(); let t = 1_000_000, tries = 0;
  const agy = { id: 'agy', group: 'agy', run: async () => { tries++; throw new ProviderError('agy: login', 'auth'); } };
  const prov = [agy, ok('deepseek')];
  assert.equal((await askModel('p', { providers: prov, now: () => t })).model, 'deepseek');
  t += 60000; await askModel('p', { providers: prov, now: () => t });
  assert.equal(tries, 1, 'em espera: não tenta de novo'); assert.ok(breakerState(t).agy);
  t += BASE_COOLDOWN.auth; await askModel('p', { providers: prov, now: () => t });
  assert.equal(tries, 2, 'depois da espera, tenta de novo');
});
test('corrida com reforço: o lento é cancelado quando o reforço responde', async () => {
  resetBreaker(); const seen = {};
  const r = await askModel('p', { providers: [hang('opencode', 'opencode', seen), ok('deepseek', 'deepseek', 5)], hedgeAfterMs: 30 });
  assert.equal(r.model, 'deepseek'); assert.ok(r.ms < 1000);
  await wait(5); assert.equal(seen.opencode, 'cancelado');
});
test('quem perde a corrida 3 vezes seguidas por lentidão sai da frente por um tempo', async () => {
  resetBreaker();
  for (let i = 0; i < 3; i++) await askModel('p', { providers: [hang('lento', 'g1'), ok('rapido', 'g2', 5)], hedgeAfterMs: 20 });
  assert.ok(breakerState().lento, 'o lento entrou em espera');
  const seen = {}; await askModel('p', { providers: [hang('lento', 'g1', seen), ok('rapido', 'g2')], hedgeAfterMs: 20 });
  assert.equal(seen.lento, undefined, 'nem foi iniciado');
});
test('provedores do mesmo grupo nunca rodam juntos; o reforço pula para outro grupo', async () => {
  resetBreaker(); const seen = {};
  const r = await askModel('p', { providers: [hang('oc1', 'opencode', seen), hang('oc2', 'opencode', seen), ok('ds', 'deepseek', 5)], hedgeAfterMs: 20 });
  assert.equal(r.model, 'ds'); assert.equal(seen.oc2, undefined, 'segundo opencode não rodou em paralelo com o primeiro');
});
test('todos em espera: falha na hora e diz quando tentar de novo', async () => {
  resetBreaker(); await assert.rejects(askModel('p', { providers: [fail('x', 'limite'), fail('y', 'limite')] }), /x falhou \| y falhou/);
  const t0 = Date.now();
  await assert.rejects(askModel('p', { providers: [fail('x'), fail('y')] }), e => /em espera/.test(e.message) && e.retryInMs >= 5000);
  assert.ok(Date.now() - t0 < 100);
});
test('prazo total: se todos travam, desiste no prazo e cancela todos', async () => {
  resetBreaker(); const seen = {};
  await assert.rejects(askModel('p', { providers: [hang('a', 'g1', seen), hang('b', 'g2', seen)], hedgeAfterMs: 10, deadlineMs: 60 }), /nenhum provedor respondeu/);
  await wait(5); assert.deepEqual(seen, { a: 'cancelado', b: 'cancelado' });
});
test('saída sem JSON conta como falha de formato e passa para o próximo', async () => {
  resetBreaker(); const r = await askModel('p', { providers: [{ id: 'lixo', group: 'g', run: async () => 'sem json' }, ok('bom')] });
  assert.equal(r.model, 'bom');
});

const reply = (status, body, headers = {}) => async () => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body });
test('DeepSeek: chave só no cabeçalho, pede JSON e devolve o conteúdo', async () => {
  let seen; const run = makeDeepseek({ getKey: () => 'sk-teste', fetchImpl: async (url, init) => { seen = init; return reply(200, { choices: [{ message: { content: '{"acao":"responder"}' } }] })(); } });
  assert.equal(await run('prompt json', { timeoutMs: 1000 }), '{"acao":"responder"}');
  assert.equal(seen.headers.Authorization, 'Bearer sk-teste'); assert.ok(!seen.body.includes('sk-teste'));
  assert.equal(JSON.parse(seen.body).response_format.type, 'json_object');
});
test('DeepSeek: cada erro vira o tipo certo; 429 respeita Retry-After', async () => {
  const run = (status, headers, key = 'k') => makeDeepseek({ getKey: () => key, fetchImpl: reply(status, {}, headers) })('p', { timeoutMs: 1000 });
  await assert.rejects(run(200, {}, ''), e => e.kind === 'auth');
  await assert.rejects(run(401), e => e.kind === 'auth');
  await assert.rejects(run(402), e => e.kind === 'saldo');
  await assert.rejects(run(429, { 'retry-after': '12' }), e => e.kind === 'limite' && e.retryAfterMs === 12000);
  await assert.rejects(run(500), e => e.kind === 'limite');
});
