begin;

alter table public.wa_devices add column agent_mode text not null default 'shadow' check(agent_mode in ('live','shadow'));
alter table public.wa_devices add column auto_limit integer not null default 10 check(auto_limit between 1 and 100);
alter table public.wa_devices add column policy_version text not null default 'indexa-2026-10-24.1';
grant select(agent_mode,auto_limit,policy_version) on public.wa_devices to authenticated;
alter table public.wa_messages add column origin text not null default 'operator' check(origin in ('operator','agent','followup'));
alter table public.wa_messages add column context_version bigint;
alter table public.wa_messages add column decision jsonb not null default '{}'::jsonb;
alter table public.wa_drafts add column context_version bigint;
alter table public.wa_drafts drop constraint wa_drafts_inbound_id_key;
alter table public.wa_drafts add constraint wa_drafts_inbound_version_key unique(inbound_id,context_version);
update public.wa_drafts set status='superseded',decided_at=now() where status='pending';

create table public.wa_conversations (
  device_id uuid not null references public.wa_devices(id), phone_key text not null, phone text not null,
  version bigint not null default 0, owner text not null default 'auto' check(owner in ('auto','human')),
  pause_reason text, last_inbound_id text, last_inbound_at timestamptz, updated_at timestamptz not null default now(),
  commercial_profile jsonb not null default '{}'::jsonb, quote jsonb,
  followup_allowed boolean not null default false,
  primary key(device_id,phone_key)
);
create table public.wa_manual_messages (
  id text primary key, device_id uuid not null references public.wa_devices(id), phone text not null,
  body text not null, sent_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.wa_message_parts (
  message_id uuid not null references public.wa_messages(id), part_index integer not null check(part_index between 0 and 2),
  body text not null, remote_id text not null, sent_at timestamptz not null default now(),
  primary key(message_id,part_index), unique(remote_id)
);
alter table public.wa_conversations enable row level security;
alter table public.wa_manual_messages enable row level security;
alter table public.wa_message_parts enable row level security;
revoke all on public.wa_conversations,public.wa_manual_messages,public.wa_message_parts from public,anon,authenticated;
grant select on public.wa_conversations,public.wa_manual_messages,public.wa_message_parts to authenticated;
create policy wa_conversations_read on public.wa_conversations for select to authenticated using(public.is_member());
create policy wa_manual_read on public.wa_manual_messages for select to authenticated using(public.is_member());
create policy wa_parts_read on public.wa_message_parts for select to authenticated using(public.is_member());

-- Invalida respostas antigas preparadas pela versão anterior; agendamentos do operador permanecem.
update public.wa_messages m set status='cancelled',last_error='Política atualizada: resposta antiga precisa de nova revisão'
where m.status='queued' and exists(select 1 from public.wa_drafts r where r.device_id=m.device_id
  and public.wa_phone_key(r.phone)=public.wa_phone_key(m.phone) and r.status='approved'
  and r.decision->>'via'='agente' and r.suggestion=m.body);

create function public.wa_state(p_device uuid,p_phone text) returns public.wa_conversations
language plpgsql security definer set search_path=public,pg_temp as $$
declare state public.wa_conversations; last_reply public.wa_replies;
begin
  insert into public.wa_conversations(device_id,phone_key,phone) values(p_device,public.wa_phone_key(p_phone),p_phone) on conflict do nothing;
  select * into state from public.wa_conversations where device_id=p_device and phone_key=public.wa_phone_key(p_phone) for update;
  if state.last_inbound_id is null then
    select * into last_reply from public.wa_replies where device_id=p_device and public.wa_phone_key(phone)=state.phone_key order by received_at desc,id desc limit 1;
    if last_reply.id is not null then
      update public.wa_conversations set last_inbound_id=last_reply.id,last_inbound_at=last_reply.received_at
        where device_id=p_device and phone_key=state.phone_key returning * into state;
    end if;
  end if;
  return state;
end $$;

create function public.wa_reply_version() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.wa_conversations(device_id,phone_key,phone,version,last_inbound_id,last_inbound_at)
  values(new.device_id,public.wa_phone_key(new.phone),new.phone,1,new.id,new.received_at)
  on conflict(device_id,phone_key) do update set version=wa_conversations.version+1,updated_at=now(),
    last_inbound_id=case when excluded.last_inbound_at>=coalesce(wa_conversations.last_inbound_at,'-infinity') then excluded.last_inbound_id else wa_conversations.last_inbound_id end,
    last_inbound_at=greatest(wa_conversations.last_inbound_at,excluded.last_inbound_at);
  update public.wa_drafts set status='superseded',decided_at=now() where device_id=new.device_id
    and public.wa_phone_key(phone)=public.wa_phone_key(new.phone) and status='pending';
  return new;
end $$;
create trigger wa_reply_version after insert on public.wa_replies for each row execute function public.wa_reply_version();

create function public.wa_policy_config(p_token text,p_mode text,p_limit integer,p_version text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);
begin
  if p_mode not in ('live','shadow') or p_limit not between 1 and 100 or p_version<>'indexa-2026-10-24.1' then raise exception 'Configuração de política inválida'; end if;
  update public.wa_devices set agent_mode=p_mode,auto_limit=p_limit,policy_version=p_version where id=d;
end $$;

create function public.wa_conversation_control_device(p_token text,p_phone text,p_paused boolean,p_reason text default 'Controle do administrador') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); s public.wa_conversations;
begin
  s:=public.wa_state(d,p_phone);
  update public.wa_conversations set owner=case when p_paused then 'human' else 'auto' end,
    pause_reason=case when p_paused then left(p_reason,300) else null end,version=version+1,updated_at=now()
    where device_id=d and phone_key=s.phone_key returning * into s;
  update public.wa_messages set status='cancelled',last_error='Controle humano alterou a conversa',updated_at=now()
    where device_id=d and public.wa_phone_key(phone)=s.phone_key and status='queued';
  update public.wa_drafts set status='superseded',decided_at=now() where device_id=d and public.wa_phone_key(phone)=s.phone_key and status='pending';
  return jsonb_build_object('phone',p_phone,'owner',s.owner,'version',s.version);
