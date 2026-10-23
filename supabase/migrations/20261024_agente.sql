-- Agente de triagem em modo sombra. Aplicar depois de 20261023_whatsapp.sql.
-- O agente só sugere: nenhuma mensagem sai sem a aprovação de um membro da equipe,
-- e a aprovação passa por wa_schedule (bloqueios, duplicidade, interesse e horário).
begin;

create table public.wa_drafts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.wa_devices(id),
  contact_id text references public.contacts(id) on delete set null,
  phone text not null check (phone ~ '^[1-9][0-9]{9,14}$'),
  inbound_id text not null unique,
  inbound_body text not null,
  suggestion text not null default '',
  decision jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index wa_drafts_pending on public.wa_drafts(created_at) where status = 'pending';

alter table public.wa_drafts enable row level security;
revoke all on public.wa_drafts from anon, authenticated;
grant select on public.wa_drafts to authenticated;
create policy wa_drafts_read on public.wa_drafts for select to authenticated using (public.is_member());

-- Contexto para o agente: contato, bloqueio e as últimas 12 mensagens da conversa.
create function public.wa_agent_context(p_token text, p_phone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); k text := public.wa_phone_key(p_phone);
        cid text; cstatus text; cdata jsonb; hist jsonb;
begin
  select ct.id, ct.status, ct.data into cid, cstatus, cdata from public.contacts ct
    where ct.id = (select m.contact_id from public.wa_messages m where m.device_id=d and public.wa_phone_key(m.phone)=k and m.contact_id is not null order by m.created_at desc limit 1);
  select coalesce(jsonb_agg(jsonb_build_object('de',t.de,'texto',t.texto,'em',t.em) order by t.em),'[]'::jsonb) into hist from (
    select * from (
      select 'eu'::text as de, m.body as texto, coalesce(m.sent_at,m.created_at) as em from public.wa_messages m
        where m.device_id=d and public.wa_phone_key(m.phone)=k and m.status='sent'
      union all
      select 'cliente', r.body, r.received_at from public.wa_replies r where r.device_id=d and public.wa_phone_key(r.phone)=k
    ) u order by u.em desc limit 12) t;
  return jsonb_build_object(
    'contact', case when cid is null then null else jsonb_build_object('id',cid,'name',cdata->>'name','category',cdata->>'category','price',cdata->>'price','status',cstatus) end,
    'blocked', exists(select 1 from public.wa_blocks b where public.wa_phone_key(b.phone)=k),
    'history', hist);
end $$;

-- Idempotente por mensagem recebida; só aceita números que este computador já contatou.
create function public.wa_draft_create(p_token text, p_inbound_id text, p_phone text, p_inbound_body text, p_suggestion text, p_decision jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); k text := public.wa_phone_key(p_phone); cid text; new_id uuid;
begin
  if not exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=k) then
    raise exception 'Contato não pertence a este computador';
  end if;
  select contact_id into cid from public.wa_messages where device_id=d and public.wa_phone_key(phone)=k and contact_id is not null order by created_at desc limit 1;
  insert into public.wa_drafts(device_id,contact_id,phone,inbound_id,inbound_body,suggestion,decision)
  values (d,cid,p_phone,left(p_inbound_id,250),left(p_inbound_body,4000),left(coalesce(p_suggestion,''),1500),coalesce(p_decision,'{}'::jsonb))
  on conflict (inbound_id) do nothing returning id into new_id;
  return new_id;
end $$;

create function public.wa_draft_decide(p_id uuid, p_action text, p_text text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare dr public.wa_drafts; contact_name text;
begin
  perform public.wa_require_member();
  select * into dr from public.wa_drafts where id=p_id for update;
  if dr.id is null then raise exception 'Rascunho não encontrado'; end if;
  if dr.status <> 'pending' then raise exception 'Este rascunho já foi decidido'; end if;
  if p_action = 'reject' then
    update public.wa_drafts set status='rejected', decided_at=now(), decided_by=auth.uid() where id=p_id;
    return;
  end if;
  if p_action <> 'approve' then raise exception 'Ação inválida'; end if;
  if btrim(coalesce(p_text,'')) = '' then raise exception 'Escreva a resposta antes de aprovar'; end if;
  select data->>'name' into contact_name from public.contacts where id=dr.contact_id;
  perform public.wa_schedule(gen_random_uuid(), dr.device_id, dr.contact_id, dr.phone, coalesce(contact_name,'+'||dr.phone), p_text, now());
  update public.wa_drafts set status='approved', decided_at=now(), decided_by=auth.uid() where id=p_id;
end $$;

revoke all on function public.wa_agent_context(text,text), public.wa_draft_create(text,text,text,text,text,jsonb), public.wa_draft_decide(uuid,text,text) from public, anon, authenticated;
grant execute on function public.wa_agent_context(text,text), public.wa_draft_create(text,text,text,text,text,jsonb) to anon;
grant execute on function public.wa_draft_decide(uuid,text,text) to authenticated;

commit;
