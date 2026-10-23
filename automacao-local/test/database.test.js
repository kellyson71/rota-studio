import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Usa exclusivamente um Postgres descartável; não lê credenciais de produção.
test('migração e regras da fila em PostgreSQL 16', async t => {
  const container = 'indexa-sql-' + process.pid;
  const run = (cmd,args,input) => execFileSync(cmd,args,{ input, encoding:'utf8', stdio:['pipe','pipe','pipe'] }).trim();
  run('docker',['run','--detach','--rm','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);
  t.after(() => run('docker',['stop',container]));
  const sql = query => run('docker',['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-qAt'],query);
  for (let i=0;i<30;i++) { try { sql('select 1;'); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  sql(`create role anon; create role authenticated; create schema auth;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    grant usage on schema auth to anon,authenticated; create publication supabase_realtime;`);
  sql(readFileSync(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/migrations/20261023_whatsapp.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/migrations/20261024_agente.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/migrations/20261025_rascunhos.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/migrations/20261026_aprovacao_whatsapp.sql',import.meta.url),'utf8'));
  const member = query => sql(`set role authenticated; set request.jwt.claims='{"email":"kellyson@rota-studio.app","sub":"11111111-1111-4111-8111-111111111111"}'; ${query}`);
  const anon = query => sql('set role anon; ' + query);
  const quote = value => "'" + String(value).replaceAll("'","''") + "'";
  const create = () => JSON.parse(member("select wa_create_device('PC teste');"));
  const ready = d => anon(`select wa_heartbeat('${d.token}','ready');`);
  const claim = d => { const raw=anon(`select wa_claim('${d.token}');`); return raw ? JSON.parse(raw) : null; };
  const schedule = (d, extra={}) => {
    const values={ id:randomUUID(),contact:'fixture-clinic',phone:'5584999991111',body:'Como vocês confirmam as consultas?',when:'now()',...extra };
    member(`select wa_schedule('${values.id}','${d.id}',${quote(values.contact)},${quote(values.phone)},'Clínica teste',${quote(values.body)},${values.when});`);
    return values.id;
  };
  const status = id => sql(`select status from wa_messages where id='${id}';`);
  member("insert into contacts(id,data) values('fixture-clinic','{\"name\":\"Clínica teste\"}');");

  await t.test('anônimo e usuário fora da equipe não controlam a fila', () => {
    assert.throws(()=>anon("select wa_create_device('x');"));
    assert.throws(()=>sql("set role authenticated;set request.jwt.claims='{\"email\":\"outsider@test.local\",\"sub\":\"22222222-2222-4222-8222-222222222222\"}';select wa_create_device('x');"));
    assert.throws(()=>anon('select * from wa_messages;'));
    assert.throws(()=>member('select token_hash from wa_devices;'));
    assert.throws(()=>member("insert into wa_messages(id) values(gen_random_uuid());"));
    assert.throws(()=>anon("select wa_claim(repeat('0',64));"));
  });
  // Os testes de datas são relativos ao relógio do banco.
  await t.test('horário futuro não é antecipado e repetição do mesmo UUID é idempotente', () => {
    const d=create();ready(d);const id=randomUUID(),when=quote(sql("select now()+interval '10 minutes';"));
    schedule(d,{id,when,body:'Futuro'}); schedule(d,{id,when,body:'Futuro'});
    assert.equal(claim(d),null);
    assert.equal(sql(`select count(*) from wa_messages where id='${id}';`),'1');
    assert.throws(()=>schedule(d,{when,body:'Futuro'}));
  });
  await t.test('reivindicação exclusiva, pausa e registro de envio', () => {
    const d=create();ready(d);const id=schedule(d,{body:'Envio único'});
    const job=claim(d);assert.equal(job.id,id);assert.equal(claim(d),null);
    const other=create();assert.throws(()=>anon(`select wa_finish('${other.token}','${id}','${job.claim_token}','sent','remote-x');`));
    assert.equal(anon(`select wa_can_send('${d.token}','${id}','${job.claim_token}');`),'t');
    anon(`select wa_finish('${d.token}','${id}','${job.claim_token}','sent','remote-1');`);
    anon(`select wa_finish('${d.token}','${id}','${job.claim_token}','sent','remote-1');`);
    assert.equal(status(id),'sent');assert.equal(sql("select status from contacts where id='fixture-clinic';"),'Aguardando resposta');
    assert.equal(sql("select jsonb_array_length(data->'history') from contacts where id='fixture-clinic';"),'1');
    member(`select wa_control_device('${d.id}',true,60,true);`);
    schedule(d,{body:'Fila pausada'});assert.equal(claim(d),null);
  });
  await t.test('resposta cancela pendentes mesmo com diferença no nono dígito', () => {
    const d=create();ready(d);const id=schedule(d,{body:'Mensagem após resposta'});
    anon(`select wa_reply('${d.token}','incoming-1','558499991111','Olá, quero saber mais',now(),false);`);
    assert.equal(status(id),'cancelled');assert.equal(sql("select status from contacts where id='fixture-clinic';"),'Respondeu');
    anon(`select wa_reply('${d.token}','incoming-1','558499991111','Olá, quero saber mais',now(),false);`);
    assert.equal(sql("select count(*) from wa_replies where id='incoming-1';"),'1');
  });
  await t.test('recusa bloqueia novo agendamento e resposta alheia é ignorada', () => {
    const d=create();ready(d);schedule(d,{body:'Optout'});
    anon(`select wa_reply('${d.token}','incoming-2','558499991111','Não tenho interesse',now(),true);`);
    assert.throws(()=>schedule(d,{body:'Não deve entrar'}));
    anon(`select wa_reply('${d.token}','unrelated','5584888882222','Mensagem pessoal',now(),false);`);
    assert.equal(sql("select count(*) from wa_replies where id='unrelated';"),'0');
    member("select wa_block('5584999991111',false);update contacts set status='A enviar' where id='fixture-clinic';");
  });
  await t.test('envio vencido é cancelado e execução interrompida fica incerta', () => {
    const d=create();ready(d);const old=schedule(d,{body:'Vencida'});
    sql(`update wa_messages set scheduled_at=now()-interval '2 hours' where id='${old}';`);
    assert.equal(claim(d),null);assert.equal(status(old),'cancelled');
    const id=schedule(d,{body:'Interrompida'});const job=claim(d);
    sql(`update wa_messages set claimed_at=now()-interval '6 minutes' where id='${id}';`);ready(d);
    assert.equal(status(id),'uncertain');assert.equal(claim(d),null);
    anon(`select wa_finish('${d.token}','${id}','${job.claim_token}','sent','late-confirmation');`);
    assert.equal(status(id),'sent');
  });
  await t.test('revogação invalida token e cancela a fila', () => {
    const d=create();const id=schedule(d,{body:'Revogada'});
    member(`select wa_control_device('${d.id}',true,60,false);`);
    assert.equal(status(id),'cancelled');assert.throws(()=>ready(d));
  });
  await t.test('rascunhos do agente: contexto, idempotência, aprovação pela fila e rejeição', () => {
    sql("update contacts set status='A enviar' where id='fixture-clinic';");
    const d=create();ready(d);const id=schedule(d,{body:'Abertura do agente'});const job=claim(d);
    anon(`select wa_finish('${d.token}','${id}','${job.claim_token}','sent','remote-ag');`);
    anon(`select wa_reply('${d.token}','in-ag-1','5584999991111','Quanto custa?',now(),false);`);
    const ctx=JSON.parse(anon(`select wa_agent_context('${d.token}','5584999991111');`));
    assert.equal(ctx.contact.id,'fixture-clinic');assert.equal(ctx.blocked,false);
    assert.deepEqual(ctx.history.map(h=>h.de),['eu','cliente']);
    const draft=anon(`select wa_draft_create('${d.token}','in-ag-1','5584999991111','Quanto custa?','Posso te passar o valor depois do escopo.','{"final":"draft"}'::jsonb);`);
    assert.match(draft,/^[0-9a-f-]{36}$/);
    assert.equal(anon(`select wa_draft_create('${d.token}','in-ag-1','5584999991111','Quanto custa?','outra','{}'::jsonb);`),'');
    assert.equal(sql("select count(*) from wa_drafts where inbound_id='in-ag-1';"),'1');
    assert.throws(()=>anon(`select wa_draft_create('${d.token}','alheio','5511900000000','oi','','{}'::jsonb);`));
    assert.throws(()=>anon(`select wa_draft_decide('${draft}','approve','x');`));
    assert.throws(()=>member(`select wa_draft_decide('${draft}','approve','   ');`));
    member(`select wa_draft_decide('${draft}','approve','Resposta aprovada pelo painel');`);
    assert.equal(sql("select status from wa_messages where body='Resposta aprovada pelo painel';"),'queued');
    assert.equal(sql(`select status from wa_drafts where id='${draft}';`),'approved');
    assert.throws(()=>member(`select wa_draft_decide('${draft}','reject');`));
    anon(`select wa_reply('${d.token}','in-ag-2','5584999991111','E o prazo?',now(),false);`);
    const second=anon(`select wa_draft_create('${d.token}','in-ag-2','5584999991111','E o prazo?','Em torno de 3 semanas.','{}'::jsonb);`);
    member(`select wa_draft_decide('${second}','reject');`);
    assert.equal(sql(`select status from wa_drafts where id='${second}';`),'rejected');
    assert.equal(sql("select count(*) from wa_messages where body='Em torno de 3 semanas.';"),'0');
    assert.throws(()=>anon("select * from wa_drafts;"));
  });
  await t.test('rascunho novo do mesmo contato substitui o anterior pendente; repetido não substitui', () => {
    const d=create();ready(d);schedule(d,{body:'Abertura substituição'});
    const a=anon(`select wa_draft_create('${d.token}','sub-1','5584999991111','oi','primeira','{}'::jsonb);`);
    const b=anon(`select wa_draft_create('${d.token}','sub-2','5584999991111','olá?','segunda','{}'::jsonb);`);
    assert.equal(sql(`select status from wa_drafts where id='${a}';`),'superseded');
    assert.equal(sql(`select status from wa_drafts where id='${b}';`),'pending');
    anon(`select wa_draft_create('${d.token}','sub-2','5584999991111','olá?','repetida','{}'::jsonb);`);
    assert.equal(sql(`select status from wa_drafts where id='${b}';`),'pending','reenvio do mesmo id não derruba o atual');
    assert.throws(()=>member(`select wa_draft_decide('${a}','approve','x');`),'substituído não pode ser aprovado');
  });
  await t.test('aprovação pelo WhatsApp: código curto, edição, descarte, erros claros e só o próprio computador', () => {
    sql("update contacts set status='A enviar' where id='fixture-clinic';");
    const d=create();ready(d);schedule(d,{body:'Abertura aprovação'});
    const mk=(id,sug)=>anon(`select wa_draft_create('${d.token}','${id}','5584999991111','msg ${id}','${sug}','{}'::jsonb);`);
    const a=mk('ap-1','Sugestão A'); const code=a.replace(/-/g,'').slice(0,4);
    const pend=JSON.parse(anon(`select wa_drafts_pending('${d.token}');`));
    assert.equal(pend.length,1); assert.equal(pend[0].code,code.toUpperCase()); assert.equal(pend[0].suggestion,'Sugestão A');
    const other=create(); assert.throws(()=>anon(`select wa_draft_decide_device('${other.token}','${code}','approve');`),'outro computador não decide');
    assert.throws(()=>anon(`select wa_draft_decide_device('${d.token}','zz!','approve');`));
    const r=JSON.parse(anon(`select wa_draft_decide_device('${d.token}','${code.toUpperCase()}','approve','Texto editado por mim');`));
    assert.equal(r.status,'approved');
    assert.equal(sql("select status from wa_messages where body='Texto editado por mim';"),'queued');
    assert.equal(sql(`select decision->>'via' from wa_drafts where id='${a}';`),'whatsapp');
    assert.throws(()=>anon(`select wa_draft_decide_device('${d.token}','${code}','approve');`),/já foi aprovado/);
    const b=mk('ap-2','Sugestão B'); const cb=b.replace(/-/g,'').slice(0,4);
    anon(`select wa_draft_decide_device('${d.token}','${cb}','reject');`);
    assert.equal(sql(`select status from wa_drafts where id='${b}';`),'rejected');
    const c=mk('ap-3',''); const cc=c.replace(/-/g,'').slice(0,4);
    assert.throws(()=>anon(`select wa_draft_decide_device('${d.token}','${cc}','approve');`),/não tem sugestão/);
    assert.throws(()=>anon(`select wa_draft_decide_device('${d.token}','ffff','approve');`));
    assert.throws(()=>member(`select wa_drafts_pending('${d.token}');`),'membro logado não usa a função do executor');
  });
});
