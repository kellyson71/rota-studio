import { norm } from './validator.js';

export function conversationFacts(history = [], message = '') {
  const messages = [...history.filter(h => h.de === 'cliente').map(h => h.texto), message].filter(x => typeof x === 'string');
  let service = null, pain = null;
  for (const text of messages) {
    const n = norm(text);
    for (const c of n.split(/[.!?;\n]|\bmas\b|\bporem\b/)) {
      if (/\b(site|pagina|landing|presenca online)\b/.test(c) && !/\bnao (?:quero|preciso|busco).{0,20}\bsite\b/.test(c)) service = 'presenca';
      if (/\b(agenda|agendamento|prontuario|fichas?)\b/.test(c) && !/\bnao (?:quero|preciso|busco).{0,20}\b(agenda|prontuario)\b/.test(c)) service = 'agenda';
      if (/\b(nao|sem|nenhum|nem)\b.{0,45}\b(problemas?|faltas?|dificuldade|atrasos?)\b|\b(funciona|funcionando|rodando|esta|ta) (?:muito )?bem\b|\bzero faltas\b/.test(c)) pain = false;
      else if (/\b(faltas?|esquece|esquecem|dor de cabeca|bagunca|correria|demora|dificil|complicado|atrapalha|problemas?|cansativo|sobrecarreg\w*)\b/.test(c) && !/\b(nao|sem|nenhum)\b/.test(c)) pain = true;
    }
  }
  const current = norm(message);
  const request = /\b(quero|preciso|busco|procuro)\b.{0,35}\b(site|agenda|agendamento|pagina|prontuario)\b/.test(current);
  const interest = (/\b(quanto|preco|valor|orcamento|como funciona|como seria|me mostra|me explica|quero saber|tenho interesse)\b/.test(current) || request) && !/^nao (?:quero|tenho interesse)/.test(current.split(',').pop().trim());
  return { service, pain, stage: interest ? 'interesse' : pain === false ? 'sem_dor' : pain === true ? 'dor' : messages.length > 2 ? 'sem_dor' : 'descoberta' };
}
