-- Painel Indexa + executor local. Aplicar depois de supabase/schema.sql.
-- Nenhuma mensagem é criada por esta migração.
begin;

create table public.wa_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  token_hash text not null,
  enabled boolean not null default true,
  paused boolean not null default false,
  interval_seconds integer not null default 60 check (interval_seconds between 30 and 3600),
  status text not null default 'offline',
  heartbeat_at timestamptz,
  last_claim_at timestamptz,
  qr text,
  last_error text,
  created_at timestamptz not null default now()
);
create table public.wa_messages (
  id uuid primary key,
  device_id uuid not null references public.wa_devices(id),
  contact_id text references public.contacts(id) on delete set null,
  phone text not null check (phone ~ '^[1-9][0-9]{9,14}$'),
  name text not null check (length(name) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  scheduled_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','uncertain','cancelled')),
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  remote_id text,
  last_error text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wa_due on public.wa_messages(device_id, scheduled_at) where status = 'queued';
create index wa_phone on public.wa_messages(phone);
create table public.wa_blocks (
  phone text primary key check (phone ~ '^[1-9][0-9]{9,14}$'),
  reason text not null default 'Não contatar',
  created_at timestamptz not null default now()
);
create table public.wa_replies (
  id text primary key,
  device_id uuid not null references public.wa_devices(id),
  phone text not null,
  body text not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.wa_devices enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_blocks enable row level security;
alter table public.wa_replies enable row level security;
revoke all on public.wa_devices, public.wa_messages, public.wa_blocks, public.wa_replies from anon, authenticated;
grant select(id,name,enabled,paused,interval_seconds,status,heartbeat_at,qr,last_error,created_at) on public.wa_devices to authenticated;
grant select on public.wa_messages, public.wa_blocks, public.wa_replies to authenticated;
create policy wa_devices_read on public.wa_devices for select to authenticated using (public.is_member());
create policy wa_messages_read on public.wa_messages for select to authenticated using (public.is_member());
create policy wa_blocks_read on public.wa_blocks for select to authenticated using (public.is_member());
create policy wa_replies_read on public.wa_replies for select to authenticated using (public.is_member());

-- O WhatsApp pode identificar celulares brasileiros com ou sem o nono dígito.
create function public.wa_phone_key(p_phone text) returns text language sql immutable set search_path=public,pg_temp as $$
  select case when left(p_phone,2)='55' and length(p_phone)=13 and substring(p_phone from 5 for 1)='9' then left(p_phone,4)||substring(p_phone from 6) else p_phone end;
$$;

create function public.wa_require_member() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_member() then raise exception 'Acesso restrito à equipe'; end if;
end $$;
create function public.wa_device_id(p_token text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid;
begin
  if length(p_token) <> 64 then raise exception 'Computador não autorizado'; end if;
  select id into d from public.wa_devices where enabled and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if d is null then raise exception 'Computador não autorizado'; end if;
  return d;
end $$;

create function public.wa_create_device(p_name text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''); d uuid;
begin
  perform public.wa_require_member();
  insert into public.wa_devices(name,token_hash) values (btrim(p_name),encode(sha256(convert_to(t,'UTF8')),'hex')) returning id into d;
  return jsonb_build_object('id',d,'token',t);
end $$;

create function public.wa_control_device(p_id uuid,p_paused boolean,p_interval integer,p_enabled boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.wa_require_member();
  update public.wa_devices set paused=p_paused,interval_seconds=p_interval,enabled=p_enabled,
    qr=case when p_enabled then qr else null end where id=p_id;
  if not found then raise exception 'Computador não encontrado'; end if;
  if not p_enabled then
    update public.wa_messages set status='cancelled',last_error='Computador revogado',updated_at=now() where device_id=p_id and status='queued';
  end if;
end $$;

create function public.wa_schedule(p_id uuid,p_device_id uuid,p_contact_id text,p_phone text,p_name text,p_body text,p_scheduled_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.wa_require_member();
  if exists(select 1 from public.wa_messages where id=p_id) then
    if not exists(select 1 from public.wa_messages where id=p_id and device_id=p_device_id and phone=p_phone and body=p_body and scheduled_at=p_scheduled_at) then
      raise exception 'Identificador de agendamento já utilizado';
    end if;
    return p_id;
  end if;
  if not exists(select 1 from public.wa_devices where id=p_device_id and enabled) then raise exception 'Computador não disponível'; end if;
  if exists(select 1 from public.wa_blocks where public.wa_phone_key(phone)=public.wa_phone_key(p_phone)) then raise exception 'Contato está na lista de não contatar'; end if;
  if exists(select 1 from public.contacts where id=p_contact_id and status in ('Sem interesse','Não compensa')) then raise exception 'Contato marcado sem interesse ou não compensa'; end if;
  if p_scheduled_at < now() - interval '2 minutes' or p_scheduled_at > now() + interval '1 year' then raise exception 'Escolha um horário futuro, até um ano'; end if;
  if p_body ~ '\{[^}]+\}' then raise exception 'Preencha os campos da mensagem antes de agendar'; end if;
  -- Dois cliques/abas não criam o mesmo envio no mesmo minuto.
  perform pg_advisory_xact_lock(hashtextextended(public.wa_phone_key(p_phone),0));
  if exists(select 1 from public.wa_messages where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and body=p_body and status in ('queued','sending','sent','uncertain') and abs(extract(epoch from scheduled_at-p_scheduled_at)) < 60) then
    raise exception 'Esta mensagem já está agendada para esse contato neste horário';
  end if;
  insert into public.wa_messages(id,device_id,contact_id,phone,name,body,scheduled_at,created_by)
  values(p_id,p_device_id,p_contact_id,p_phone,btrim(p_name),btrim(p_body),p_scheduled_at,auth.uid());
  return p_id;
end $$;

create function public.wa_cancel(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.wa_require_member();
  update public.wa_messages set status='cancelled',last_error='Cancelada no painel',updated_at=now() where id=p_id and status='queued';
  if not found then raise exception 'Só mensagens ainda na fila podem ser canceladas'; end if;
end $$;

create function public.wa_block(p_phone text,p_blocked boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.wa_require_member();
  if p_blocked then
    insert into public.wa_blocks(phone) values(p_phone) on conflict do nothing;
    update public.wa_messages set status='cancelled',last_error='Contato bloqueado no painel',updated_at=now() where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and status='queued';
  else delete from public.wa_blocks where public.wa_phone_key(phone)=public.wa_phone_key(p_phone);
  end if;
end $$;

create function public.wa_heartbeat(p_token text,p_status text,p_qr text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); result jsonb;
begin
  if p_status not in ('offline','starting','qr','authenticated','ready','error') or length(p_qr)>200000 then raise exception 'Estado inválido'; end if;
  update public.wa_devices set heartbeat_at=now(),status=p_status,qr=case when p_status='qr' then p_qr else null end,last_error=left(p_error,500) where id=d;
  update public.wa_messages set status='uncertain',last_error='Execução interrompida. Confira o WhatsApp antes de reagendar.',updated_at=now()
    where device_id=d and status='sending' and claimed_at < now()-interval '5 minutes';
  select jsonb_build_object('id',id,'paused',paused,'interval_seconds',interval_seconds,'watched',coalesce((select jsonb_agg(distinct phone) from public.wa_messages where device_id=d),'[]'::jsonb)) into result from public.wa_devices where id=d;
  return result;
end $$;

create function public.wa_claim(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); device public.wa_devices; job public.wa_messages;
begin
  select * into device from public.wa_devices where id=d for update;
  if device.paused or device.status <> 'ready' or device.heartbeat_at < now()-interval '1 minute' or device.last_claim_at > now()-make_interval(secs=>device.interval_seconds) then return null; end if;
  if exists(select 1 from public.wa_messages where device_id=d and status='sending') then return null; end if;
  -- Não dispara uma fila vencida de madrugada depois de o computador religar.
  update public.wa_messages set status='cancelled',last_error='Horário vencido há mais de uma hora; reagende no painel',updated_at=now()
    where device_id=d and status='queued' and scheduled_at < now()-interval '1 hour';
  update public.wa_messages m set status='cancelled',last_error='Contato bloqueado ou sem interesse',updated_at=now()
    where m.device_id=d and m.status='queued' and (exists(select 1 from public.wa_blocks b where public.wa_phone_key(b.phone)=public.wa_phone_key(m.phone)) or exists(select 1 from public.contacts c where c.id=m.contact_id and c.status in ('Sem interesse','Não compensa')));
  select * into job from public.wa_messages where device_id=d and status='queued' and scheduled_at<=now() order by scheduled_at,created_at for update skip locked limit 1;
  if job.id is null then return null; end if;
  update public.wa_devices set last_claim_at=now() where id=d;
  update public.wa_messages set status='sending',claim_token=gen_random_uuid(),claimed_at=now(),updated_at=now() where id=job.id returning * into job;
  return to_jsonb(job);
end $$;

-- Última conferência, imediatamente antes de chamar sendMessage.
create function public.wa_can_send(p_token text,p_id uuid,p_claim uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); job public.wa_messages;
begin
  select * into job from public.wa_messages where id=p_id and device_id=d and claim_token=p_claim and status='sending';
  if job.id is null then return false; end if;
  if exists(select 1 from public.wa_devices where id=d and paused)
    or exists(select 1 from public.wa_blocks where public.wa_phone_key(phone)=public.wa_phone_key(job.phone))
    or exists(select 1 from public.contacts where id=job.contact_id and status in ('Sem interesse','Não compensa'))
    or exists(select 1 from public.wa_replies where public.wa_phone_key(phone)=public.wa_phone_key(job.phone) and received_at>=job.created_at) then
    update public.wa_messages set status='cancelled',last_error='Pausa, resposta ou bloqueio antes do envio',updated_at=now() where id=p_id;
    return false;
  end if;
  return true;
end $$;

create function public.wa_finish(p_token text,p_id uuid,p_claim uuid,p_status text,p_remote_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); job public.wa_messages;
begin
  if p_status not in ('sent','failed','uncertain') then raise exception 'Resultado inválido'; end if;
  select * into job from public.wa_messages where id=p_id and device_id=d and claim_token=p_claim for update;
  if job.id is null then raise exception 'Envio não pertence a este computador'; end if;
  -- A conferência pode ter cancelado o envio e perdido a resposta HTTP.
  if job.status='cancelled' then return; end if;
  if job.status=p_status then return; end if;
  if job.status not in ('sending','uncertain') then raise exception 'Envio já encerrado'; end if;
  if p_status='sent' and nullif(p_remote_id,'') is null then raise exception 'Confirmação do WhatsApp ausente'; end if;
  update public.wa_messages set status=p_status,remote_id=left(p_remote_id,250),last_error=left(p_error,500),sent_at=case when p_status='sent' then now() else null end,updated_at=now() where id=p_id;
  if p_status='sent' and job.contact_id is not null then
    update public.contacts set
      status=case when status='A enviar' then 'Aguardando resposta' else status end,
      data=data || jsonb_build_object('sentAt',now(),'history',coalesce(data->'history','[]'::jsonb) || jsonb_build_array(jsonb_build_object('type','sent','text','WhatsApp enviado pelo agendamento','actor','Automação','at',now(),'messageId',p_id))),
      updated_by='Automação' where id=job.contact_id;
  end if;
end $$;

create function public.wa_reply(p_token text,p_id text,p_phone text,p_body text,p_received_at timestamptz,p_optout boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token);
begin
  -- Só sincroniza respostas de contatos com agendamentos neste executor.
  if not exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=public.wa_phone_key(p_phone)) then return; end if;
  insert into public.wa_replies(id,device_id,phone,body,received_at) values(left(p_id,250),d,p_phone,left(p_body,4000),p_received_at) on conflict do nothing;
  if not found then return; end if;
  update public.wa_messages set status='cancelled',last_error='Contato respondeu; acompanhe a conversa antes de reagendar',updated_at=now()
    where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and status='queued' and created_at<=p_received_at;
  if p_optout then
    insert into public.wa_blocks(phone,reason) values(p_phone,'Pediu para não receber mensagens') on conflict do nothing;
    update public.wa_messages set status='cancelled',last_error='Contato pediu para não receber mensagens',updated_at=now() where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and status='queued';
  end if;
  update public.contacts c set status=case when p_optout then 'Sem interesse' when status in ('A enviar','Aguardando resposta') then 'Respondeu' else status end,
    data=data || jsonb_build_object('respondedAt',p_received_at,'history',coalesce(data->'history','[]'::jsonb) || jsonb_build_array(jsonb_build_object('type','reply','text','Respondeu no WhatsApp: ' || left(p_body,500),'actor','Contato','at',p_received_at))),updated_by='Automação'
    where c.id in (select distinct contact_id from public.wa_messages where public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and contact_id is not null);
end $$;

-- Funções definer não ficam executáveis por PUBLIC. O executor só usa RPCs
-- limitadas pelo token revogável, nunca uma chave service_role.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature, p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wa\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.name in ('wa_create_device','wa_control_device','wa_schedule','wa_cancel','wa_block') then
      execute format('grant execute on function %s to authenticated',f.signature);
    elsif f.name in ('wa_heartbeat','wa_claim','wa_can_send','wa_finish','wa_reply') then
      execute format('grant execute on function %s to anon',f.signature);
    end if;
  end loop;
end $$;
commit;
