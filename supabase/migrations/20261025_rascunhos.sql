-- Uma sugestão por conversa: rascunho novo do mesmo contato substitui o anterior ainda pendente.
begin;

alter table public.wa_drafts drop constraint if exists wa_drafts_status_check;
alter table public.wa_drafts add constraint wa_drafts_status_check check (status in ('pending','approved','rejected','superseded'));

create or replace function public.wa_draft_create(p_token text, p_inbound_id text, p_phone text, p_inbound_body text, p_suggestion text, p_decision jsonb)
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
  if new_id is not null then
    update public.wa_drafts set status='superseded', decided_at=now()
      where public.wa_phone_key(phone)=k and status='pending' and id<>new_id;
  end if;
  return new_id;
end $$;

revoke all on function public.wa_draft_create(text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.wa_draft_create(text,text,text,text,text,jsonb) to anon;

commit;
