import { handleInbound } from './agent.js';

// Processa uma resposta por vez (o OpenCode não suporta execuções em paralelo) e grava o rascunho.
// Modo sombra: nada é enviado pelo agente; a decisão final sempre é da equipe, no painel.
export class AgentWorker {
  constructor({ rpc, journal, kb, handle = handleInbound, notify = () => {} }) { Object.assign(this, { rpc, journal, kb, handle, notify }); this.busy = false; }
  async tick() {
    if (this.busy) return false;
    const row = this.journal.agentNext();
    if (!row) return false;
    this.busy = true;
    try {
      const task = JSON.parse(row.payload);
      if (!task.id || !task.phone) { this.journal.agentDone(row.id); return true; }
      // Várias mensagens seguidas do mesmo contato: responde só à última, com todas no histórico.
      if (this.journal.agentPending().some(r => r.rowid > row.rowid && JSON.parse(r.payload).phone === task.phone)) { this.journal.agentDone(row.id); return true; }
      const ctx = await this.rpc('wa_agent_context', { p_phone: task.phone });
      const history = (ctx.history || []).filter(h => h.texto !== task.body || h.de !== 'cliente');
      const lastSent = [...history].reverse().find(h => h.de === 'eu')?.texto || '';
      const result = await this.handle({ message: task.body, history, kb: this.kb, contact: ctx.contact || {}, blocked: ctx.blocked, mode: 'shadow', lastSent });
            // Reagenda para quando o primeiro provedor sair da espera (entre 15 s e 10 min); só na 5ª vez desiste e deixa vazio.
      if (result.unavailable && row.attempts < 4) { this.journal.agentFail(row.id, Math.max(15, Math.min(600, Math.round((result.retryInMs ?? [60, 180, 600, 600][row.attempts] * 1000) / 1000)))); return true; }
      if (result.final === 'ignore') { this.journal.agentDone(row.id); return true; }
      const decision = { final: result.final, why: result.why, rule: result.rule || null, intencao: result.intencao || null, urgencia: result.urgencia ?? null, temperatura: result.temperatura || null, model: result.model || null, issues: result.issues || [], block: Boolean(result.block), complaint: Boolean(result.complaint) };
      const id = await this.rpc('wa_draft_create', { p_inbound_id: task.id, p_phone: task.phone, p_inbound_body: task.body, p_suggestion: result.text || '', p_decision: decision });
      this.journal.agentDone(row.id);
      if (id) this.notify({ phone: task.phone, name: ctx.contact?.name, body: task.body, decision });
      return true;
    } catch (error) { this.journal.agentFail(row.id); throw error; }
    finally { this.busy = false; }
  }
}
