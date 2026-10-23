import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route, inBusinessHours } from '../src/agent/rules.js';
import { validate } from '../src/agent/validator.js';
import { handleInbound, stageOf, buildPrompt } from '../src/agent/agent.js';
import { extractJson } from '../src/agent/llm.js';

const kb = { ...JSON.parse(readFileSync(new URL('../src/agent/kb.json', import.meta.url), 'utf8')), prazos: { site: [3, 7], sistema: [14, 28] } };
const good = { acao: 'responder', intencao: 'duvida', urgencia: false, temperatura: 'morno', confianca: 0.9, resposta: 'Entendi. Hoje vocês confirmam as consultas por ligação?', motivo: 'qualificação' };
const fake = json => async () => ({ model: 'fake', json });
const run = (message, json, extra = {}) => handleInbound({ message, kb, llm: fake(json), mode: 'live', ...extra });

test('regras fixas respondem sem chamar o modelo', async () => {
  let calls = 0; const llm = async () => { calls++; return { json: good }; };
  for (const [text, rule] of [['Ok, obrigado!', 'ack'], ['Quem é você?', 'who'], ['Qual o site?', 'site'], ['PARAR', 'optout']]) {
    const r = await handleInbound({ message: text, kb, llm, mode: 'live' });
    assert.equal(r.final, 'send'); assert.equal(r.rule, rule);
  }
  assert.equal(calls, 0);
});
test('variações de descadastro são reconhecidas pelo código, sem o modelo', async () => {
  for (const t of ['Pare de me mandar mensagem', 'não me mande mais mensagens', 'por favor, tire meu número da lista', 'não tenho interesse em receber mensagens']) {
    const r = await run(t, good); assert.equal(r.rule, 'optout', t); assert.equal(r.block, true);
  }
  assert.equal((await run('Me manda o preço', good)).rule, undefined);
});
test('emoji sozinho não gera resposta', async () => { assert.equal((await run('👍', good)).final, 'ignore'); });
test('"lembrete automático" do produto não é confundido com robô', () => {
  assert.equal(validate({ ...good, resposta: 'O sistema manda lembrete automático no WhatsApp' }, { kb }).length, 0);
  assert.ok(validate({ ...good, resposta: 'Esta é uma resposta automática' }, { kb }).length > 0);
});
test('pedido de parar bloqueia o contato', async () => {
  const r = await run('não quero receber mensagens', good); assert.equal(r.block, true); assert.equal(r.status, 'Sem interesse');
});
test('pergunta se é robô, reclamação e bloqueado vão para o humano ou são ignorados', async () => {
  assert.equal((await run('você é um robô?', good)).final, 'draft');
  const c = await run('quem te passou meu número? isso é spam', good); assert.equal(c.final, 'draft'); assert.equal(c.complaint, true);
  assert.equal((await run('oi', good, { blocked: true })).final, 'ignore');
});
test('preço, reunião, objeção e urgência sempre viram rascunho', async () => {
  for (const patch of [{ intencao: 'preco' }, { intencao: 'reuniao' }, { intencao: 'objecao' }, { urgencia: true }, { confianca: 0.4 }])
    assert.equal((await run('qualquer', { ...good, ...patch })).final, 'draft', JSON.stringify(patch));
});
test('resposta segura é enviada no modo live e vira rascunho no modo sombra', async () => {
  assert.equal((await run('Fazemos por ligação mesmo', good)).final, 'send');
  assert.equal((await run('Fazemos por ligação mesmo', good, { mode: 'shadow' })).final, 'draft');
});
test('validador barra valor, desconto, teto, prazo, link, robô e repetição', () => {
  const bad = r => validate({ ...good, resposta: r }, { kb, lastSent: 'Mesma frase.' });
  assert.ok(bad('Um site sai por R$ 900').some(i => i.includes('valor')));
  assert.ok(bad('Posso fazer 50% de desconto').some(i => i.includes('desconto')));
  assert.ok(bad('Meu máximo é 10% de desconto').some(i => i.includes('teto')));
  assert.ok(bad('Fica pronto em 2 dias').some(i => i.includes('prazo')));
  assert.equal(bad('Fica pronto em 3 a 7 dias').length, 0);
  assert.ok(bad('Veja em http://golpe.com/x').some(i => i.includes('link')));
  assert.ok(bad('Não sou um robô, sou pessoa').length > 0);
  assert.ok(bad('Garantimos o topo do Google').some(i => i.includes('proibida')));
  assert.ok(bad('Mesma frase.').some(i => i.includes('repete')));
});
test('saída inválida, falha do modelo e resposta ruim nunca são enviadas', async () => {
  assert.equal((await run('oi tudo bem', { acao: 'x' })).final, 'draft');
  assert.equal((await handleInbound({ message: 'oi tudo bem', kb, mode: 'live', llm: async () => { throw new Error('caiu'); } })).final, 'draft');
  assert.equal((await run('oi tudo bem', { ...good, resposta: 'Sai por R$ 500' })).final, 'draft');
});
test('encerrar fecha sem texto; extractJson tolera ruído', async () => {
  assert.equal((await run('não preciso', { ...good, acao: 'encerrar', resposta: '' })).final, 'close');
  assert.deepEqual(extractJson('\x1b[0m> build\n```json\n{"a":"}{","b":{"c":1}}\n```'), { a: '}{', b: { c: 1 } });
});
test('resposta que cita prazo vira rascunho mesmo sendo segura', async () => {
  const r = await run('quanto tempo leva?', { ...good, resposta: 'Em torno de 3 semanas, confirmo na proposta. Qual o tamanho da equipe?' });
  assert.equal(r.final, 'draft'); assert.match(r.why, /prazo/);
});
test('só o preço de referência do contato pode ser citado', () => {
  const price = 'R$ 1.500 de implantação + R$ 150/mês';
  const t = r => validate({ ...good, resposta: r }, { kb, contactPrice: price });
  assert.equal(t('Começa em R$ 1.500 de implantação e R$ 150/mês, conforme o escopo').length, 0);
  assert.ok(t('Sai por R$ 900').some(i => i.includes('valor')));
  assert.ok(validate({ ...good, resposta: 'Sai por R$ 150' }, { kb }).some(i => i.includes('valor')));
});
test('horário de atendimento responde por regra', async () => {
  const r = await run('Qual o horário de atendimento?', good); assert.equal(r.rule, 'hours'); assert.match(r.text, /9h às 22h/);
});
test('sem prazos cadastrados, qualquer prazo numérico é barrado', () => {
  assert.ok(validate({ ...good, resposta: 'Fica pronto em 5 dias' }, { kb: { ...kb, prazos: {} } }).some(i => i.includes('prazo')));
  assert.equal(validate({ ...good, resposta: 'Um site fica pronto em poucas semanas' }, { kb: { ...kb, prazos: {} } }).length, 0);
});
test('horário comercial em Fortaleza', () => {
  assert.equal(inBusinessHours(new Date('2026-10-23T15:00:00Z')), true);   // sex 12h
  assert.equal(inBusinessHours(new Date('2026-10-23T22:00:00Z')), false);  // sex 19h
  assert.equal(inBusinessHours(new Date('2026-10-24T13:00:00Z')), true);   // sáb 10h
  assert.equal(inBusinessHours(new Date('2026-10-24T16:00:00Z')), false);  // sáb 13h
  assert.equal(inBusinessHours(new Date('2026-10-25T14:00:00Z')), false);  // dom
});

test('etapa da conversa é decidida pelo código a partir do que o cliente disse', () => {
  const eu = { de: 'eu', texto: 'Como vocês fazem hoje a confirmação dos pacientes?' };
  assert.equal(stageOf([eu], 'estamos fazendo normal via whatzap'), 'descoberta');
  assert.equal(stageOf([eu, { de: 'cliente', texto: 'via whatsapp' }], 'umas 4 faltas por semana, dá trabalho'), 'dor');
  assert.equal(stageOf([eu], 'quanto custa?'), 'interesse');
  assert.equal(stageOf([eu, { de: 'cliente', texto: 'pelo whatsapp' }, { de: 'cliente', texto: 'tá ok' }], 'funciona bem'), 'sem_dor');
  assert.match(buildPrompt({ kb, history: [eu], message: 'via whatsapp' }), /ETAPA ATUAL[^\n]*DESCOBERTA[^\n]*NÃO ofereça/);
});
