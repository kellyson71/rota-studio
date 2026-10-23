-- Aprovação pelo WhatsApp do dono: o executor lista os rascunhos pendentes e decide pelo código curto.
-- Quem pode mandar o comando é verificado no executor (só o número do dono configurado no PC).
begin;

-- Rascunhos pendentes deste computador, para lembretes.
create function public.wa_drafts_pending(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', upper(left(replace(r.id::text,'-',''),4)), 'phone', r.phone,
      'name', coalesce((select c.data->>'name' from public.contacts c where c.id=r.contact_id), '+'||r.phone),
      'inbound', r.inbound_body, 'suggestion', r.suggestion, 'decision', r.decision, 'created_at', r.created_at)
    order by r.created_at)
    from public.wa_drafts r where r.device_id=d and r.status='pending'), '[]'::jsonb);
end $$;

-- Decide pelo código de 4 caracteres (início do id). Aprovar coloca na fila com as mesmas travas de wa_schedule.
create function public.wa_draft_decide_device(p_token text, p_code text, p_action text, p_text text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); dr public.wa_drafts; n int; body text; contact_name text; contact_status text;
begin
  if p_code !~* '^[0-9a-f]{4,32}$' then raise exception 'Código inválido'; end if;
  -- Procura entre os pendentes; os já decididos só servem para explicar por que não dá mais.
  select count(*) into n from public.wa_drafts where device_id=d and status='pending' and replace(id::text,'-','') like lower(p_code)||'%';
  if n > 1 then raise exception 'Código % ambíguo; use mais caracteres', upper(p_code); end if;
  if n = 0 then
    select * into dr from public.wa_drafts where device_id=d and replace(id::text,'-','') like lower(p_code)||'%' order by created_at desc limit 1;
    if dr.id is null then raise exception 'Rascunho % não encontrado', upper(p_code); end if;
    raise exception 'Rascunho % já foi %', upper(p_code), case dr.status when 'approved' then 'aprovado' when 'rejected' then 'descartado' else 'substituído por um mais novo' end;
  end if;
  select * into dr from public.wa_drafts where device_id=d and status='pending' and replace(id::text,'-','') like lower(p_code)||'%' for update;
  if p_action = 'reject' then
    update public.wa_drafts set status='rejected', decided_at=now(), decision=decision || '{"via":"whatsapp"}' where id=dr.id;
    return jsonb_build_object('id',dr.id,'status','rejected');
  end if;
  if p_action <> 'approve' then raise exception 'Ação inválida'; end if;
  body := btrim(coalesce(nullif(btrim(coalesce(p_text,'')),''), dr.suggestion));
  if body = '' then raise exception 'Rascunho % não tem sugestão; use: edita % seu texto', upper(p_code), upper(p_code); end if;
  if length(body) > 4000 then raise exception 'Texto longo demais'; end if;
  if body ~ '\{[^}]+\}' then raise exception 'Preencha os campos entre chaves antes de aprovar'; end if;
  if exists(select 1 from public.wa_blocks b where public.wa_phone_key(b.phone)=public.wa_phone_key(dr.phone)) then raise exception 'Contato está na lista de não contatar'; end if;
  select c.data->>'name', c.status into contact_name, contact_status from public.contacts c where c.id=dr.contact_id;
  if contact_status in ('Sem interesse','Não compensa') then raise exception 'Contato marcado sem interesse ou não compensa'; end if;
  if not exists(select 1 from public.wa_devices where id=d and enabled) then raise exception 'Computador não disponível'; end if;
  insert into public.wa_messages(id,device_id,contact_id,phone,name,body,scheduled_at,created_by)
  values (gen_random_uuid(), d, dr.contact_id, dr.phone, coalesce(contact_name,'+'||dr.phone), body, now(), d);
  update public.wa_drafts set status='approved', decided_at=now(), decision=decision || jsonb_build_object('via','whatsapp','editado', body <> dr.suggestion) where id=dr.id;
  return jsonb_build_object('id',dr.id,'status','approved','name',coalesce(contact_name,'+'||dr.phone));
end $$;

revoke all on function public.wa_drafts_pending(text), public.wa_draft_decide_device(text,text,text,text) from public, anon, authenticated;
grant execute on function public.wa_drafts_pending(text), public.wa_draft_decide_device(text,text,text,text) to anon;

commit;
