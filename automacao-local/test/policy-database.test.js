import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {calculateQuote,renderQuote,POLICY_VERSION} from '../src/agent/commercial.js';

test('políticas, controle humano e versões no PostgreSQL real',async t=>{
 const container='indexa-policy-'+process.pid;
 const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 run(['run','--detach','--rm','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);
 t.after(()=>run(['stop',container]));
 const sql=q=>run(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-qAt'],q);
 for(let i=0;i<50;i++){try{sql('select 1;');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 sql(`create role anon;create role authenticated;create schema auth;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema auth to anon,authenticated;create publication supabase_realtime;`);
 for(const name of ['schema.sql','migrations/20261023_whatsapp.sql','migrations/20261024_agente.sql','migrations/20261025_rascunhos.sql','migrations/20261026_aprovacao_whatsapp.sql','migrations/20261027_resposta_automatica.sql','migrations/20261028_politicas_conversa.sql','migrations/20261029_retornos_supervisionados.sql'])sql(readFileSync(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 const quoted=s=>"'"+String(s).replaceAll("'","''")+"'";
 const member=q=>sql(`set role authenticated;set request.jwt.claims='{"email":"kellyson@rota-studio.app","sub":"11111111-1111-4111-8111-111111111111"}';${q}`);
 const anon=q=>sql('set role anon;'+q);
 const json=x=>quoted(JSON.stringify(x))+'::jsonb';
 const phone='5584999993333';
 member(`insert into contacts(id,data) values('policy-clinic','{"name":"Clínica teste"}');`);
 const device=()=>JSON.parse(member("select wa_create_device('PC política');"));
 const config=(d,mode='live',limit=10)=>anon(`select wa_policy_config('${d.token}','${mode}',${limit},'${POLICY_VERSION}');select wa_heartbeat('${d.token}','ready');`);
 const schedule=(d,body='Mensagem de abertura '+randomUUID())=>{const id=randomUUID();member(`select wa_schedule('${id}','${d.id}','policy-clinic','${phone}','Clínica',${quoted(body)},now());`);return id;};
 const context=d=>JSON.parse(anon(`select wa_agent_context('${d.token}','${phone}');`));
 const incoming=d=>{const id='in-'+randomUUID();anon(`select wa_reply('${d.token}',${quoted(id)},'${phone}','Quero detalhes',now(),false);`);return id;};
 const make=(d,id,extra={},text='Posso explicar o painel?')=>anon(`select wa_draft_create('${d.token}',${quoted(id)},'${phone}','Quero detalhes',${quoted(text)},${json({contextVersion:context(d).version,policyVersion:POLICY_VERSION,schemaValidated:true,final:'send',...extra})});`);
 const approve=(d,id)=>anon(`select wa_draft_autosend('${d.token}','${id}');`);
 const claim=d=>{const r=anon(`select wa_claim('${d.token}');`);return r?JSON.parse(r):null;};

 await t.test('horários usam Fortaleza e configuração não é pública',()=>{
   assert.equal(sql("select wa_in_hours('2026-10-23T15:00:00Z');"),'t');
   assert.equal(sql("select wa_in_hours('2026-10-23T22:00:00Z');"),'f');
   assert.equal(sql("select wa_in_hours('2026-10-24T13:00:00Z');"),'t');
   assert.equal(sql("select wa_in_hours('2026-10-25T13:00:00Z');"),'f');
   assert.throws(()=>anon('select * from wa_conversations;'));
   assert.throws(()=>anon("select wa_text_check('x');"));
 });
 // Testa a política de horário separadamente; as próximas transições são independentes do relógio da máquina.
 sql('create or replace function public.wa_in_hours(p_at timestamptz default now()) returns boolean language sql stable as $$ select true $$;');

 await t.test('modo sombra e rascunho explícito não autorizam envio nem por RPC',()=>{
   const d=device();config(d,'shadow');schedule(d);const inbound=incoming(d),draft=make(d,inbound);
   assert.throws(()=>approve(d,draft),/Política não permite/);
   config(d);assert.throws(()=>approve(d,make(d,incoming(d),{final:'draft'})),/autorização válida/);
   assert.throws(()=>approve(d,make(d,incoming(d),{schemaValidated:false})),/autorização válida/);
   assert.throws(()=>approve(d,make(d,incoming(d),{policyVersion:'antiga'})),/autorização válida/);
 });
 await t.test('nova mensagem invalida geração e rascunho anteriores',()=>{
   const d=device();config(d);schedule(d);const first=incoming(d),old=context(d);const dr=make(d,first);incoming(d);
   assert.equal(sql(`select status from wa_drafts where id='${dr}';`),'superseded');assert.throws(()=>approve(d,dr));
   assert.equal(anon(`select wa_draft_create('${d.token}','${first}','${phone}','antiga','Texto antigo',${json({contextVersion:old.version})});`),'');
 });
 await t.test('saída manual entra no contexto e pausa até comando explícito',()=>{
   const d=device();config(d);schedule(d);incoming(d);const before=context(d);
   anon(`select wa_manual_outbound('${d.token}','manual-${d.id}','${phone}','Eu respondi pelo celular',now());`);
   const ctx=context(d);assert.equal(ctx.owner,'human');assert.ok(ctx.version>before.version);assert.ok(ctx.history.some(h=>h.texto==='Eu respondi pelo celular'&&h.de==='eu'));
   assert.throws(()=>schedule(d),/Conversa pausada/);
   anon(`select wa_conversation_control_device('${d.token}','${phone}',false);`);assert.equal(context(d).owner,'auto');
   assert.throws(()=>anon(`select wa_conversation_control('${d.id}','${phone}',false);`));
 });
 await t.test('mudança de modo ou pausa depois de enfileirar impede o despacho',()=>{
   const d=device();config(d);schedule(d);const dr=make(d,incoming(d));approve(d,dr);config(d,'shadow');
   const job=claim(d);assert.ok(job);assert.equal(anon(`select wa_can_send('${d.token}','${job.id}','${job.claim_token}');`),'f');
   assert.equal(sql(`select status from wa_messages where id='${job.id}';`),'cancelled');
 });
 await t.test('confirmação por parte preserva entrega parcial e não é saída manual',()=>{
   const d=device();config(d);const id=schedule(d);const job=claim(d);assert.equal(job.id,id);
   anon(`select wa_part_record('${d.token}','${id}','${job.claim_token}',0,'Parte 1','part-${id}');`);
   assert.equal(anon(`select wa_manual_outbound('${d.token}','part-${id}','${phone}','Parte 1',now());`),'f');assert.equal(context(d).owner,'auto');
   anon(`select wa_conversation_control_device('${d.token}','${phone}',true);`);
   assert.equal(anon(`select wa_can_send('${d.token}','${id}','${job.claim_token}');`),'f');assert.equal(sql(`select status from wa_messages where id='${id}';`),'uncertain');
 });
 await t.test('texto calculado é idêntico no JS e banco; proposta adulterada não passa',()=>{
   const d=device();config(d);schedule(d);
   const profile={service:'agenda',tier:'normal',scope:['agendamento','recepcao'],scopeConfirmed:true};
   anon(`select wa_commercial_profile('${d.token}','${phone}',${json(profile)});`);
   const q=calculateQuote(profile),body=renderQuote(q);assert.equal(sql(`select wa_render_quote(${json(q)});`),body);
   const dr=make(d,incoming(d),{quote:q},body);approve(d,dr);assert.equal(context(d).commercial.quote.baseCents,200000);
   assert.throws(()=>anon(`select wa_commercial_profile('${d.token}','${phone}',${json({...profile,tier:'acquisition'})});`),/Já existe proposta/);
   const dr2=make(d,incoming(d),{quote:q},'Preço diferente: R$ 1,00');assert.throws(()=>approve(d,dr2),/Texto não corresponde/);
   const dr3=make(d,incoming(d),{quote:{...q,totalCents:1}},body);assert.throws(()=>approve(d,dr3),/Total ou anual/);
   const dr4=make(d,incoming(d),{quote:{...q,discountPercent:20}},body);assert.throws(()=>approve(d,dr4),/Desconto/);
 });
 await t.test('primeira abordagem manual e edições também passam pela política',()=>{
   const d=device();config(d);
   for(const body of ['Veja https://rota-studio-plum.vercel.app.evil.test','Fica em novecentos reais.','O lembrete sai automaticamente no WhatsApp.','Eu entrego amanhã.'])assert.throws(()=>schedule(d,body),body);
   schedule(d);const dr=make(d,incoming(d),{final:'draft'});
   assert.throws(()=>member(`select wa_draft_decide('${dr}','approve','Sai por R$ 9');`),/Valores precisam/);
 });
 await t.test('limite é revalidado e supervisão não atravessa dispositivo',()=>{
   const d=device();config(d,'live',1);schedule(d);const dr=make(d,incoming(d));approve(d,dr);
   // Uma nova resposta cancela a pendente, mas os enviados/incertos continuam contabilizados.
   sql(`update wa_messages set status='sent' where device_id='${d.id}' and origin='agent';`);
   assert.throws(()=>approve(d,make(d,incoming(d))),/Limite automático/);
   const other=device();assert.throws(()=>anon(`select wa_draft_autosend('${other.token}','${dr}');`));
   const s=JSON.parse(anon(`select wa_admin_status('${d.token}');`));assert.equal(s.device.mode,'live');
   anon(`select wa_admin_pause('${d.token}',true);`);assert.equal(JSON.parse(anon(`select wa_admin_status('${d.token}');`)).device.paused,true);
 });
 await t.test('retornos contam dias úteis, exigem abertura e autorização e são idempotentes',()=>{
   assert.equal(sql("select wa_business_elapsed('2026-10-30','2026-11-04',array['2026-11-02'::date]);"),'2');
   const d=device();config(d);const id=schedule(d);
   assert.throws(()=>anon(`select wa_followup_permission('${d.token}','${phone}',true);`),/não abriu/);
   const day=sql("select d::date from generate_series(current_date-20,current_date-1,interval '1 day') d where wa_business_elapsed(d::date,current_date,'{}')=3 order by d desc limit 1;");
   anon(`select wa_reply('${d.token}','fup-${d.id}','${phone}','Pode retomar depois','${day}'::timestamptz-interval '1 day',false);`);
   sql(`update wa_messages set status='sent',sent_at='${day}'::timestamptz where id='${id}';`);
   assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'0');
   anon(`select wa_followup_permission('${d.token}','${phone}',true);`);
   assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'1');assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'0');
   assert.equal(sql(`select count(*) from wa_messages where device_id='${d.id}' and origin='followup';`),'1');
   anon(`select wa_reply('${d.token}','fup-reply-${d.id}','${phone}','Vi agora',now(),false);`);
   assert.equal(sql(`select status from wa_messages where device_id='${d.id}' and origin='followup';`),'cancelled');
 });
 await t.test('religar depois do sétimo dia não dispara dois retornos e pausa os impede',()=>{
   const d=device();config(d);const id=schedule(d);
   const day=sql("select d::date from generate_series(current_date-20,current_date-1,interval '1 day') d where wa_business_elapsed(d::date,current_date,'{}')=7 order by d desc limit 1;");
   anon(`select wa_reply('${d.token}','fup7-${d.id}','${phone}','Pode me lembrar','${day}'::timestamptz-interval '1 day',false);`);
   sql(`update wa_messages set status='sent',sent_at='${day}'::timestamptz where id='${id}';`);
   anon(`select wa_followup_permission('${d.token}','${phone}',true);`);
   assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'1');assert.equal(sql(`select step from wa_followups where device_id='${d.id}';`),'2');
   assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'0');
   anon(`select wa_followup_permission('${d.token}','${phone}',false);`);
   assert.equal(sql(`select status from wa_messages where device_id='${d.id}' and origin='followup';`),'cancelled');
   assert.equal(anon(`select wa_followups_prepare('${d.token}');`),'0');
 });
});
