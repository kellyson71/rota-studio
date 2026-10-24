export const ACTIONS = ['responder', 'rascunho', 'escalar', 'encerrar'];
export const INTENTS = ['contexto', 'duvida', 'interesse', 'outro', 'preco', 'reuniao', 'objecao', 'fora_do_assunto'];
export const TEMPERATURES = ['frio', 'morno', 'quente'];
export const norm = text => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export const hasMoney = text => /(?:r\s*\$|\bbrl\b|\breais?\b|\beuros?\b|\bdolares?\b|\b(?:desconto|gratis|gratuito|bonus|brinde|gratuidade|parcel\w*|por cento|porcento)\b|sem (?:custo|cobranca)|\b(?:fica|custa|sai|valor|preco|por|vai ser)\s*(?:em|por|de|:)?\s*\d|\b(?:fica|custa|sai|valor|preco)\b.{0,15}\b(?:cem|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)\b|\d[\d.,]*\s*(?:\/\s*(?:mes|ano)|por\s+(?:mes|ano)|mensais|anuais)|\d+\s*(?:x\s*de|parcelas?))/i.test(norm(text));
export const hasCommitment = text => /\b(amanha|hoje (?:mesmo|a tarde|a noite)|depois de amanha|proxima (?:segunda|terca|quarta|quinta|sexta|semana)|(?:entrego|entregamos|fica pronto|esta pronto|esta marcado|confirmado para|garanto)\b|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b)/.test(norm(text));

export function validateText(text, { kb, lastSent = '', approvedText = null } = {}) {
  if (typeof text !== 'string') return ['resposta deve ser texto'];
  const issues = [], n = norm(text);
  if (!text.trim()) return ['resposta vazia'];
  if (text.length > 4000) issues.push('resposta longa demais');
  if (/\{[^}]+\}/.test(text)) issues.push('campos da mensagem não preenchidos');
  if (kb?.whatsapp?.envioAutomatico === false && /\b(whatsapp|whats\s+app|whatzap|zap)\b/.test(n)
    && /\b(automatic[oa]s?|sozinh[oa]s?|programad[oa]s?)\b|por conta propria|sem (precisar|necessidade) de (abrir|enviar)/.test(n)) issues.push('envio automático no WhatsApp não é uma funcionalidade do produto; só template e abertura manual');
  const allowed = new Set([kb?.site, ...(kb?.allowedLinks || [])].filter(Boolean).map(value => {
    try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase(); } catch { return ''; }
  }));
  for (const raw of text.match(/(?:[a-z][\w+.-]*:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9-]+\.)+(?:com|br|app|io|me|net|org)\b[^\s<>]*/gi) || []) {
    const token = raw.replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(token.includes('://') ? token : `https://${token}`);
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !allowed.has(url.hostname.toLowerCase())) issues.push(`link não autorizado: ${token}`);
    } catch { issues.push(`link inválido: ${token}`); }
  }
  const trusted = approvedText !== null && text === approvedText;
  if (!trusted && hasMoney(text)) issues.push('valor exige proposta calculada pelo catálogo');
  if (!trusted && hasCommitment(text)) issues.push('compromisso ou data sem autorização');
  if (!trusted) for (const m of n.matchAll(/\d+(?:[.,]\d+)?\s*%/g)) issues.push(`desconto ou percentual exige proposta calculada: ${m[0]}`);
  if (/(maximo|limite|teto|ate)[^.!?]{0,40}\d+\s*%|\d+\s*%[^.!?]{0,30}(maximo|limite|teto)/.test(n)) issues.push('revela o teto de desconto');
  const ranges = Object.values(kb?.prazos || {});
  for (const m of n.matchAll(/(\d+)(?:\s*(?:a|ate|-)\s*(\d+))?\s*(dias?|semanas?)/g)) {
    const mult = m[3].startsWith('semana') ? 7 : 1;
    if (!ranges.some(([a,b]) => Number(m[1])*mult >= a && Number(m[2] || m[1])*mult <= b)) issues.push(`prazo fora da faixa: ${m[0]}`);
  }
  for (const phrase of kb?.proibidos || []) if (n.includes(norm(phrase)) && !(trusted && ['sem custo','de graca'].includes(norm(phrase)))) issues.push(`expressão proibida: ${phrase}`);
  if (/\b(robo|bot|ia|inteligencia artificial|chatgpt|assistente virtual)\b|(resposta|atendimento|mensagem) automatic[oa]|respondida por/.test(n)) issues.push('menciona ser automatizado');
  if (/(nao sou|sou (uma )?pessoa|sou humano|sou de carne)/.test(n) && /(robo|bot|ia|humano|pessoa)/.test(n)) issues.push('afirma ser humano');
  if (lastSent && norm(lastSent).replace(/\s+/g,' ') === n.replace(/\s+/g,' ')) issues.push('repete a última mensagem enviada');
  return [...new Set(issues)];
}

export function validate(decision, context) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return ['saída não é um objeto'];
  const issues = [];
  const fields=new Set(['acao','intencao','confianca','urgencia','temperatura','resposta','motivo']);
  for(const key of Object.keys(decision))if(!fields.has(key))issues.push(`campo inesperado: ${key}`);
  if (!ACTIONS.includes(decision.acao)) issues.push('ação inválida');
  if (!INTENTS.includes(decision.intencao)) issues.push('intenção inválida');
  if (typeof decision.confianca !== 'number' || !Number.isFinite(decision.confianca) || decision.confianca < 0 || decision.confianca > 1) issues.push('confiança deve ser número de 0 a 1');
  if (typeof decision.urgencia !== 'boolean') issues.push('urgência ausente');
  if (!TEMPERATURES.includes(decision.temperatura)) issues.push('temperatura inválida');
  if (typeof decision.resposta !== 'string') issues.push('resposta deve ser texto');
  if (decision.motivo !== undefined && typeof decision.motivo !== 'string') issues.push('motivo deve ser texto');
  if (typeof decision.resposta === 'string' && decision.resposta.trim()) issues.push(...validateText(decision.resposta, context));
  else if (decision.acao === 'responder') issues.push('resposta vazia');
  return [...new Set(issues)];
}
