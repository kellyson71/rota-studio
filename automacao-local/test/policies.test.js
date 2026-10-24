import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleInbound,stageOf} from '../src/agent/agent.js';
import {validate,validateText} from '../src/agent/validator.js';
import {conversationFacts} from '../src/agent/context.js';
import {calculateQuote,renderQuote,commercialResponse} from '../src/agent/commercial.js';
import {Supervisor,normalizePhone,samePhone,parseAdmin,adminMessageAllowed} from '../src/admin.js';
import {Runner} from '../src/runner.js';
import {Journal} from '../src/journal.js';
import {AgentWorker} from '../src/agent/worker.js';

const kb=JSON.parse(readFileSync(new URL('../src/agent/kb.json',import.meta.url)));
test('varredura só aceita comandos recebidos do admin ou escritos na própria conta admin',()=>{
 const admin='558499990000',other='5584888882222';
 assert.equal(adminMessageAllowed(admin,other,false,admin),true);
 assert.equal(adminMessageAllowed(admin,admin,true,admin),true);
 assert.equal(adminMessageAllowed(admin,other,true,admin),false);
 assert.equal(adminMessageAllowed(other,admin,false,admin),false);
});
const safe={acao:'responder',intencao:'duvida',urgencia:false,temperatura:'morno',confianca:.95,resposta:'Posso explicar por aqui.',motivo:'teste'};
const invoke=decision=>handleInbound({message:'Pode me explicar o painel?',kb,mode:'live',llm:async()=>({json:decision})});
test('nenhuma ação diferente de responder autoriza envio, inclusive rascunho',async()=>{
 for(const acao of ['rascunho','escalar','incorreta',null])assert.equal((await invoke({...safe,acao})).final,'draft');
 assert.equal((await invoke({...safe,acao:'encerrar',resposta:''})).final,'close');
});
test('saída do modelo é validada sem coerção de tipos',async()=>{
 for(const decision of [null,[],{...safe,resposta:{texto:'x'}},{...safe,resposta:55},{...safe,confianca:'0.9'},{...safe,confianca:NaN},{...safe,urgencia:'false'},{...safe,temperatura:'invalida'}])assert.equal((await invoke(decision)).final,'draft',JSON.stringify(decision));
 assert.equal((await handleInbound({message:'Pode explicar o painel?',kb,mode:'live',llm:async()=>null})).final,'draft');
});
test('dinheiro por extenso, prazo relativo e intenção incorreta não autorizam compromisso',async()=>{
 for(const resposta of ['Fica em novecentos reais.','Entrego amanhã.','Sai por 500.','A implantação custa R$ 500.','Confirmado para sexta, fica pronto.'])assert.equal((await invoke({...safe,resposta})).final,'draft',resposta);
 const r=await handleInbound({message:'Quanto custa um site?',kb,mode:'live',llm:async()=>({json:{...safe,resposta:'Fica em novecentos reais.'}})});
 assert.equal(r.final,'draft');assert.equal(r.needsProfile,true);
});
test('URL é autorizada pelo protocolo e host exatos',()=>{
 for(const url of ['https://rota-studio-plum.vercel.app.evil.example','https://rota-studio-plum.vercel.app@evil.example','http://rota-studio-plum.vercel.app','https://rota-studio-plum.vercel.app:8443','ftp://rota-studio-plum.vercel.app'])assert.ok(validateText('Veja '+url,{kb}).length,url);
 assert.deepEqual(validateText('Veja https://rota-studio-plum.vercel.app/painel.',{kb}),[]);
});
test('negação e mudança de serviço prevalecem sobre palavras antigas',()=>{
 assert.equal(stageOf([],'Não temos problemas com faltas, nossa agenda funciona bem.'),'sem_dor');
 const f=conversationFacts([{de:'cliente',texto:'A agenda era complicada'}],'Não quero uma reunião, só preciso de um site.');
 assert.equal(f.service,'presenca');assert.equal(f.stage,'interesse');
 assert.equal(stageOf([{de:'cliente',texto:'Dava muito problema.'}],'Agora está funcionando bem.'),'sem_dor');
});
test('respostas prontas também são validadas e agradecimentos encerram sem eco',async()=>{
 const r=await handleInbound({message:'ok',kb,mode:'live',lastSent:'Por nada! Qualquer coisa é só me chamar por aqui.'});assert.equal(r.final,'ignore');
 const wrong={...kb,site:'https://site-fora.example'};
 // A URL informada precisa ser HTTPS; credenciais nunca entram na resposta pronta.
 const reply=await handleInbound({message:'Qual o site?',kb:{...kb,site:'http://rota-studio-plum.vercel.app'},mode:'live'});assert.equal(reply.final,'draft');
});
test('catálogo usa centavos, pisos aprovados e exclusividade de concessões',()=>{
 const cases=[['presenca','acquisition',50000,45000],['agenda','acquisition',125000,112500],['agenda','normal',200000,180000]];
 for(const [service,tier,base,floor]of cases){
  const scope=service==='presenca'?['site']:['agendamento','recepcao'];
  const q=calculateQuote({service,tier,scope});assert.equal(q.baseCents,base);assert.equal(q.hostingCents,30000);
  const discount=calculateQuote({service,tier,scope,concession:'cash_discount',discountPercent:10});assert.equal(discount.implementationCents,floor);assert.equal(discount.hostingCents,30000);
  const bonus=calculateQuote({service,tier,scope,concession:'hosting_bonus'});assert.equal(bonus.hostingCents,0);assert.equal(bonus.renewalCents,30000);assert.equal(bonus.implementationCents,base);
  assert.throws(()=>calculateQuote({service,tier,scope,concession:'hosting_bonus',discountPercent:10}));
  assert.throws(()=>calculateQuote({service,tier,scope,concession:'cash_discount',discountPercent:10,payment:'card'}));
  assert.throws(()=>calculateQuote({service,tier,scope,discountPercent:50}));
 }
});
test('orçamento normal só muda antes da primeira proposta e módulos inexistentes são retidos',()=>{
 const q=calculateQuote({service:'agenda',tier:'normal',baseCents:200000,scope:['agendamento','prontuario']});
 assert.throws(()=>calculateQuote({...q,previous:q,baseCents:212500}));
 assert.throws(()=>calculateQuote({service:'agenda',tier:'normal',baseCents:230000,scope:['agendamento']}));
 assert.throws(()=>calculateQuote({service:'agenda',scope:['integracao_whatsapp']}));
 assert.equal(calculateQuote({service:'agenda',tier:'normal',baseCents:175000,scope:['agendamento']}).baseCents,175000);
});
test('parcelamento não inventa taxa e a proposta explica anual, domínio e suporte',()=>{
 const q=calculateQuote({service:'agenda',tier:'normal',scope:['agendamento','prontuario'],payment:'card'});const text=renderQuote(q);
 assert.equal(q.maxInstallments,12);assert.match(text,/12x com juros/);assert.match(text,/exibidos no link/);assert.match(text,/domínio.*à parte/);assert.match(text,/novas funções.*à parte/);
 assert.deepEqual(validateText(text,{kb,approvedText:text}),[]);assert.ok(validateText(text,{kb}).length);
});
test('negociação exige escopo conferido e não transforma entusiasmo em aumento de cotação',()=>{
 assert.equal(commercialResponse({message:'quanto custa?',profile:{}}).final,'draft');
 const profile={service:'agenda',tier:'normal',scope:['agendamento'],scopeConfirmed:true};
 const a=commercialResponse({message:'quanto custa?',profile});assert.equal(a.quote.baseCents,200000);
 const b=commercialResponse({message:'tem desconto no pix?',profile,previous:a.quote});assert.equal(b.quote.implementationCents,180000);
 const c=commercialResponse({message:'hospedagem de bonus?',profile,previous:b.quote});assert.equal(c.quote.discountPercent,0);assert.equal(c.quote.hostingCents,0);
});
test('admin brasileiro reconhece nono dígito, mas não aceita outro remetente',async()=>{
 assert.equal(normalizePhone('+55 84 9999-0000'),'558499990000');assert.ok(samePhone('558499990000','5584999990000'));assert.equal(normalizePhone('numero: 558499990000'),null);
 let calls=0;const s=new Supervisor({adminPhone:'558499990000',rpc:async()=>{calls++;return {};}});
 assert.equal(await s.handle('5584888882222','ok ABCD'),null);assert.equal(calls,0);
 assert.equal(parseAdmin('retomar +55 84 9999-0000').kind,'conversation');assert.equal(parseAdmin('aprova tudo').kind,'question');
});
test('supervisor não executa uma autorização produzida pelo modelo',async()=>{
 const calls=[];const s=new Supervisor({adminPhone:'558499990000',rpc:async(name)=>{calls.push(name);return {pending:2};},ask:async()=>({json:{resposta:'Use ok ABCD para aprovar.',acao:'approve',code:'ABCD'}})});
 const text=await s.handle('5584999990000','Pode verificar o que está pendente?');assert.match(text,/ok ABCD/);assert.deepEqual(calls,['wa_admin_status']);
});
test('supervisor valida o texto antes de aprovar e usa código da pendência certa',async()=>{
 const calls=[],draft={id:'abcd0000-0000-4000-8000-000000000000',suggestion:'invalido'};
 const s=new Supervisor({adminPhone:'558499990000',rpc:async name=>{calls.push(name);return [draft];},validateApproval:()=>['valor não aprovado']});
 assert.match(await s.handle('558499990000','ok ABCD'),/Não enviei/);assert.deepEqual(calls,['wa_drafts_pending']);
});

