export const phoneKey = value => value.startsWith('55') && value.length === 13 && value[4] === '9' ? value.slice(0,4) + value.slice(5) : value;
// O WhatsApp Web atual não expõe mais id._serialized: o identificador serializado vem em "$1".
export const msgId = id => (typeof id === 'string' ? id : id?._serialized || id?.$1 || (id?.id && id.remote ? `${id.fromMe}_${id.remote._serialized || id.remote}_${id.id}` : null));
// Um parágrafo vira uma mensagem (até 3; o que passar disso segue junto na última).
export function splitParts(body) {
  const parts = String(body).split(/\n[ \t]*\n+/).map(x => x.trim()).filter(Boolean);
  return parts.length > 3 ? [...parts.slice(0, 2), parts.slice(2).join('\n\n')] : parts;
}
const humanPause = () => new Promise(resolve => setTimeout(resolve, 2500 + Math.random() * 3500));
export function isOptOut(text) {
  const s = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[.!?]+$/g, '');
  return /^(pare|parar|sair|stop|remover|cancelar|nao tenho interesse|sem interesse|nao me envie mais mensagens|nao quero receber mensagens|nao quero mais mensagens)$/.test(s)
    || /\b(pare|para|parem|parar) de (me )?(mandar|enviar|chamar|escrever|incomodar)\b/.test(s)
    || /\bnao (me )?(mande|envie|chame|escreva|procure|incomode|perturbe)\b.*\b(mais|mensagem|mensagens|contato)\b/.test(s)
    || /\b(tire|tira|remova|exclua|apague)\b.*\b(numero|contato|lista|cadastro)\b/.test(s)
    || /\bnao (quero|tenho interesse|preciso)\b.*\b(receber|mensagens?|contato)\b/.test(s);
}

export class Runner {
  constructor({ rpc, journal, whatsapp, pause = humanPause, validateJob = () => [] }) { Object.assign(this, { rpc, journal, whatsapp, pause, validateJob }); this.busy = false; }
  async flush() {
    for (const row of this.journal.manuals?.() || []) {
      await this.rpc('wa_manual_outbound', JSON.parse(row.payload)); this.journal.manualDone(row.id);
    }
    // Respostas primeiro: cancelam os próximos agendamentos antes de buscar tarefas.
    for (const row of this.journal.replies()) {
      await this.rpc('wa_reply', JSON.parse(row.payload));
      this.journal.replyDone(row.id);
    }
    for (const row of this.journal.partsPending?.() || []) {
      await this.rpc('wa_part_record', { p_id:row.job_id,p_claim:row.claim,p_index:row.part_index,p_body:row.body,p_remote_id:row.remote_id });this.journal.partSynced(row.job_id,row.part_index);
    }
    for (const row of this.journal.pending()) {
      await this.rpc('wa_finish', { p_id: row.id, p_claim: row.claim, p_status: row.status, p_remote_id: row.remote_id, p_error: row.error });
      this.journal.synced(row.id);
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.flush();
      if (!this.whatsapp.ready) return;
      const job = await this.rpc('wa_claim');
      if (!job || !this.journal.begin(job)) return;
      let attempted = false;
      try {
        const issues = await this.validateJob(job);
        if (issues.length) throw new Error('Política de envio: ' + issues.join('; '));
        const address = await this.whatsapp.resolve(job.phone);
        if (!address) throw new Error('Número não encontrado no WhatsApp');
        if (this.whatsapp.beforeSend) await this.whatsapp.beforeSend(address, job);
        await this.flush();
        const parts = splitParts(job.body);
        let remoteId = null;
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) await this.pause();
          if (i > 0 && this.whatsapp.beforeSend) await this.whatsapp.beforeSend(address,job);
          await this.flush();
          if (!this.whatsapp.ready) throw new Error('WhatsApp desconectou antes da próxima parte');
          if (!await this.rpc('wa_can_send', { p_id:job.id,p_claim:job.claim_token })) {
            this.journal.finish(job.id,i ? 'uncertain' : 'cancelled',remoteId,i ? 'Interrompida após parte confirmada; confira a conversa' : 'Envio cancelado pela política');
            await this.flush();return;
          }
          try {
            const startedAt = Date.now();
            this.journal.partBegin?.(job,i,parts[i]);
            attempted = true;
            const sent = await this.whatsapp.send(address, parts[i]);
            // Sem id no retorno da biblioteca, confere na conversa qual mensagem acabou de sair.
            const id = msgId(sent?.id) || await this.whatsapp.confirm?.(address, parts[i], startedAt, sent);
            if (!id) throw new Error('WhatsApp não retornou confirmação');
            this.journal.partFinish?.(job.id,i,id);
            remoteId ??= id;
          } catch (error) {
            if (i === 0) throw error;
            throw new Error(`A parte ${i + 1} de ${parts.length} não foi confirmada; as anteriores já saíram. Confira o WhatsApp (${error.message})`);
          }
        }
        this.journal.finish(job.id, 'sent', remoteId);
      } catch (error) {
        this.journal.finish(job.id, attempted ? 'uncertain' : 'failed', null, String(error.message).slice(0, 500));
      }
      await this.flush();
    } finally { this.busy = false; }
  }
}