end $$;
create function public.wa_conversation_control(p_device uuid,p_phone text,p_paused boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.wa_conversations;
begin
  perform public.wa_require_member();s:=public.wa_state(p_device,p_phone);
  update public.wa_conversations set owner=case when p_paused then 'human' else 'auto' end,pause_reason=case when p_paused then 'Pausada pelo painel' else null end,version=version+1,updated_at=now()
    where device_id=p_device and phone_key=s.phone_key returning * into s;
  update public.wa_messages set status='cancelled',last_error='Controle humano alterou a conversa' where device_id=p_device and public.wa_phone_key(phone)=s.phone_key and status='queued';
  update public.wa_drafts set status='superseded',decided_at=now() where device_id=p_device and public.wa_phone_key(phone)=s.phone_key and status='pending';
  return jsonb_build_object('phone',p_phone,'owner',s.owner,'version',s.version);
end $$;

create function public.wa_manual_outbound(p_token text,p_id text,p_phone text,p_body text,p_sent_at timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);
begin
  if not exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=public.wa_phone_key(p_phone)) then return false; end if;
  if exists(select 1 from public.wa_message_parts p join public.wa_messages m on m.id=p.message_id where m.device_id=d and p.remote_id=p_id)
    or exists(select 1 from public.wa_messages where device_id=d and remote_id=p_id) then return false; end if;
  insert into public.wa_manual_messages(id,device_id,phone,body,sent_at) values(p_id,d,p_phone,left(p_body,4000),p_sent_at) on conflict do nothing;
  if not found then return false; end if;
  perform public.wa_conversation_control_device(p_token,p_phone,true,'Você respondeu pelo WhatsApp; só volta com retomar');
  return true;
end $$;

