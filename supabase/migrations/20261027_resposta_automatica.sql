-- Resposta automática do agente nos casos seguros. Aprovar pelo WhatsApp e enviar automaticamente
-- usam a mesma função interna, com as mesmas travas (bloqueio, sem interesse, campos, computador ativo).
begin;

create function public.wa__approve(p_device uuid, p_id uuid, p_text text, p_via text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare dr public.wa_drafts; body text; contact_name text; contact_status text;
begin
  select * into dr from public.wa_drafts where id=p_id and device_id=p_device for update;
  if dr.id is null then raise exception 'Rascunho não encontrado'; end if;
  if dr.status <> 'pending' then raise exception 'Rascunho já foi decidido'; end if;
  body := btrim(coalesce(nullif(btrim(coalesce(p_text,'')),''), dr.suggestion));
  if body = '' then raise exception 'Rascunho % não tem sugestão; use: edita % seu texto', upper(left(replace(p_id::text,'-',''),4)), upper(left(replace(p_id::text,'-',''),4)); end if;
  if length(body) > 4000 then raise exception 'Texto longo demais'; end if;
  if body ~ '\{[^}]+\}' then raise exception 'Preencha os campos entre chaves antes de aprovar'; end if;
  if exists(select 1 from public.wa_blocks b where public.wa_phone_key(b.phone)=public.wa_phone_key(dr.phone)) then raise exception 'Contato está na lista de não contatar'; end if;
  select c.data->>'name', c.status into contact_name, contact_status from public.contacts c where c.id=dr.contact_id;
  if contact_status in ('Sem interesse','Não compensa') then raise exception 'Contato marcado sem interesse ou não compensa'; end if;
  if not exists(select 1 from public.wa_devices where id=p_device and enabled) then raise exception 'Computador não disponível'; end if;
  insert into public.wa_messages(id,device_id,contact_id,phone,name,body,scheduled_at,created_by)
  values (gen_random_uuid(), p_device, dr.contact_id, dr.phone, coalesce(contact_name,'+'||dr.phone), body, now(), p_device);
  update public.wa_drafts set status='approved', decided_at=now(), decision=decision || jsonb_build_object('via',p_via,'editado', body <> dr.suggestion) where id=dr.id;
  return jsonb_build_object('id',dr.id,'status','approved','name',coalesce(contact_name,'+'||dr.phone));
end $$;

create or replace function public.wa_draft_decide_device(p_token text, p_code text, p_action text, p_text text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid := public.wa_device_id(p_token); dr public.wa_drafts; n int;
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
  select * into dr from public.wa_drafts where device_id=d and status='pending' and replace(id::text,'-','') like lower(p_code)||'%';
  if p_action = 'reject' then
    update public.wa_drafts set status='rejected', decided_at=now(), decision=decision || '{"via":"whatsapp"}' where id=dr.id;
    return jsonb_build_object('id',dr.id,'status','rejected');
  end if;
  if p_action <> 'approve' then raise exception 'Ação inválida'; end if;
  return public.wa__approve(d, dr.id, p_text, 'whatsapp');
end $$;

-- Envio automático de um rascunho que o próprio agente acabou de criar.
create function public.wa_draft_autosend(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return public.wa__approve(public.wa_device_id(p_token), p_id, null, 'agente');
end $$;

-- Contexto ganha a contagem de respostas automáticas já enviadas para o contato (limite no executor).
create or replace function public.wa_agent_context(p_token text, p_phone text) returns jsonb
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
    'autoCount', (select count(*) from public.wa_drafts r where r.device_id=d and public.wa_phone_key(r.phone)=k and r.status='approved' and r.decision->>'via'='agente'),
    'history', hist);
end $$;

revoke all on function public.wa__approve(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.wa_draft_decide_device(text,text,text,text), public.wa_draft_autosend(text,uuid), public.wa_agent_context(text,text) from public, anon, authenticated;
grant execute on function public.wa_draft_decide_device(text,text,text,text), public.wa_draft_autosend(text,uuid), public.wa_agent_context(text,text) to anon;

commit;
