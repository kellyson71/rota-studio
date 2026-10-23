import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, formatNotice, codeOf } from '../src/agent/notify.js';

test('comandos de aprovação exigem o código; mensagens comuns não são comando', () => {
  assert.deepEqual(parseCommand('ok A1B2'), { action: 'approve', code: 'A1B2' });
  assert.deepEqual(parseCommand('Ok a1b2!'), { action: 'approve', code: 'A1B2' });
  assert.deepEqual(parseCommand('não a1b2'), { action: 'reject', code: 'A1B2' });
  assert.deepEqual(parseCommand('nao #A1B2'), { action: 'reject', code: 'A1B2' });
  assert.deepEqual(parseCommand('edita a1b2 Oi! Podemos falar amanhã?\nAbraço'), { action: 'approve', code: 'A1B2', text: 'Oi! Podemos falar amanhã?\nAbraço' });
  for (const t of ['ok', 'ok obrigado', 'não tenho interesse', 'oi boa tarde, estamos fazendo normal via whatzap', 'edita', 'ok zzzz', 'quanto custa?'])
    assert.equal(parseCommand(t), null, t);
});
test('notificação traz código, cliente, sugestão e como responder; sem sugestão pede edição', () => {
  const id = 'a1b2c3d4-0000-4000-8000-000000000000';
  const n = formatNotice({ id, name: '[TESTE] Kellyson', body: 'quanto custa?', suggestion: 'Começa em R$ 1.500.', decision: { intencao: 'preco', urgencia: true, temperatura: 'quente' } });
  assert.equal(codeOf(id), 'A1B2');
  assert.match(n, /A1B2/); assert.match(n, /URGENTE · pediu preço · quente/); assert.match(n, /“quanto custa\?”/); assert.match(n, /\*ok A1B2\*/);
  const vazio = formatNotice({ id, name: 'X', body: 'é robô?', suggestion: '', decision: { why: 'perguntou se é robô' } });
  assert.match(vazio, /Sem sugestão \(perguntou se é robô\)/); assert.doesNotMatch(vazio, /\*ok A1B2\*/);
  assert.match(formatNotice({ id, name: 'X', body: 'oi', suggestion: 's' }, { reminder: true }), /Ainda esperando/);
});