create or replace function public.wa_agent_context(p_token text,p_phone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); k text:=public.wa_phone_key(p_phone); s public.wa_conversations; contact jsonb; hist jsonb;
begin
  s:=public.wa_state(d,p_phone);
  select c.data||jsonb_build_object('id',c.id,'status',c.status) into contact from public.contacts c where c.id=(select contact_id from public.wa_messages where device_id=d and public.wa_phone_key(phone)=k and contact_id is not null order by created_at desc limit 1);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.em,t.id),'[]'::jsonb) into hist from (
    select * from (
      select r.id,'cliente'::text as de,r.body as texto,r.received_at as em from public.wa_replies r where r.device_id=d and public.wa_phone_key(r.phone)=k
      union all select x.id,'eu',x.body,x.sent_at from public.wa_manual_messages x where x.device_id=d and public.wa_phone_key(x.phone)=k
      union all select m.id::text,'eu',m.body,coalesce(m.sent_at,m.created_at) from public.wa_messages m where m.device_id=d and public.wa_phone_key(m.phone)=k and m.status='sent'
      union all select p.remote_id,'eu',p.body,p.sent_at from public.wa_message_parts p join public.wa_messages m on m.id=p.message_id where m.device_id=d and public.wa_phone_key(m.phone)=k and m.status<>'sent'
    ) u order by em desc,id desc limit 30
  ) t;
  return jsonb_build_object('contact',contact,'history',hist,'version',s.version,'latestInboundId',s.last_inbound_id,'owner',s.owner,'pauseReason',s.pause_reason,
    'commercial',jsonb_build_object('profile',s.commercial_profile,'quote',s.quote),
    'blocked',exists(select 1 from public.wa_blocks where public.wa_phone_key(phone)=k),
    'autoCount',(select count(*) from public.wa_messages where device_id=d and public.wa_phone_key(phone)=k and origin='agent' and status in ('queued','sending','sent','uncertain')));
end $$;

create or replace function public.wa_draft_create(p_token text,p_inbound_id text,p_phone text,p_inbound_body text,p_suggestion text,p_decision jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); s public.wa_conversations; cid text; result uuid; v bigint;
begin
  if not exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=public.wa_phone_key(p_phone)) then raise exception 'Contato não pertence a este computador'; end if;
  s:=public.wa_state(d,p_phone);
  if p_decision ? 'contextVersion' then
    if p_decision->>'contextVersion' !~ '^\d+$' then raise exception 'Versão de contexto inválida'; end if;
    v:=(p_decision->>'contextVersion')::bigint;
    if v<>s.version or (s.last_inbound_id is not null and s.last_inbound_id<>p_inbound_id) then return null; end if;
  else v:=s.version; end if;
  select contact_id into cid from public.wa_messages where device_id=d and public.wa_phone_key(phone)=s.phone_key and contact_id is not null order by created_at desc limit 1;
  insert into public.wa_drafts(device_id,contact_id,phone,inbound_id,inbound_body,suggestion,decision,context_version)
    values(d,cid,p_phone,left(p_inbound_id,250),left(p_inbound_body,4000),left(coalesce(p_suggestion,''),4000),coalesce(p_decision,'{}'),v)
    on conflict(inbound_id,context_version) do nothing returning id into result;
  if result is not null then update public.wa_drafts set status='superseded',decided_at=now() where device_id=d and public.wa_phone_key(phone)=s.phone_key and status='pending' and id<>result; end if;
  return result;
end $$;

create function public.wa_in_hours(p_at timestamptz default now()) returns boolean language sql stable set search_path=public,pg_temp as $$
  select case when extract(isodow from p_at at time zone 'America/Fortaleza') between 1 and 5 then extract(hour from p_at at time zone 'America/Fortaleza') between 8 and 17
    when extract(isodow from p_at at time zone 'America/Fortaleza')=6 then extract(hour from p_at at time zone 'America/Fortaleza') between 8 and 11 else false end;
$$;

create function public.wa_brl(p_cents integer) returns text language sql immutable set search_path=public,pg_temp as $$
 select 'R$ '||regexp_replace((p_cents/100)::text,'(\d)(?=(\d{3})+$)','\1.','g')||','||lpad((p_cents%100)::text,2,'0');
