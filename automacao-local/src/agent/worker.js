import { handleInbound } from './agent.js';
import { inBusinessHours } from './rules.js';
import { validateText } from './validator.js';
import { POLICY_VERSION } from './commercial.js';
import { phoneKey } from '../runner.js';

// Processa uma resposta por vez (o OpenCode não suporta execuções em paralelo).
// Modo "live": respostas seguras saem sozinhas; o resto vira rascunho e chega ao dono.
// Modo "shadow": tudo vira rascunho. O descadastro e o encerramento não pedem nada ao dono.
export class AgentWorker {
  constructor({ rpc, journal, kb, handle = handleInbound, notify = () => {}, onAuto = () => {}, mode = 'shadow', autoLimit = 10, inHours = inBusinessHours, debounceMs = 0,beforeProcess=async()=>{},notifyFailure=()=>{} }) {
    Object.assign(this, { rpc, journal, kb, handle, notify, onAuto, mode, autoLimit, inHours, debounceMs,beforeProcess,notifyFailure });
    this.busy = false;
  }
  async tick() {
    if (this.busy) return false;
    const row = this.journal.agentNext();
    if (!row) return false;
    this.busy = true;
    try {
      const task = JSON.parse(row.payload);
      if (!task.id || !task.phone) { this.journal.agentDone(row.id); return true; }
      // Várias mensagens seguidas do mesmo contato: responde só à última, com todas no histórico.
      if (this.journal.agentPending().some(r => r.rowid > row.rowid && phoneKey(JSON.parse(r.payload).phone) === phoneKey(task.phone))) { this.journal.agentDone(row.id); return true; }
      if (Date.now()-row.queued_at < this.debounceMs) return false;
      await this.beforeProcess();
      let ctx = await this.rpc('wa_agent_context', { p_phone: task.phone });
      if (ctx.owner==='human' || ctx.blocked || (ctx.latestInboundId && ctx.latestInboundId!==task.id)) { this.journal.agentDone(row.id); return true; }
      const history = [...(ctx.history || [])];
      const currentIndex=history.findLastIndex(h=>h.de==='cliente'&&(h.id===task.id || (!h.id && h.texto===task.body)));
      const receivedAt=currentIndex>=0?Date.parse(history[currentIndex].em):NaN;
      if(currentIndex>=0)history.splice(currentIndex,1);
      const lastSent = [...history].reverse().find(h => h.de === 'eu')?.texto || '';
      const result = await this.handle({ message: task.body, history, kb: this.kb, contact: ctx.contact || {}, blocked: ctx.blocked, mode: this.mode, lastSent,commercial:ctx.commercial || {} });
      // Reagenda para quando o primeiro provedor sair da espera (entre 15 s e 10 min); só na 5ª vez desiste e deixa vazio.
      if (result.unavailable && row.attempts < 4) { this.journal.agentFail(row.id, Math.max(15, Math.min(600, Math.round((result.retryInMs ?? [60, 180, 600, 600][row.attempts] * 1000) / 1000)))); return true; }
      // Ignorado, encerrado pelo cliente ou descadastro (o bloqueio já foi feito ao registrar a resposta): nada a enviar.
      if (result.final === 'ignore' || result.final === 'close' || result.rule === 'optout') { this.journal.agentDone(row.id); return true; }

      const fresh=await this.rpc('wa_agent_context',{p_phone:task.phone});
      if(fresh.owner==='human'||fresh.blocked||fresh.version!==ctx.version||(fresh.latestInboundId&&fresh.latestInboundId!==task.id)) { this.journal.agentDone(row.id);return true; }
      if(['robot','probe','complaint','media','payment'].includes(result.rule)) {
        if(result.block)await this.rpc('wa_block_device',{p_phone:task.phone,p_reason:result.why});
        await this.rpc('wa_conversation_control_device',{p_phone:task.phone,p_paused:true,p_reason:result.why});
        ctx=await this.rpc('wa_agent_context',{p_phone:task.phone});
      }

      let { final, why } = result;
      if (final === 'send' && this.mode !== 'live') { final = 'draft'; why = 'modo sombra'; }
      else if(final==='send'&&Number.isFinite(receivedAt)&&Date.now()-receivedAt>24*3600000){final='draft';why='mensagem recebida há mais de 24 horas; revise antes de retomar';}
      else if (final === 'send' && !this.inHours()) { final = 'draft'; why = 'fora do horário de atendimento'; }
      else if (final === 'send' && (ctx.autoCount || 0) >= this.autoLimit) { final = 'draft'; why = `já foram ${this.autoLimit} respostas automáticas para este contato; agora é com você`; }

      const issues=result.text ? validateText(result.text,{kb:this.kb,lastSent,approvedText:result.deterministic?result.text:null}) : [];
      if(issues.length) { final='draft';why=issues.join('; '); }
      const decision = { final, why, needsProfile:Boolean(result.needsProfile),contextVersion:ctx.version ?? 0,policyVersion:POLICY_VERSION,schemaValidated:!issues.length && !(result.issues || []).length,
        quote:result.quote || null,rule: result.rule || null, intencao: result.intencao || null, urgencia: result.urgencia ?? null, temperatura: result.temperatura || null, model: result.model || null, issues: [...(result.issues || []),...issues], block: Boolean(result.block), complaint: Boolean(result.complaint) };
      const id = await this.rpc('wa_draft_create', { p_inbound_id: task.id, p_phone: task.phone, p_inbound_body: task.body, p_suggestion: result.text || '', p_decision: decision });
      this.journal.agentDone(row.id);
      if (!id) return true; // mesma mensagem já tinha rascunho
      const draft = { id, phone: task.phone, name: ctx.contact?.name, body: task.body, suggestion: result.text || '', decision };
      if (final === 'send') {
        try { await this.rpc('wa_draft_autosend', { p_id: id }); this.onAuto(draft); return true; }
        catch (error) { draft.decision = { ...decision, final: 'draft', why: `envio automático não foi possível: ${error.message}` }; }
      }
      this.notify(draft);
      return true;
    } catch (error) { this.journal.agentFail(row.id);if(row.attempts>=4)this.notifyFailure({task:JSON.parse(row.payload),error});throw error; }
    finally { this.busy = false; }
  }
}
