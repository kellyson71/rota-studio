import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestSession, routeTestInput } from '../src/test-session.js';
import { validateText } from '../src/agent/validator.js';
import { handleInbound } from '../src/agent/agent.js';
import { calculateQuote, renderQuote, COMMERCIAL_REPLIES } from '../src/agent/commercial.js';
import { parseArgs,openingFor,DEFAULT_OPENING } from '../src/test-terminal.js';
import { Journal } from '../src/journal.js';

const admin='558499990000',other='5584888882222';
const kb=JSON.parse(readFileSync(new URL('../src/agent/kb.json',import.meta.url)));
function fixture(options={}) {
 const sent=[];
 const validate=(text,decision={})=>{
  let approvedText=COMMERCIAL_REPLIES.includes(text)?text:null;
  if(decision.quote){const rendered=renderQuote(calculateQuote(decision.quote));if(text!==rendered)return ['proposta alterada'];approvedText=rendered;}
  return validateText(text,{kb,approvedText});
 };
 const session=new TestSession({mode:'whatsapp',adminPhone:admin,kb,validate,
  handle:async()=>({final:'draft',text:'Qual o tamanho da equipe?',why:'Confira antes de responder.'}),
  sendWhatsApp:async(phone,text,guard)=>{assert.equal(guard(),true);sent.push({phone,text});},...options});
 return {s:session,sent};
}
async function idle(session){while(session.busy)await session.chain;}
test('cliente WhatsApp usa admin como padrão, mas só terminal pode aprovar',async()=>{
 const {s,sent}=fixture();assert.equal(s.phone,admin);
 s.client('Quero conhecer o sistema.',{source:'whatsapp'});await idle(s);
 assert.equal(sent.length,0);const code=s.drafts[0].code;
 assert.throws(()=>s.admin('ok '+code,{source:'whatsapp',sender:admin}),/terminal/);
 await s.admin('ok '+code,{source:'terminal'});
 assert.equal(sent.length,1);assert.equal(sent[0].phone,admin);assert.equal(s.drafts[0].status,'approved');
 await s.admin('ok '+code,{source:'terminal'});assert.equal(sent.length,1);
});
test('cliente terminal recebe agente no terminal e aprovação somente no WhatsApp admin',async()=>{
 const {s,sent}=fixture({mode:'terminal',phone:other});
 s.client('Quero conhecer o sistema.',{source:'terminal'});await idle(s);
 assert.equal(sent.length,1);assert.equal(sent[0].phone,admin);assert.match(sent[0].text,/Autorização/);
 const code=s.drafts[0].code;
 assert.throws(()=>s.admin('ok '+code,{source:'terminal'}),/whatsapp/);
 assert.throws(()=>s.admin('ok '+code,{source:'whatsapp',sender:other}),/identidade admin/);
 await s.admin('ok '+code,{source:'whatsapp',sender:admin});
 assert.equal(s.events.filter(e=>e.type==='agente').length,1);
 assert.equal(sent.length,2);assert.equal(sent.some(m=>m.phone===other),false);
});
test('admin no papel de cliente não aprova escrevendo o código no WhatsApp',async()=>{
 const {s,sent}=fixture();s.client('Quero conhecer',{source:'whatsapp'});await idle(s);
 const draft=s.drafts[0];routeTestInput(s,admin,{id:'client-code',body:'ok '+draft.code,t:Date.now()/1000,fromMe:false},{account:other});await idle(s);
 assert.equal(draft.status,'superseded');assert.equal(sent.length,0);
 assert.equal(s.events.some(e=>e.type==='comando'),false);
});
test('nova mensagem invalida aprovação e comandos financeiros mantêm validações',async()=>{
 const {s,sent}=fixture();s.client('Primeira',{source:'whatsapp'});await idle(s);const old=s.drafts[0].code;
 s.client('Agora quero outra coisa',{source:'whatsapp'});await idle(s);
 await s.admin('ok '+old,{source:'terminal'});assert.equal(sent.length,0);
 await s.admin('edita '+s.drafts[1].code+' Entrego amanhã por novecentos reais.',{source:'terminal'});
 assert.equal(sent.length,0);assert.ok(s.events.some(e=>e.type==='supervisor'&&/Não enviei/.test(e.text)));
});
test('cliente novo durante geração e encerramento impedem saída atrasada',async()=>{
 let release;const wait=new Promise(r=>{release=r;});let calls=0;
 const {s,sent}=fixture({handle:async()=>{calls++;if(calls===1)await wait;return {final:'send',text:'Posso explicar o painel.'};}});
 s.client('Primeira',{source:'whatsapp'});await new Promise(r=>setImmediate(r));
 s.client('Segunda',{source:'whatsapp'});release();await idle(s);
 assert.equal(sent.length,1);assert.equal(calls,2);
 let done;const {s:closed,sent:outputs}=fixture({handle:async()=>{await new Promise(r=>{done=r;});return {final:'send',text:'Posso explicar.'};}});
 closed.client('Explique',{source:'whatsapp'});await new Promise(r=>setImmediate(r));closed.close();done();await idle(closed);assert.equal(outputs.length,0);
});
test('falha de confirmação pausa teste e código não repete envio incerto',async()=>{
 let sends=0;const {s}=fixture({sendWhatsApp:async()=>{sends++;throw Error('sem confirmação');}});
 s.client('Quero saber mais',{source:'whatsapp'});await idle(s);const code=s.drafts[0].code;
 await s.admin('ok '+code,{source:'terminal'});await s.admin('ok '+code,{source:'terminal'});
 assert.equal(sends,1);assert.equal(s.paused,true);assert.equal(s.drafts[0].status,'uncertain');
});
test('roteamento diferencia cliente admin, console admin e próprias saídas',async()=>{
 const {s}=fixture();const m={id:'in',body:'Quero um site',t:Date.now()/1000,fromMe:true};
 assert.equal(routeTestInput(s,admin,m,{account:admin}),true);await idle(s);assert.equal(s.history.length,1);
 routeTestInput(s,admin,{...m,id:'echo'},{account:admin,isAutomation:true});assert.equal(s.history.length,1);
 routeTestInput(s,admin,{...m,id:'outro'},{account:other});assert.equal(s.history.length,1);
 assert.equal(routeTestInput(s,other,m,{account:admin}),false);
 const {s:inverse}=fixture({mode:'terminal'});
 routeTestInput(inverse,admin,{...m,id:'cmd',body:'status'},{account:admin});await idle(inverse);
 assert.equal(inverse.history.length,0);assert.ok(inverse.events.some(e=>e.type==='supervisor'));
});
test('cotação usa mesmo motor; perfil confirmado destrava pergunta sem tocar no CRM',async()=>{
 const {s,sent}=fixture({handle:args=>handleInbound({...args,llm:async()=>{throw Error('não deveria chamar modelo');}})});
 s.client('Quanto custa o sistema de agenda?',{source:'whatsapp'});await idle(s);
 assert.equal(s.drafts[0].decision.needsProfile,true);
 await s.admin(`orcar ${admin} agenda normal | agendamento,recepcao`,{source:'terminal'});await idle(s);
 assert.equal(sent.length,1);assert.match(sent[0].text,/2\.000,00/);assert.equal(s.commercial.quote.baseCents,200000);
 assert.equal(s.drafts[0].status,'superseded');
});
test('pausa, retomada, descadastro e telefone fora da sessão respeitam fronteiras',async()=>{
 const {s}=fixture();await s.admin('pausar '+admin,{source:'terminal'});
 s.client('Quero conhecer',{source:'whatsapp'});await idle(s);assert.equal(s.drafts.length,0);
 await s.admin('retomar '+admin,{source:'terminal'});await idle(s);assert.equal(s.drafts.length,1);
 await s.admin('pausar '+other,{source:'terminal'});assert.equal(s.paused,false);assert.ok(s.events.some(e=>/restrito/.test(e.text)));
 const {s:optout}=fixture({handle:handleInbound});optout.client('Não me envie mais mensagens',{source:'whatsapp'});await idle(optout);assert.equal(optout.blocked,true);
});
test('polling renova sessão e comandos da CLI não aceitam opções ambíguas',()=>{
 let now=100000;const {s}=fixture({clock:()=>now});now+=15000;s.poll();assert.equal(s.lastPoll,now);
 assert.deepEqual(parseArgs(['--modo','terminal','--numero',admin]),{mode:'terminal',phone:admin});
 assert.throws(()=>parseArgs(['--modo','invalido']));assert.throws(()=>parseArgs(['--numero']));
 assert.throws(()=>fixture({mode:'errado'}));
});
test('abertura inicia modo WhatsApp e pode ser personalizada ou desativada',()=>{
 assert.equal(openingFor(parseArgs(['--modo','whatsapp'])),DEFAULT_OPENING);
 assert.equal(openingFor(parseArgs(['--modo','whatsapp','--abertura','Oi, tudo bem?'])),'Oi, tudo bem?');
 assert.equal(openingFor(parseArgs(['--modo','whatsapp','--sem-abertura'])),null);
 assert.equal(openingFor(parseArgs(['--modo','terminal'])),null);
 assert.throws(()=>parseArgs(['--sem-abertura','--abertura','Oi']));
 assert.throws(()=>parseArgs(['--modo','terminal','--abertura','Oi']));
});
test('entradas de teste são lembradas após reinício, sem consumir histórico anterior',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'indexa-test-inputs-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'journal.sqlite'),journal=new Journal(file);const {s}=fixture();
 const past={id:'old',t:s.startedAt/1000-5,body:'Antes do teste',fromMe:false};
 const fresh={...past,id:'test-in',t:s.startedAt/1000+1,body:'Durante o teste'};
 const options={account:admin,onConsumed:id=>journal.testInputRemember(id)};
 routeTestInput(s,admin,past,options);assert.equal(journal.testInputSeen('old'),false);
 routeTestInput(s,admin,fresh,options);await idle(s);s.close();assert.equal(journal.testInputSeen('test-in'),true);
 journal.close();
 const reopened=new Journal(file);assert.equal(reopened.testInputSeen('test-in'),true);assert.equal(reopened.testInputSeen('old'),false);reopened.close();
});
