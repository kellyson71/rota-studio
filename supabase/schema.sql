create table if not exists public.members (
  email text primary key,
  name text not null
);

create table if not exists public.contacts (
  id text primary key,
  kind text not null default 'private',
  status text not null default 'A enviar',
  owner text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.projects (
  id text primary key,
  status text not null default 'Em andamento',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists contacts_status_idx on public.contacts (status);
create index if not exists contacts_kind_idx on public.contacts (kind);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where email = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts for each row execute function public.touch();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch();

alter table public.members enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;

revoke all on public.members, public.contacts, public.projects from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.contacts, public.projects to authenticated;
grant execute on function public.is_member() to authenticated;

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member());

drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects for all to authenticated using (public.is_member()) with check (public.is_member());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contacts') then
    alter publication supabase_realtime add table public.contacts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'projects') then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;

insert into public.members (email, name) values ('kellyson@rota-studio.app', 'Kellyson'), ('jeyce@rota-studio.app', 'Jeyce')
on conflict (email) do nothing;

create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.inbound (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 8 and 40),
  need text check (char_length(need) <= 1000),
  kind text check (char_length(kind) <= 60),
  created_at timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.inbound enable row level security;

revoke all on public.settings, public.inbound from anon;
grant select, insert, update on public.settings to authenticated;
grant select, delete on public.inbound to authenticated;
grant insert (name, phone, need, kind) on public.inbound to anon, authenticated;

drop policy if exists settings_all on public.settings;
create policy settings_all on public.settings for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists inbound_read on public.inbound;
create policy inbound_read on public.inbound for select to authenticated using (public.is_member());
drop policy if exists inbound_delete on public.inbound;
create policy inbound_delete on public.inbound for delete to authenticated using (public.is_member());
drop policy if exists inbound_insert on public.inbound;
create policy inbound_insert on public.inbound for insert to anon, authenticated with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;

insert into public.settings (id, data, updated_by) values ('config', '{"weeklyGoal": {"Kellyson": 8, "Jeyce": 8}, "returnDays": 3, "followupDays": 5}', 'importação')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inbound') then
    alter publication supabase_realtime add table public.inbound;
  end if;
end $$;
