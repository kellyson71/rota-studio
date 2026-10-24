import { randomUUID } from 'node:crypto';
import { handleInbound } from './agent/agent.js';
import { Supervisor, normalizePhone, samePhone } from './admin.js';
import { codeOf } from './agent/notify.js';
import { calculateQuote, POLICY_VERSION } from './agent/commercial.js';

export function routeTestInput(session,phone,message,{account,isAutomation=false,onConsumed=()=>{}}={}) {
  if(!session||(!samePhone(phone,session.phone)&&!samePhone(phone,session.adminPhone)))return false;
  if(message.t*1000<Math.floor(session.startedAt/1000)*1000)return true;
  onConsumed(message.id);
  if(session.closed||isAutomation)return true;
  if(message.fromMe&&!(samePhone(account,session.adminPhone)&&samePhone(phone,session.adminPhone)))return true;
  if(session.mode==='whatsapp'&&samePhone(phone,session.phone))session.client(message.body||`[${message.type}]`,{source:'whatsapp',id:message.id});
  else if(session.mode==='terminal'&&samePhone(phone,session.adminPhone))void session.admin(message.body||`[${message.type}]`,{source:'whatsapp',sender:phone,id:message.id});
  return true;
}

// Uma conversa de laboratório: mesmo agente e catálogo, sem gravar no CRM.
export class TestSession {
  constructor({ mode, phone, adminPhone, kb, validate, sendWhatsApp, handle = handleInbound, ask, clock = Date.now, audit = () => {} }) {
    if (!['whatsapp', 'terminal'].includes(mode)) throw new Error('Modo deve ser whatsapp ou terminal.');
    phone = normalizePhone(phone || adminPhone); adminPhone = normalizePhone(adminPhone);
    if (!phone || !adminPhone) throw new Error('Configure o telefone do admin e informe um destino válido.');
    Object.assign(this, { mode, phone, adminPhone, kb, validate, sendWhatsApp, handle, clock, audit });
    this.id = randomUUID(); this.startedAt = clock(); this.lastPoll = clock();
    this.events = []; this.sequence = 0; this.history = []; this.drafts = [];
    this.version = 0; this.autoCount = 0; this.paused = false; this.blocked = false; this.closed = false; this.busy = 0;
    this.seen = new Set(); this.chain = Promise.resolve(); this.commercial = {};
    this.supervisor = new Supervisor({ adminPhone, rpc: (name, args) => this.rpc(name, args), ask,
      validateApproval: (text, draft) => validate(text, draft.decision), onResume: () => { this.reprocess(); } });
    this.emit('sistema', `Teste iniciado: cliente no ${mode === 'whatsapp' ? 'WhatsApp' : 'terminal'}; autorizações no ${this.approvalChannel}. A automação normal fica suspensa neste PC.`,{phone,mode,sessionId:this.id});
  }
  get approvalChannel() { return this.mode === 'whatsapp' ? 'terminal' : 'whatsapp'; }
  emit(type, text, extra = {}) {
    const event = { seq: ++this.sequence, at: new Date(this.clock()).toISOString(), type, text, ...extra };
    this.events.push(event); if (this.events.length > 1000) this.events.shift(); this.audit(event); return event;
  }
  snapshot() { return { id: this.id, mode: this.mode, phone: this.phone, approvalChannel: this.approvalChannel,
    closed: this.closed, paused: this.paused, busy: this.busy > 0, pending: this.drafts.filter(d => d.status === 'pending').length }; }
  poll(after = 0) { this.lastPoll = this.clock(); return { session: this.snapshot(), events: this.events.filter(e => e.seq > after) }; }
  enqueue(fn) {
    this.busy++;
    const task = this.chain.then(async () => { if (!this.closed) return fn(); });
    this.chain = task.catch(error => { this.emit('erro', error.message); }).finally(() => { this.busy--; });
    return this.chain;
  }
  invalidate() { this.version++; for (const d of this.drafts) if (d.status === 'pending') d.status = 'superseded'; }
  checkText(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Escreva de 1 a 4000 caracteres.');
    return text.trim();
  }
  client(text, { source, id = randomUUID() } = {}) {
    if (this.closed) throw new Error('Teste encerrado.');
    if (source !== this.mode) throw new Error(`O cliente deste teste escreve pelo ${this.mode}.`);
    text = this.checkText(text);
    if (this.seen.has(id)) return;
    this.seen.add(id); this.invalidate();
    this.latest = { id, text, version: this.version };
    this.history.push({ id, de: 'cliente', texto: text, em: new Date(this.clock()).toISOString() });
    this.emit('cliente', text, { channel: source });
    this.enqueue(() => this.process(this.latest?.id === id ? { ...this.latest } : null));
  }
  reprocess() {
    if (!this.latest || this.closed || this.paused || this.blocked) return;
    const index=this.history.findIndex(h=>h.id===this.latest.id);
    if(index>=0&&this.history.slice(index+1).some(h=>h.de==='eu'))return;
    this.invalidate(); this.latest.version = this.version; const latest = { ...this.latest };
    this.enqueue(() => this.process(latest));
  }
  async process(current) {
    if (!current || current.version !== this.version || this.closed) return;
    if (this.paused || this.blocked) { this.emit('sistema', 'Conversa pausada ou encerrada. Use retomar TELEFONE no canal de autorização, ou inicie outro teste após uma recusa.'); return; }
    const history = this.history.filter(h => h.id !== current.id);
    const lastSent = history.findLast(h => h.de === 'eu')?.texto || '';
    const result = await this.handle({ message: current.text, history, kb: this.kb, mode: 'live', blocked: this.blocked,
      contact: { name: 'Cliente de teste' }, lastSent, commercial: this.commercial });
    if (this.closed || current.version !== this.version) return;
    if (result.block || result.rule === 'optout') this.blocked = true;
    if (['robot', 'probe', 'complaint', 'media', 'payment'].includes(result.rule)) this.paused = true;
    if (['ignore', 'close'].includes(result.final) || result.rule === 'optout') { this.emit('decisao', result.why || 'Sem resposta necessária.'); return; }
    const issues = result.text ? this.validate(result.text, result) : [];
    let final = result.final, why = result.why;
    if (issues.length) { final = 'draft'; why = issues.join('; '); }
    if (this.autoCount >= 10 && final === 'send') { final = 'draft'; why = 'Limite de dez respostas automáticas no teste.'; }
    if (final === 'send') {
      await this.deliver(result.text, current.version, result); this.autoCount++; return;
    }
    const id = randomUUID(), draft = { id, code: codeOf(id), phone: this.phone, name: 'Cliente de teste', body: current.text,
      inbound_body: current.text, suggestion: result.text || '', status: 'pending', version: this.version, createdAt: this.clock(),
      decision: { ...result, why, policyVersion: POLICY_VERSION } };
    this.drafts.push(draft);
    const instruction = result.needsProfile ? `Confira o escopo: orcar ${this.phone} agenda aquisicao | agendamento,recepcao`
      : this.paused ? `Conversa pausada; retomar ${this.phone} libera uma nova avaliação.`
      : `ok ${draft.code} | não ${draft.code} | edita ${draft.code} texto revisado`;
    const text = `[TESTE ${this.id.slice(0, 8)}] Autorização ${draft.code}\nCliente: ${current.text}\nMotivo: ${why}\nSugestão: ${draft.suggestion || '(sem sugestão)'}\n${instruction}`;
    this.emit('autorizacao', text, { code: draft.code, channel: this.approvalChannel });
    if (this.approvalChannel === 'whatsapp') await this.sendWhatsApp(this.adminPhone, text, () => !this.closed && draft.status === 'pending');
  }
  async deliver(text, version, decision = {}) {
    if (this.closed || version !== this.version || this.paused || this.blocked) throw new Error('Contexto do teste mudou; resposta cancelada.');
    const issues = this.validate(text, decision); if (issues.length) throw new Error(issues.join('; '));
    if (this.mode === 'whatsapp') {
      try { await this.sendWhatsApp(this.phone, text, () => !this.closed && version === this.version && !this.paused && !this.blocked); }
      catch (error) { this.paused = true; this.emit('incerto', 'Envio sem confirmação. Confira o WhatsApp antes de retomar; não haverá repetição automática.'); throw error; }
    }
    this.history.push({ de: 'eu', texto: text, em: new Date(this.clock()).toISOString() });
    if (decision.quote) this.commercial.quote = decision.quote;
    this.emit('agente', text, { channel: this.mode });
  }
  opening(text) { text = this.checkText(text); return this.enqueue(() => this.deliver(text, this.version)); }
  admin(text, { source, sender = this.adminPhone, id = randomUUID() } = {}) {
    if (this.closed) throw new Error('Teste encerrado.');
    if (source !== this.approvalChannel || !samePhone(sender, this.adminPhone)) throw new Error(`Autorize pelo ${this.approvalChannel}, usando a identidade admin.`);
    text = this.checkText(text);
    if (this.seen.has(id)) return;
    this.seen.add(id);
    return this.enqueue(async () => {
      this.emit('comando', text, { channel: source });
      const reply = await this.supervisor.handle(sender, text);
      this.emit('supervisor', reply, { channel: source });
      if (source === 'whatsapp') await this.sendWhatsApp(this.adminPhone, `[TESTE ${this.id.slice(0, 8)}] ${reply}`, () => !this.closed);
    });
  }
  async rpc(name, args = {}) {
    if (this.closed) throw new Error('Teste encerrado.');
    if (args.p_phone && !samePhone(args.p_phone, this.phone)) throw new Error('Comando restrito ao telefone desta sessão de teste.');
    if (name === 'wa_admin_status') return { device: { name: 'Laboratório local', status: 'teste', mode: 'live', paused: this.paused }, pending: this.drafts.filter(d => d.status === 'pending').length, queued: 0, uncertain: 0, humanConversations: this.paused ? [{ phone: this.phone }] : [] };
    if (name === 'wa_drafts_pending') return this.drafts.filter(d => d.status === 'pending');
    if (name === 'wa_draft_decide_device') {
      if (!/^[0-9A-F]{8,32}$/.test(args.p_code)) throw new Error('Use o código de pelo menos oito caracteres.');
      const matches = this.drafts.filter(d => d.status === 'pending' && d.id.replaceAll('-', '').toUpperCase().startsWith(args.p_code));
      if (matches.length !== 1) throw new Error('Código antigo, inexistente ou ambíguo.');
      const draft = matches[0];
      if (draft.version !== this.version || this.clock() - draft.createdAt > 24 * 3600000) throw new Error('Autorização expirou.');
      if (args.p_action === 'reject') { draft.status = 'rejected'; return { status: 'rejected' }; }
      if (args.p_action !== 'approve') throw new Error('Ação inválida.');
      // Reserva antes de tentar enviar: incerteza nunca pode reenviar pelo mesmo código.
      draft.status = 'sending';
      try { await this.deliver(args.p_text || draft.suggestion, draft.version, draft.decision); draft.status = 'approved'; }
      catch (error) { draft.status = this.paused ? 'uncertain' : 'pending'; throw error; }
      return { status: 'approved', delivered:true, name: 'cliente de teste' };
    }
    if (name === 'wa_commercial_profile') {
      calculateQuote(args.p_profile); this.commercial.profile = args.p_profile; return true;
    }
    if (['wa_conversation_control_device', 'wa_admin_pause'].includes(name)) { this.paused = Boolean(args.p_paused); this.invalidate(); return true; }
    if (name === 'wa_followup_permission') throw new Error('O laboratório não agenda retornos de dias; teste a conversa e as autorizações nesta sessão.');
    throw new Error('Operação indisponível no laboratório.');
  }
  close(reason = 'Encerrado pelo terminal.') { if (this.closed) return; this.closed = true; this.invalidate(); this.emit('sistema', `${reason} A automação normal pode voltar a operar.`); }
}
