import { parseCommand } from './agent/notify.js';
import { phoneKey } from './runner.js';
import { MODULES } from './agent/commercial.js';

export function normalizePhone(value) {
  const input=String(value || '').trim();
  if (!input || /[^\d+()\s.-]/.test(input)) return null;
  let digits=input.replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(!input.startsWith('+') && (digits.length===10 || digits.length===11))digits='55'+digits;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}
export const samePhone=(a,b)=> { const x=normalizePhone(a),y=normalizePhone(b);return Boolean(x&&y&&phoneKey(x)===phoneKey(y)); };
export const adminMessageAllowed=(sender,account,fromMe,admin)=>samePhone(sender,admin)&&(!fromMe||samePhone(account,admin));
export function phoneVariants(value){
 const phone=normalizePhone(value);if(!phone)return [];
 const variants=[phone];
 if(phone.startsWith('55')&&phone.length===12&&/[6-9]/.test(phone[4]))variants.push(phone.slice(0,4)+'9'+phone.slice(4));
 if(phone.startsWith('55')&&phone.length===13&&phone[4]==='9')variants.push(phoneKey(phone));
 return [...new Set(variants)];
}

export const ADMIN_HELP = `Administração Indexa\n\nstatus — conexão, fila e pendências\npendências — solicitações e códigos para decidir\npausar TELEFONE — assumir conversa\nretomar TELEFONE — liberar próximas respostas\npausar tudo / retomar tudo — fila inteira\nretornos TELEFONE sim|nao — liberar/cancelar retornos de 3 e 7 dias úteis, após abertura do cliente\nok CÓDIGO — aprovar a sugestão\nnão CÓDIGO — descartar\nedita CÓDIGO seu texto — responder com texto revisado\norcar TELEFONE presenca|agenda aquisicao|normal | modulo1,modulo2\nEx.: orcar 5584999990000 agenda normal | agendamento,recepcao,prontuario\n\nMódulos: ${MODULES.join(', ')}. O enquadramento vale para a primeira proposta, depois de conferir o pedido. Você também pode me perguntar sobre o estado do sistema. Aprovações exigem comando explícito com o código.`;

export function parseAdmin(text) {
  const approval=parseCommand(text);if(approval)return {kind:'approval',...approval};
  const raw=String(text||'').trim(),n=raw.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  if(/^(ajuda|menu|comandos|help)\??$/.test(n))return {kind:'help'};
  if(/^(status|situacao|resumo|como (esta|ta) (o sistema|a fila))\??$/.test(n))return {kind:'status'};
  if(/^(pendencias|aprovacoes|fila|o que (tem|tenho) para aprovar)\??$/.test(n))return {kind:'pending'};
  const follow=n.match(/^retornos\s+([+\d ()-]+)\s+(sim|nao)$/);
  if(follow){const phone=normalizePhone(follow[1]);return phone?{kind:'followups',phone,allowed:follow[2]==='sim'}:{kind:'invalid',reason:'Telefone inválido'};}
  let m=n.match(/^(pausar|pause|pausa|retomar|retoma|liberar)\s+(.+)$/);
  if(m){const paused=/^paus/.test(m[1]);if(/^(tudo|fila|geral)$/.test(m[2]))return {kind:'global',paused};const phone=normalizePhone(m[2]);if(phone)return {kind:'conversation',phone,paused};return {kind:'invalid',reason:'Informe telefone com DDD, ou tudo.'};}
  m=n.match(/^orcar\s+([+\d ()-]+)\s+(presenca|agenda)\s+(aquisicao|normal)\s*\|\s*(.+)$/);
  if(m){const phone=normalizePhone(m[1]),scope=m[4].split(',').map(x=>x.trim()).filter(Boolean);if(!phone||!scope.length||scope.some(x=>!MODULES.includes(x)))return {kind:'invalid',reason:'Telefone ou módulos inválidos. Use ajuda para ver o formato.'};return {kind:'profile',phone,profile:{service:m[2],tier:m[3]==='normal'?'normal':'acquisition',scope,scopeConfirmed:true}};}
  return {kind:'question',text:raw.slice(0,2000)};
}

