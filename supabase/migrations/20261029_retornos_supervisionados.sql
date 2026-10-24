begin;
alter table public.wa_conversations add column if not exists followup_allowed boolean not null default false;
create table public.wa_followups (
 device_id uuid not null references public.wa_devices(id),phone_key text not null,
 anchor_id uuid not null references public.wa_messages(id),step integer not null check(step in (1,2)),
 message_id uuid references public.wa_messages(id),created_at timestamptz not null default now(),
 primary key(device_id,phone_key,anchor_id,step)
);
alter table public.wa_followups enable row level security;
revoke all on public.wa_followups from public,anon,authenticated;
grant select on public.wa_followups to authenticated;
create policy wa_followups_read on public.wa_followups for select to authenticated using(public.is_member());

create function public.wa_followup_permission(p_token text,p_phone text,p_allowed boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);s public.wa_conversations;
begin
 s:=public.wa_state(d,p_phone);
 if p_allowed and s.last_inbound_id is null then raise exception 'Contato ainda não abriu uma conversa; primeiro contato exige revisão';end if;
 update public.wa_conversations set followup_allowed=p_allowed where device_id=d and phone_key=s.phone_key;
 if not p_allowed then update public.wa_messages set status='cancelled',last_error='Retornos desativados pelo administrador' where device_id=d and public.wa_phone_key(phone)=s.phone_key and origin='followup' and status='queued';end if;
end $$;
create function public.wa_business_elapsed(p_start date,p_end date,p_holidays date[]) returns integer language sql immutable set search_path=public,pg_temp as $$
 select count(*)::integer from generate_series(1,greatest(p_end-p_start,0)) n
 where extract(isodow from p_start+n) between 1 and 5 and not (p_start+n)=any(coalesce(p_holidays,'{}'));
$$;
create function public.wa_followups_prepare(p_token text,p_holidays date[] default '{}') returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);dev public.wa_devices;s public.wa_conversations;anchor public.wa_messages;
 n integer;last_step integer;next_step integer;mid uuid;body text;made integer:=0;
begin
 select * into dev from public.wa_devices where id=d for update;
 if dev.paused or dev.agent_mode<>'live' or not public.wa_in_hours() then return 0;end if;
 for s in select * from public.wa_conversations where device_id=d and followup_allowed and owner='auto' and last_inbound_id is not null for update skip locked loop
   if exists(select 1 from public.wa_blocks where public.wa_phone_key(phone)=s.phone_key)
     or exists(select 1 from public.wa_messages m join public.contacts c on c.id=m.contact_id where m.device_id=d and public.wa_phone_key(m.phone)=s.phone_key and c.status in ('Sem interesse','Não compensa','Fechado'))
     or exists(select 1 from public.wa_messages where device_id=d and public.wa_phone_key(phone)=s.phone_key and status in ('queued','sending')) then continue;end if;
   select * into anchor from public.wa_messages where device_id=d and public.wa_phone_key(phone)=s.phone_key and status='sent' and origin<>'followup' and sent_at>=s.last_inbound_at order by sent_at desc limit 1;
   if anchor.id is null or exists(select 1 from public.wa_manual_messages where device_id=d and public.wa_phone_key(phone)=s.phone_key and sent_at>anchor.sent_at) then continue;end if;
   select coalesce(max(step),0) into last_step from public.wa_followups where device_id=d and phone_key=s.phone_key and anchor_id=anchor.id;
   if last_step>=2 then continue;end if;
   n:=public.wa_business_elapsed((anchor.sent_at at time zone 'America/Fortaleza')::date,(now() at time zone 'America/Fortaleza')::date,p_holidays);
   if n<3 or (last_step=1 and n<7) then continue;end if;
   next_step:=case when n>=7 then 2 else 1 end;
   -- Retorno muito antigo é encerrado; não dispara uma campanha vencida ao religar o PC.
   if n>8 then insert into public.wa_followups(device_id,phone_key,anchor_id,step) values(d,s.phone_key,anchor.id,2) on conflict do nothing;continue;end if;
   if next_step=last_step or (select count(*) from public.wa_messages where device_id=d and public.wa_phone_key(phone)=s.phone_key and origin in ('agent','followup') and status in ('queued','sending','sent','uncertain'))>=dev.auto_limit then continue;end if;
   body:=case when next_step=2 then 'Vou encerrar o retorno por aqui. Se quiser retomar o projeto depois, pode me chamar.'
     when s.quote is not null then 'Ficou alguma dúvida sobre o escopo ou as formas de pagamento da proposta? Posso explicar por aqui.'
     else 'Ficou alguma dúvida sobre o que conversamos? Se fizer sentido retomar, posso explicar por aqui.' end;
   perform public.wa_text_check(body);mid:=gen_random_uuid();
   insert into public.wa_messages(id,device_id,contact_id,phone,name,body,scheduled_at,created_by,origin,context_version,decision)
     values(mid,d,anchor.contact_id,s.phone,anchor.name,body,now(),d,'followup',s.version,jsonb_build_object('policyVersion',dev.policy_version,'schemaValidated',true,'final','send','step',next_step));
   insert into public.wa_followups(device_id,phone_key,anchor_id,step,message_id) values(d,s.phone_key,anchor.id,next_step,mid);
   made:=made+1;
   if made>=20 then exit;end if;
 end loop;
 return made;
end $$;
-- Limite único para respostas e retornos, revalidado pelo mesmo despachante.
-- O contexto usa a função anterior para manter uma única fonte do histórico e da versão.
alter function public.wa_agent_context(text,text) rename to wa_agent_context_v1;
revoke all on function public.wa_agent_context_v1(text,text) from public,anon,authenticated;
create function public.wa_agent_context(p_token text,p_phone text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid:=public.wa_device_id(p_token);ctx jsonb;
begin
 ctx:=public.wa_agent_context_v1(p_token,p_phone);
 return ctx||jsonb_build_object('autoCount',(select count(*) from public.wa_messages where device_id=d and public.wa_phone_key(phone)=public.wa_phone_key(p_phone) and origin in ('agent','followup') and status in ('queued','sending','sent','uncertain')));
end $$;
revoke all on function public.wa_followup_permission(text,text,boolean),public.wa_followups_prepare(text,date[]),public.wa_business_elapsed(date,date,date[]),public.wa_agent_context(text,text) from public,anon,authenticated;
grant execute on function public.wa_followup_permission(text,text,boolean),public.wa_followups_prepare(text,date[]),public.wa_agent_context(text,text) to anon;
commit;