test('nova mensagem durante a geração invalida o resultado sem criar nem enviar rascunho',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'indexa-stale-'));const j=new Journal(join(dir,'db'));t.after(()=>{j.close();rmSync(dir,{recursive:true,force:true});});j.agentEnqueue({id:'m1',phone:'5584999990000',body:'Oi'});
 let reads=0;const calls=[];
 const worker=new AgentWorker({journal:j,kb,mode:'live',inHours:()=>true,rpc:async name=>{calls.push(name);return {version:++reads,latestInboundId:reads===1?'m1':'m2',history:[]};},handle:async()=>({final:'send',text:'Como posso ajudar?',why:'teste'})});
 await worker.tick();assert.equal(calls.includes('wa_draft_create'),false);assert.equal(calls.includes('wa_draft_autosend'),false);
});

test('saídas próprias são reconhecidas e mensagens manuais persistem sem confundir outro número',t=>{
 const dir=mkdtempSync(join(tmpdir(),'indexa-own-'));const j=new Journal(join(dir,'db'));t.after(()=>{j.close();rmSync(dir,{recursive:true,force:true});});
 const job={id:'j',claim_token:'c',phone:'5584999990000'};j.partBegin(job,0,'texto');
 assert.equal(j.isAutomation('remote','558499990000','texto'),true);assert.equal(j.isAutomation('x','5584888882222','texto'),false);
 j.partFinish('j',0,'remote');assert.equal(j.isAutomation('remote',job.phone,'texto'),true);
 j.manual({p_id:'manual',p_phone:job.phone,p_body:'eu respondi'});assert.equal(j.manuals().length,1);j.manualDone('manual');assert.equal(j.manuals().length,0);
});
