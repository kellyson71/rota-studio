// Notificações e comandos de aprovação pelo WhatsApp do dono.
const norm = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
export const codeOf = id => String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

const WHY = { preco: 'pediu preço', reuniao: 'quer reunião', objecao: 'objeção', interesse: 'interesse', duvida: 'dúvida' };
export function formatNotice({ id, name, phone, body, suggestion, decision = {} }, { reminder = false } = {}) {
  const code = codeOf(id);
  const tags = [decision.urgencia && 'URGENTE', WHY[decision.intencao], decision.temperatura].filter(Boolean).join(' · ');
  return [
    `${reminder ? '⏰ Ainda esperando você' : '📝 Resposta para aprovar'} · ${code}`,
    `${name || 'Contato'}${phone ? ' · +' + phone : ''}${tags ? ` (${tags})` : ''}`,
    '',
    `Cliente: “${String(body).slice(0, 400)}”`,
    '',
    suggestion ? `Sugestão: ${suggestion}` : `Sem sugestão (${decision.why || 'precisa de você'}).`,
    '',
    ['robot','probe','complaint','media','payment'].includes(decision.rule) ? `A conversa está pausada. Responda ao cliente manualmente; *retomar ${phone}* libera as próximas respostas.` : decision.needsProfile ? `Confira o pedido e use *orcar ${phone} agenda aquisicao | agendamento,recepcao* (ajuste serviço, faixa e módulos). Não é preciso inventar uma sugestão de preço.` : suggestion ? `*ok ${code}* envia · *edita ${code} seu texto* troca · *não ${code}* descarta` : `*edita ${code} seu texto* responde · *não ${code}* descarta`
  ].join('\n');
}

// Só comandos com código: qualquer outra mensagem do dono segue como conversa normal.
export function parseCommand(text) {
  const t = norm(text);
  let m = t.match(/^(?:ok|sim|aprova|aprovo|aprovar|envia|enviar|manda)\s+#?([0-9a-f]{4,32})\s*[.!]?$/i);
  if (m) return { action: 'approve', code: m[1].toUpperCase() };
  m = t.match(/^(?:nao|descarta|descartar|rejeita|rejeitar|cancela)\s+#?([0-9a-f]{4,32})\s*[.!]?$/i);
  if (m) return { action: 'reject', code: m[1].toUpperCase() };
  m = String(text || '').trim().match(/^(?:edita|editar|edite|troca|trocar)\s+#?([0-9a-fA-F]{4,32})\s+([\s\S]+)$/i);
  if (m) return { action: 'approve', code: m[1].toUpperCase(), text: m[2].trim() };
  return null;
}