$$;
create function public.wa_render_quote(q jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select 'Para o '||case when q->>'service'='presenca' then 'site' else 'sistema com os módulos combinados' end||', a implantação fica em '||public.wa_brl((q->>'implementationCents')::integer)||'. '||
 case when (q->>'hostingCents')::integer=0 then 'O primeiro ano de hospedagem entra como bônus. Depois, a renovação é de R$ 300 por ano.' else 'A hospedagem fica em R$ 300 por ano.' end||E'\n\n'||
 case when q->>'payment'='card' then 'No cartão, dá para parcelar em até 12x com juros; o valor de cada parcela e o total serão exibidos no link do Mercado Pago antes do pagamento.'
 when q->>'concession'='cash_discount' then 'Esse valor é para a implantação paga à vista no Pix.'
 else 'No Pix, a implantação fica em '||public.wa_brl((q->>'pixEntryCents')::integer)||' de entrada e '||public.wa_brl((q->>'pixDeliveryCents')::integer)||' na entrega.' end||E'\n\n'||
 'O domínio é registrado no seu nome e cobrado à parte pelo custo real. Correções de bugs do escopo estão incluídas no plano; atendimento de uso, ajustes e novas funções são à parte. Posso preparar a proposta com o escopo escrito?';
$$;
revoke all on function public.wa_brl(integer),public.wa_render_quote(jsonb) from public,anon,authenticated;

create function public.wa_text_check(p_body text,p_quote jsonb default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare token text; host text; q jsonb:=p_quote; base integer; price integer; annual integer; pct integer;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 4000 or p_body~'\{[^}]+\}' then raise exception 'Mensagem vazia, longa ou com campos não preenchidos'; end if;
  for token in select m[1] from regexp_matches(p_body,'((?:[a-zA-Z][a-zA-Z0-9+.-]*://|www\.)[^\s<>]+|(?:[a-zA-Z0-9-]+\.)+(?:com|br|app|io|me|net|org)\y[^\s<>]*)','g') m loop
    token:=regexp_replace(token,'[),.;!?]+$','');
    if token~'^[a-zA-Z][a-zA-Z0-9+.-]*://' and token!~'^https://' then raise exception 'Link precisa de HTTPS'; end if;
    host:=lower(split_part(regexp_replace(token,'^https://',''), '/',1));host:=split_part(split_part(host,'?',1),'#',1);
    if host<>'rota-studio-plum.vercel.app' then raise exception 'Link não autorizado: %',host; end if;
  end loop;
  if p_body~*'(whats\s*app|whatzap|\mzap\M)' and p_body~*'(autom[aá]tic|sozinh|programad)' then raise exception 'Produto só possui template e botão para envio manual no WhatsApp'; end if;
  if p_body~*'(amanh[ãa]|entrego|entregamos|fica pronto|confirmado para)' then raise exception 'Compromisso precisa de confirmação humana'; end if;
  if q is not null and q<>'null'::jsonb then
    if q->>'policyVersion' is distinct from 'indexa-2026-10-24.1' then raise exception 'Proposta de outra política'; end if;
    if jsonb_typeof(q->'baseCents') is distinct from 'number' or jsonb_typeof(q->'implementationCents') is distinct from 'number'
      or jsonb_typeof(q->'hostingCents') is distinct from 'number' or jsonb_typeof(q->'discountPercent') is distinct from 'number'
      or jsonb_typeof(q->'totalCents') is distinct from 'number' or jsonb_typeof(q->'renewalCents') is distinct from 'number' then raise exception 'Valores devem ser números do catálogo'; end if;
    if q->>'baseCents'!~'^\d+$' or q->>'implementationCents'!~'^\d+$' or q->>'hostingCents'!~'^\d+$' or q->>'discountPercent'!~'^\d+$' then raise exception 'Valores inválidos';end if;
    base:=(q->>'baseCents')::integer;price:=(q->>'implementationCents')::integer;annual:=(q->>'hostingCents')::integer;pct:=(q->>'discountPercent')::integer;
    if coalesce(q->>'service','') not in ('presenca','agenda') or coalesce(q->>'tier','') not in ('acquisition','normal') then raise exception 'Serviço ou faixa inválidos';end if;
    if not ((q->>'service'='presenca' and base=50000) or (q->>'service'='agenda' and ((q->>'tier'='acquisition' and base=125000) or (q->>'tier'='normal' and base between 175000 and 212500)))) then raise exception 'Preço fora do catálogo';end if;
    if pct not between 0 and 10 or price<>base-round(base*pct/100.0)::integer then raise exception 'Desconto ou cálculo inválido';end if;
    if coalesce(q->>'concession','') not in ('none','cash_discount','hosting_bonus') or coalesce(q->>'payment','') not in ('pix','card') then raise exception 'Condição inválida';end if;
    if (q->>'concession'='cash_discount' and (q->>'payment'<>'pix' or pct=0)) or (q->>'concession'<>'cash_discount' and pct<>0) then raise exception 'Desconto somente à vista e sem bônus acumulado';end if;
    if annual<>(case when q->>'concession'='hosting_bonus' then 0 else 30000 end) or (q->>'totalCents')::integer<>price+annual or (q->>'renewalCents')::integer<>30000 then raise exception 'Total ou anual inválido';end if;
    if q->'domainSeparate' is distinct from 'true'::jsonb then raise exception 'Domínio deve ser separado';end if;
    if jsonb_typeof(q->'maxInstallments') is distinct from 'number' or (q->>'maxInstallments')::integer<>(case when q->>'payment'='card' then 12 else 1 end) then raise exception 'Limite de parcelas inválido';end if;
    if q->>'payment'='pix' and ((q->>'pixEntryCents')::integer is distinct from ceil(price/2.0)::integer or (q->>'pixDeliveryCents')::integer is distinct from floor(price/2.0)::integer) then raise exception 'Entrada ou saldo inválido';end if;
    if public.wa_render_quote(q) is distinct from p_body then raise exception 'Texto não corresponde aos valores calculados';end if;
  elsif p_body~*'(R\s*\$|\mBRL\M|\mreais\M|[0-9]+\s*%|\m(desconto|gr[aá]tis|gratuito|b[oô]nus|brinde|por cento|parcel[a-z]*)\M|sem (custo|cobran[cç]a))'
    and p_body not in ('O desconto na implantação é para pagamento à vista no Pix. Você prefere essa opção ou o parcelamento com juros no cartão?',
    'O primeiro ano de hospedagem já está entrando como bônus nessa proposta. As duas condições são alternativas; quer manter o bônus ou ver o valor à vista?') then raise exception 'Valores precisam de proposta calculada pelo catálogo';
  end if;
end $$;

create function public.wa_block_device(p_token text,p_phone text,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);
begin
 if not exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=public.wa_phone_key(p_phone)) then raise exception 'Contato não monitorado';end if;
 insert into public.wa_blocks(phone,reason) values(p_phone,left(p_reason,300)) on conflict do nothing;
 update public.wa_messages set status='cancelled',last_error='Contato bloqueado' where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and status='queued';
end $$;
revoke all on function public.wa_block_device(text,text,text) from public,anon,authenticated;
grant execute on function public.wa_block_device(text,text,text) to anon;
revoke all on function public.wa_text_check(text,jsonb) from public,anon,authenticated;

alter function public.wa_schedule(uuid,uuid,text,text,text,text,timestamptz) rename to wa_schedule_legacy;
revoke all on function public.wa_schedule_legacy(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
create function public.wa_schedule(p_id uuid,p_device_id uuid,p_contact_id text,p_phone text,p_name text,p_body text,p_scheduled_at timestamptz) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.wa_conversations; result uuid;
begin
  perform public.wa_require_member();perform public.wa_text_check(p_body);s:=public.wa_state(p_device_id,p_phone);
  if s.owner='human' then raise exception 'Conversa pausada; retome antes de agendar';end if;
  result:=public.wa_schedule_legacy(p_id,p_device_id,p_contact_id,p_phone,p_name,p_body,p_scheduled_at);
  update public.wa_messages set context_version=s.version where id=result;
  return result;
end $$;
revoke all on function public.wa_schedule(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.wa_schedule(uuid,uuid,text,text,text,text,timestamptz) to authenticated;

create or replace function public.wa__approve(p_device uuid,p_id uuid,p_text text,p_via text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare dr public.wa_drafts; s public.wa_conversations; dev public.wa_devices; body text; contact_name text; cstatus text; auto_count integer;
begin
  select * into dev from public.wa_devices where id=p_device and enabled for update;
  if dev.id is null then raise exception 'Computador não disponível'; end if;
  select * into dr from public.wa_drafts where id=p_id and device_id=p_device;
  if dr.id is null then raise exception 'Rascunho não encontrado'; end if;
  s:=public.wa_state(p_device,dr.phone);
  select * into dr from public.wa_drafts where id=p_id and device_id=p_device for update;
  if dr.status<>'pending' then raise exception 'Rascunho já foi decidido'; end if;
  if s.owner='human' then raise exception 'Conversa pausada; use retomar antes de aprovar'; end if;
  if dr.context_version is distinct from s.version or dr.created_at<now()-interval '24 hours' then raise exception 'Rascunho desatualizado'; end if;
  body:=btrim(coalesce(nullif(btrim(coalesce(p_text,'')),''),dr.suggestion));
  if body='' then raise exception 'Rascunho não tem sugestão; use edita CODIGO seu texto'; end if;
  perform public.wa_text_check(body,dr.decision->'quote');
  if dr.decision ? 'quote' and dr.decision->'quote'<>'null'::jsonb then
    if body<>dr.suggestion or s.commercial_profile->>'scopeConfirmed' is distinct from 'true'
      or dr.decision->'quote'->>'service' is distinct from s.commercial_profile->>'service'
      or dr.decision->'quote'->>'tier' is distinct from s.commercial_profile->>'tier'
      or dr.decision->'quote'->'scope' is distinct from s.commercial_profile->'scope' then raise exception 'Proposta não corresponde ao escopo conferido';end if;
    if s.quote is not null and s.quote->>'baseCents' is distinct from dr.decision->'quote'->>'baseCents' then raise exception 'Preço já apresentado não pode aumentar sem revisão de escopo';end if;
  end if;
  if length(body)>4000 or body~'\{[^}]+\}' then raise exception 'Texto inválido ou com campos não preenchidos'; end if;
  if exists(select 1 from public.wa_blocks where public.wa_phone_key(phone)=s.phone_key) then raise exception 'Contato está na lista de não contatar'; end if;
  select c.data->>'name',c.status into contact_name,cstatus from public.contacts c where c.id=dr.contact_id;
  if cstatus in ('Sem interesse','Não compensa') then raise exception 'Contato marcado sem interesse ou não compensa'; end if;
  if p_via='agente' then
    if dev.agent_mode<>'live' or dev.paused or not public.wa_in_hours() then raise exception 'Política não permite envio automático agora'; end if;
    if dr.decision->>'final' is distinct from 'send' or dr.decision->>'schemaValidated' is distinct from 'true' or dr.decision->>'policyVersion' is distinct from dev.policy_version
      or not dr.decision ? 'contextVersion' then raise exception 'Rascunho sem autorização válida da política'; end if;
    select count(*) into auto_count from public.wa_messages where device_id=p_device and public.wa_phone_key(phone)=s.phone_key and origin in ('agent','followup') and status in ('queued','sending','sent','uncertain');
    if auto_count>=dev.auto_limit then raise exception 'Limite automático atingido'; end if;
  end if;
  insert into public.wa_messages(id,device_id,contact_id,phone,name,body,scheduled_at,created_by,origin,context_version,decision)
    values(gen_random_uuid(),p_device,dr.contact_id,dr.phone,coalesce(contact_name,'+'||dr.phone),body,now(),p_device,
      case when p_via='agente' then 'agent' else 'operator' end,s.version,dr.decision);
  if dr.decision ? 'quote' and dr.decision->'quote'<>'null'::jsonb then
    update public.wa_conversations set quote=dr.decision->'quote' where device_id=p_device and phone_key=s.phone_key;
  end if;
  update public.wa_drafts set status='approved',decided_at=now(),decision=decision||jsonb_build_object('via',p_via,'editado',body<>dr.suggestion) where id=dr.id;
  return jsonb_build_object('id',dr.id,'status','approved','name',coalesce(contact_name,'+'||dr.phone));
end $$;

create or replace function public.wa_draft_decide(p_id uuid,p_action text,p_text text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid;
begin
  perform public.wa_require_member(); select device_id into d from public.wa_drafts where id=p_id;
  if d is null then raise exception 'Rascunho não encontrado'; end if;
  if p_action='reject' then
    update public.wa_drafts set status='rejected',decided_at=now(),decided_by=auth.uid() where id=p_id and status='pending';
    if not found then raise exception 'Rascunho já foi decidido'; end if; return;
  end if;
  if p_action<>'approve' or btrim(coalesce(p_text,''))='' then raise exception 'Escreva a resposta antes de aprovar'; end if;
  perform public.wa__approve(d,p_id,p_text,'painel');
end $$;

create or replace function public.wa_draft_decide_device(p_token text,p_code text,p_action text,p_text text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); dr public.wa_drafts; n integer;
begin
 if p_code !~* '^[0-9a-f]{8,32}$' then raise exception 'Use o código atual com pelo menos oito caracteres';end if;
 select count(*) into n from public.wa_drafts where device_id=d and status='pending' and replace(id::text,'-','') like lower(p_code)||'%';
 if n<>1 then raise exception 'Código não encontrado, expirado ou ambíguo; consulte pendências';end if;
 select * into dr from public.wa_drafts where device_id=d and status='pending' and replace(id::text,'-','') like lower(p_code)||'%';
 if p_action='reject' then
   update public.wa_drafts set status='rejected',decided_at=now(),decision=decision||'{"via":"whatsapp"}' where id=dr.id and status='pending';
   if not found then raise exception 'Rascunho já foi decidido';end if;
   return jsonb_build_object('id',dr.id,'status','rejected');
 end if;
 if p_action<>'approve' then raise exception 'Ação inválida';end if;
 return public.wa__approve(d,dr.id,p_text,'whatsapp');
end $$;
create or replace function public.wa_drafts_pending(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from(
 select r.id,upper(left(replace(r.id::text,'-',''),8)) as code,r.phone,c.data->>'name' as name,r.inbound_body as body,r.suggestion,r.decision,r.created_at
 from public.wa_drafts r left join public.contacts c on c.id=r.contact_id where r.device_id=d and r.status='pending' order by r.created_at limit 30
 ) x;return result;
end $$;

alter function public.wa_can_send(text,uuid,uuid) rename to wa_can_send_legacy;
revoke all on function public.wa_can_send_legacy(text,uuid,uuid) from public,anon,authenticated;
create function public.wa_can_send(p_token text,p_id uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); m public.wa_messages; s public.wa_conversations; dev public.wa_devices; reason text;
begin
  if not public.wa_can_send_legacy(p_token,p_id,p_claim) then
    update public.wa_messages set status='uncertain',last_error=last_error||'; há partes confirmadas para conferir' where id=p_id and status='cancelled' and exists(select 1 from public.wa_message_parts where message_id=p_id);
    return false;
  end if;
  select * into m from public.wa_messages where id=p_id and device_id=d;
  s:=public.wa_state(d,m.phone);select * into dev from public.wa_devices where id=d;
  if s.owner='human' then reason:='Conversa assumida pelo administrador';
  elsif m.origin='followup' and not s.followup_allowed then reason:='Retornos não autorizados para a conversa';
  elsif m.context_version is not null and m.context_version<>s.version then reason:='Contexto mudou antes do envio';
  elsif m.origin in ('agent','followup') and (dev.agent_mode<>'live' or m.decision->>'policyVersion' is distinct from dev.policy_version or m.decision->>'schemaValidated' is distinct from 'true') then reason:='Política automática não permite envio';
  elsif m.origin in ('agent','followup') and not public.wa_in_hours() then reason:='Fora do horário: precisa reagendar';
  elsif m.origin in ('agent','followup') and (select count(*) from public.wa_messages x where x.device_id=d and public.wa_phone_key(x.phone)=s.phone_key and x.origin in ('agent','followup') and x.status in ('queued','sending','sent','uncertain') and (x.created_at,x.id)<=(m.created_at,m.id))>dev.auto_limit then reason:='Limite automático alterado antes do envio';
  end if;
  if reason is not null then update public.wa_messages set status=case when exists(select 1 from public.wa_message_parts where message_id=p_id) then 'uncertain' else 'cancelled' end,last_error=reason,updated_at=now() where id=p_id;return false;end if;
  return true;
end $$;

create function public.wa_part_record(p_token text,p_id uuid,p_claim uuid,p_index integer,p_body text,p_remote_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);
begin
  if not exists(select 1 from public.wa_messages where id=p_id and device_id=d and claim_token=p_claim) then raise exception 'Parte não pertence à execução'; end if;
  if nullif(p_remote_id,'') is null then raise exception 'Confirmação ausente'; end if;
  insert into public.wa_message_parts(message_id,part_index,body,remote_id) values(p_id,p_index,left(p_body,4000),p_remote_id) on conflict(message_id,part_index) do nothing;
end $$;

create function public.wa_commercial_profile(p_token text,p_phone text,p_profile jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); s public.wa_conversations;
begin
  if coalesce(p_profile->>'service','') not in ('presenca','agenda') or coalesce(p_profile->>'tier','') not in ('normal','acquisition')
    or jsonb_typeof(p_profile->'scope') is distinct from 'array' then raise exception 'Perfil precisa de serviço, faixa e módulos'; end if;
  if jsonb_array_length(p_profile->'scope')=0 then raise exception 'Liste os módulos'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_profile->'scope') v where v not in ('site','agendamento','recepcao','prontuario','fichas','configuracao','importacao','treinamento')) then raise exception 'Módulo fora do catálogo'; end if;
  s:=public.wa_state(d,p_phone);
  if s.quote is not null then raise exception 'Já existe proposta; mudança precisa de nova revisão de escopo'; end if;
  update public.wa_conversations set commercial_profile=p_profile||'{"scopeConfirmed":true}'::jsonb,version=version+1,updated_at=now() where device_id=d and phone_key=s.phone_key;
  update public.wa_drafts set status='superseded',decided_at=now() where device_id=d and public.wa_phone_key(phone)=s.phone_key and status='pending';
  return jsonb_build_object('phone',p_phone,'profile',p_profile);
end $$;

create function public.wa_admin_pause(p_token text,p_paused boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);
begin update public.wa_devices set paused=p_paused where id=d; end $$;
revoke all on function public.wa_admin_pause(text,boolean) from public,anon,authenticated;
grant execute on function public.wa_admin_pause(text,boolean) to anon;

create function public.wa_admin_status(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token); result jsonb;
begin
 select jsonb_build_object('device',jsonb_build_object('name',name,'status',status,'paused',paused,'mode',agent_mode,'autoLimit',auto_limit),
   'queued',(select count(*) from public.wa_messages where device_id=d and status='queued'),
   'uncertain',(select count(*) from public.wa_messages where device_id=d and status='uncertain'),
   'pending',(select count(*) from public.wa_drafts where device_id=d and status='pending'),
   'humanConversations',(select coalesce(jsonb_agg(jsonb_build_object('phone',phone,'reason',pause_reason)),'[]'::jsonb) from public.wa_conversations where device_id=d and owner='human')) into result from public.wa_devices where id=d;
 return result;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as sig,p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('wa_state','wa_reply_version','wa_policy_config','wa_conversation_control_device','wa_conversation_control','wa_manual_outbound','wa_in_hours','wa_part_record','wa_commercial_profile','wa_admin_status','wa_can_send') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.sig);
   if f.name='wa_conversation_control' then execute format('grant execute on function %s to authenticated',f.sig);
   elsif f.name not in ('wa_state','wa_reply_version','wa_in_hours') then execute format('grant execute on function %s to anon',f.sig);end if;
 end loop;
end $$;
commit;
