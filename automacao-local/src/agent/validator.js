export const ACTIONS = ['responder', 'rascunho', 'escalar', 'encerrar'];
export const INTENTS = ['preco', 'reuniao', 'duvida', 'interesse', 'objecao', 'outro'];

const norm = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function validate(decision, { kb, lastSent = '', contactPrice = '' }) {
  const issues = [];
  if (!decision || typeof decision !== 'object') return ['saída não é um objeto'];
  if (!ACTIONS.includes(decision.acao)) issues.push('ação inválida');
  if (!INTENTS.includes(decision.intencao)) issues.push('intenção inválida');
  if (!(decision.confianca >= 0 && decision.confianca <= 1)) issues.push('confiança fora de 0 a 1');
  if (typeof decision.urgencia !== 'boolean') issues.push('urgência ausente');
  if (decision.acao === 'encerrar') return issues;
  const text = String(decision.resposta || '');
  const n = norm(text);
  if (!text.trim()) return [...issues, 'resposta vazia'];
  if (text.length > 600) issues.push('resposta longa demais');
  for (const url of n.match(/(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|br|app|io|me|net)\b\S*/g) || []) {
    if (!kb.site || !norm(url).includes(norm(kb.site))) issues.push(`link não autorizado: ${url}`);
  }
  const allowed = [...(kb.precos || []).map(String), ...(String(contactPrice).match(/\d[\d.]*(?:,\d+)?/g) || [])];
  for (const m of text.matchAll(/R\$\s*([\d.]+(?:,\d+)?)/g)) {
    if (!allowed.includes(m[1])) issues.push(`valor não cadastrado: R$ ${m[1]}`);
  }
  for (const m of n.matchAll(/(\d+)\s*%/g)) {
    if (Number(m[1]) > kb.descontoMax) issues.push(`desconto acima do teto: ${m[1]}%`);
  }
  if (/(maximo|limite|teto|ate)[^.!?]{0,40}\d+\s*%|\d+\s*%[^.!?]{0,30}(maximo|limite|teto)/.test(n)) issues.push('revela o teto de desconto');
  const ranges = Object.values(kb.prazos || {});
  for (const m of n.matchAll(/(\d+)(?:\s*(?:a|ate|-)\s*(\d+))?\s*(dias?|semanas?)/g)) {
    const mult = m[3].startsWith('semana') ? 7 : 1;
    const lo = Number(m[1]) * mult, hi = Number(m[2] || m[1]) * mult;
    if (!ranges.some(([a, b]) => lo >= a && hi <= b)) issues.push(`prazo fora da faixa: ${m[0]}`);
  }
  for (const phrase of kb.proibidos || []) if (n.includes(norm(phrase))) issues.push(`expressão proibida: ${phrase}`);
  if (/\b(robo|bot|ia|inteligencia artificial|chatgpt|assistente virtual)\b|(resposta|atendimento|mensagem) automatic[oa]|respondida por/.test(n)) issues.push('menciona ser automatizado');
  if (/(nao sou|sou (uma )?pessoa|sou humano|sou de carne)/.test(n) && /(robo|bot|ia|humano|pessoa)/.test(n)) issues.push('afirma ser humano');
  if (lastSent && norm(lastSent).trim() === n.trim()) issues.push('repete a última mensagem enviada');
  return issues;
}
