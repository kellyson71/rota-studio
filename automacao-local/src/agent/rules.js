import { isOptOut } from '../runner.js';

const norm = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const TZ = 'America/Fortaleza';

export function inBusinessHours(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(parts.weekday)) return hour >= 8 && hour < 18;
  return parts.weekday === 'Sat' && hour >= 8 && hour < 12;
}

const ACK = /^((ok+|okay|blz|beleza|certo|entendi|valeu|vlw|obrigad[oa]|muito obrigad[oa]|agradeco|show|combinado|tudo bem|tranquilo|perfeito|otimo|fechado)[\s,.!]*)+$/;
const WHO = /^(quem (e|eh) (voce|vc|isso|essa|esse)|quem (esta|ta) falando|com quem (eu )?falo|do que se trata|qual (e )?o assunto|que empresa (e|eh)|de onde (voce|vc) (e|eh)|quem (e|eh))\??$/;
// Sondagens de "é robô?" mais sutis e tentativas de manipular o atendente: nunca têm resposta automática.
const PROBE = /(de verdade|pessoa real|humano mesmo|ser humano|respond\w* (muito )?rapid|(resposta|mensagem|atendimento|isso|voce) (e |eh )?automatic|e gravac|gravacao|prova que|manda (um )?audio|grava (um )?audio|quanto e \d+ ?(mais|menos|vezes|x|\+|-|\*) ?\d+|\bgpt\b|chat ?gpt|gemini|claude|\bllm\b|modelo de linguagem|prompt|ignor\w* (as |todas as |suas )?(regras|instruc)|esquec\w* (tudo|as regras|suas instruc)|finja|faz de conta|a partir de agora voce|modo desenvolvedor|repita (o texto|suas instruc|as regras)|execut\w* (o )?comando)/;
const ROBOT = /(voce (e|eh|ta|esta) (um |uma )?(robo|bot|ia|inteligencia artificial|humano|pessoa|gente|atendente|automatic)|(e|eh) (um )?(robo|bot|ia)\b|falando com (um |uma )?(robo|bot|maquina|pessoa)|quem (ta|esta) (ai|escrevendo|digitando)|chatgpt|resposta automatica)/;
const COMPLAINT = /(spam|quem (te )?passou (o )?meu (numero|contato|telefone)|onde (voce )?(conseguiu|pegou) meu|vou (te )?(denunciar|bloquear|reclamar)|me deixa em paz|para de me (mandar|enviar|perturbar)|nao (me )?(perturbe|incomode)|isso e (golpe|abuso)|lgpd)/;
const HOURS = /^(qual (e )?(o )?horario( de (atendimento|funcionamento))?|que horas (voces )?(abrem|funcionam|atendem)|horario de (funcionamento|atendimento)|que horas (voce )?atende)\??$/;
const ADDRESS = /^(qual (o )?endereco|onde (voces )?(ficam|fica)|onde (e|eh) (o escritorio|a empresa))\??$/;
const SITE = /^(qual (e )?o (seu |de voces )?(site|link)|tem site|voces tem site|cade o site|manda o site)\??$/;

const MEDIA = /^\[(ptt|audio|image|video|document|sticker|location|vcard|multi_vcard)\]$/;

export function route({ text, kb, blocked = false }) {
  const t = norm(text);
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return { kind: 'ignore', reason: 'sem texto (emoji ou pontuação)' };
  if (blocked) return { kind: 'ignore', reason: 'contato bloqueado' };
  if (MEDIA.test(String(text).trim())) return { kind: 'handoff', rule: 'media', reason: 'áudio, imagem ou arquivo: ainda sem tratamento automático' };
  if (isOptOut(text)) return { kind: 'rule', rule: 'optout', block: true, status: 'Sem interesse', reply: 'Sem problema, não envio mais mensagens. Obrigado pelo retorno!' };
  if (COMPLAINT.test(t)) return { kind: 'handoff', rule: 'complaint', complaint: true, block: true, reason: 'reclamação ou desconfiança; sem resposta automática' };
  if (ROBOT.test(t)) return { kind: 'handoff', rule: 'robot', reason: 'perguntou se é robô; responder apenas com você' };
  if (PROBE.test(t)) return { kind: 'handoff', rule: 'probe', reason: 'testando se é robô ou tentando desviar o atendimento; fica com você' };
  if (ACK.test(t)) return { kind: 'rule', rule: 'ack', reply: 'Por nada! Qualquer coisa é só me chamar por aqui.' };
  if (WHO.test(t) && kb.quemSou) return { kind: 'rule', rule: 'who', reply: kb.quemSou };
  if (HOURS.test(t) && kb.horario) return { kind: 'rule', rule: 'hours', reply: kb.horario };
  if (ADDRESS.test(t) && kb.endereco) return { kind: 'rule', rule: 'address', reply: kb.endereco };
  if (SITE.test(t) && kb.site) return { kind: 'rule', rule: 'site', reply: `Nosso site é ${kb.site}` };
  return { kind: 'agent' };
}
