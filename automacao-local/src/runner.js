export const phoneKey = value => value.startsWith('55') && value.length === 13 && value[4] === '9' ? value.slice(0,4) + value.slice(5) : value;
export function isOptOut(text) {
  const s = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[.!?]+$/g, '');
  return /^(pare|parar|sair|stop|remover|cancelar|nao tenho interesse|sem interesse|nao me envie mais mensagens|nao quero receber mensagens|nao quero mais mensagens)$/.test(s)
    || /\b(pare|para|parem|parar) de (me )?(mandar|enviar|chamar|escrever|incomodar)\b/.test(s)
    || /\bnao (me )?(mande|envie|chame|escreva|procure|incomode|perturbe)\b.*\b(mais|mensagem|mensagens|contato)\b/.test(s)
    || /\b(tire|tira|remova|exclua|apague)\b.*\b(numero|contato|lista|cadastro)\b/.test(s)
    || /\bnao (quero|tenho interesse|preciso)\b.*\b(receber|mensagens?|contato)\b/.test(s);
}

export class Runner {
  constructor({ rpc, journal, whatsapp }) { Object.assign(this, { rpc, journal, whatsapp }); this.busy = false; }
  async flush() {
    // Respostas primeiro: cancelam os próximos agendamentos antes de buscar tarefas.
    for (const row of this.journal.replies()) {
      await this.rpc('wa_reply', JSON.parse(row.payload));
      this.journal.replyDone(row.id);
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
        const address = await this.whatsapp.resolve(job.phone);
        if (!address) throw new Error('Número não encontrado no WhatsApp');
        if (this.whatsapp.beforeSend) await this.whatsapp.beforeSend(address, job);
        await this.flush();
        if (!await this.rpc('wa_can_send', { p_id: job.id, p_claim: job.claim_token })) {
          this.journal.finish(job.id, 'cancelled');
          return;
        }
        if (!this.whatsapp.ready) throw new Error('WhatsApp desconectou antes do envio');
        attempted = true;
        const sent = await this.whatsapp.send(address, job.body);
        if (!sent?.id?._serialized) throw new Error('WhatsApp não retornou confirmação');
        this.journal.finish(job.id, 'sent', sent.id._serialized);
      } catch (error) {
        this.journal.finish(job.id, attempted ? 'uncertain' : 'failed', null, String(error.message).slice(0, 500));
      }
      await this.flush();
    } finally { this.busy = false; }
  }
}