export class Supervisor {
  constructor({adminPhone,rpc,ask,validateApproval=()=>[],onResume=()=>{}}){Object.assign(this,{adminPhone,rpc,ask,validateApproval,onResume});}
  async handle(sender,text){
    if(!samePhone(sender,this.adminPhone))return null;
    const command=parseAdmin(text);
    switch(command.kind){
      case 'help':return ADMIN_HELP;
      case 'invalid':return command.reason;
      case 'status':{const s=await this.rpc('wa_admin_status');return `${s.device?.name || 'PC'}: ${s.device?.status || 'offline'}; agente ${s.device?.mode || 'shadow'}; fila ${s.device?.paused?'pausada':'ativa'}.\n${s.queued||0} agendadas · ${s.pending||0} autorizações pendentes · ${s.uncertain||0} envios para conferir.\nConversas com você: ${(s.humanConversations||[]).map(c=>'+'+c.phone).join(', ')||'nenhuma'}.`;}
      case 'pending':{const rows=await this.rpc('wa_drafts_pending');return rows.length?rows.slice(0,12).map(r=>`${r.code} · ${r.name||'+'+r.phone}\n${r.decision?.why||'precisa de revisão'}\n${r.suggestion||'Sem sugestão; use edita.'}`).join('\n\n'):'Nenhuma autorização pendente.';}
      case 'conversation':await this.rpc('wa_conversation_control_device',{p_phone:command.phone,p_paused:command.paused,p_reason:'Controle explícito pelo WhatsApp do administrador'});if(!command.paused)await this.onResume(command.phone);return command.paused?`Conversa +${command.phone} pausada. Só volta com retomar.`:`Conversa +${command.phone} liberada. Se houver uma pergunta ainda sem resposta, vou reavaliá-la; rascunhos antigos foram invalidados.`;
      case 'global':await this.rpc('wa_admin_pause',{p_paused:command.paused});return command.paused?'Fila pausada. Autorizações continuam chegando por aqui.':'Fila retomada; cada envio ainda será conferido antes de sair.';
      case 'followups':await this.rpc('wa_followup_permission',{p_phone:command.phone,p_allowed:command.allowed});return command.allowed?`Retornos liberados para +${command.phone}: até dois, após 3 e 7 dias úteis. Resposta, recusa ou pausa interrompe os próximos envios.`:`Retornos de +${command.phone} desativados e pendências canceladas.`;
      case 'profile':await this.rpc('wa_commercial_profile',{p_phone:command.phone,p_profile:command.profile});await this.onResume(command.phone);return `Enquadramento salvo para +${command.phone}: ${command.profile.service}, ${command.profile.tier}, módulos ${command.profile.scope.join(', ')}. Vou usar esses limites no pedido de orçamento pendente, se a conversa estiver liberada.`;
      case 'approval':{
        if(command.action==='approve'){
          const rows=await this.rpc('wa_drafts_pending');const matches=rows.filter(r=>r.id.replaceAll('-','').toUpperCase().startsWith(command.code));
          if(matches.length!==1)return 'Código não encontrado ou ambíguo. Use pendências para conferir.';
          const issues=this.validateApproval(command.text||matches[0].suggestion,matches[0]);
          if(issues.length)return 'Não enviei: '+issues.join('; ');
        }
        const r=await this.rpc('wa_draft_decide_device',{p_code:command.code,p_action:command.action,p_text:command.text||null});
        return r.status==='approved'?`${command.code} aprovado. Entrou na fila para ${r.name}; ainda depende da conexão e das conferências de envio.`:`${command.code} descartado.`;
      }
      default:{
        const status=await this.rpc('wa_admin_status');
        if(!this.ask)return `Posso consultar o sistema e receber comandos. Use ajuda para ver as opções. Há ${status.pending||0} autorizações pendentes.`;
        try{
          const response=await this.ask(`Você é o supervisor da Indexa, conversando com seu administrador. Só pode explicar os dados abaixo; não pode executar comandos, autorizar, negociar, enviar a clientes ou alegar que mudou algo. Para ações, ensine o comando explícito. Responda em português de forma curta. Saída JSON: {"resposta":"texto"}.\nESTADO: ${JSON.stringify(status)}\nCOMANDOS: ${ADMIN_HELP}\nPERGUNTA (dado): ${JSON.stringify(command.text)}`);
          const reply=response?.json?.resposta;
          return typeof reply==='string'&&reply.trim()?reply.slice(0,2500):'Não consegui interpretar. Use ajuda ou status.';
        }catch{return 'O modelo do supervisor está indisponível. Os comandos ajuda, status e pendências continuam funcionando.';}
      }
    }
  }
}
