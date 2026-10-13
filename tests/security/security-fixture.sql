-- Synthetic schema only. No production rows or credentials.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema data;
create schema raw;
create schema extensions;
grant usage on schema public, auth, data, extensions to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', deleted_at timestamptz);
create extension vector;
create table public.allowed_domains(domain text);
create table public.roles(id integer primary key, code text, description text);
create table public.user_roles(user_id uuid primary key, role_id integer);
create table public.source_configs(id uuid, source_key text);
create table public.permissions(id uuid primary key, name text, code text unique);
create table public.user_permissions(id uuid default gen_random_uuid(), user_id uuid, permission_id uuid, unique(user_id,permission_id));
create table public.support_directory_sections(id uuid primary key, title text);
create table public.support_directory_entries(id uuid primary key, title text);
create table public.support_directory_entry_contacts(id uuid primary key, title text);
create table public.wiki_nodes(id uuid primary key, parent_id uuid, status text);
create table public.wiki_assets(id uuid, node_id uuid, status text);
create table public.knowledge_sources(id uuid primary key, source_type text, source_id text, title text, url text, metadata jsonb default '{}', status text);
create table public.knowledge_chunks(id uuid primary key, source_id uuid, content text, metadata jsonb default '{}', embedding vector(3));
create table raw.production_data(id integer, amount numeric);
create table raw.divisions(id integer);
create table raw.branches(id integer);
create table raw.employees(id integer);
create table raw.corporate_turn_times(id integer);
create table raw.file_quality_data(id integer);
create table raw.specialist_points_old(id integer);
create table raw.specialist_points_new(id integer);
create table raw.processing_assistant_orgs(id integer);
create table raw.underwriting_orgs(id integer);
create table raw.sync_runs(id integer);
create table raw.source_payloads(id integer, payload jsonb);
create view data.production_data as select * from raw.production_data;
create view data.current_month_branch_summary as select sum(amount) as volume from data.production_data;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all tables in schema raw to service_role;
grant select on all tables in schema data to anon, authenticated, service_role;
-- Mirror the permissive legacy policies so tests prove restrictive gates win.
do $$ declare name text; begin
  foreach name in array array['permissions','user_permissions','support_directory_sections','support_directory_entries','support_directory_entry_contacts'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('create policy legacy_allow on public.%I for all to authenticated using (true) with check (true)', name);
  end loop;
end $$;

create function public.user_has_permission_code(p_user_id uuid,p_code text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_permissions up join public.permissions p on p.id=up.permission_id where up.user_id=p_user_id and p.code=p_code);
$$;
create function public.get_current_user_role_code() returns text language sql stable security definer set search_path=public as $$
 select coalesce((select r.code from public.roles r join public.user_roles ur on r.id=ur.role_id where ur.user_id=auth.uid()),'employee');
$$;
create function public.list_permission_users() returns table(permission_id uuid,user_id uuid,email text,full_name text)
language sql security definer set search_path=public as $$
 select up.permission_id,up.user_id,u.email,u.email from public.user_permissions up join auth.users u on u.id=up.user_id;
$$;
create function public.list_permission_directory_users() returns table(user_id uuid,email text,full_name text)
language sql security definer set search_path=public as $$
 select id,email,email from auth.users;
$$;
create function public.list_canopy_users_simple() returns table(full_name text,email text,role text)
language sql security definer set search_path=public as $$
 select email,email,'employee'::text from auth.users;
$$;
create function public.assign_default_employee_role() returns trigger language plpgsql security definer as $$begin return new; end$$;
create function public.prevent_user_role_delete() returns trigger language plpgsql security definer as $$begin return old; end$$;
create function public.set_updated_at() returns trigger language plpgsql as $$begin return new; end$$;
create function public.prevent_wiki_node_cycle() returns trigger language plpgsql as $$begin return new; end$$;
create function public.invoke_data_sync_dispatch_now() returns bigint language sql security definer as $$select 1::bigint$$;
create function public.invoke_single_data_sync_source(text,integer,integer) returns bigint language sql security definer as $$select 1::bigint$$;
create function public.get_data_sync_scheduler_health() returns boolean language sql security definer as $$select true$$;
create function raw.run_retention_cleanup(boolean,text,integer) returns integer language sql security definer as $$select 0$$;
create function data.get_division_production_last_12_months(text,date) returns numeric language sql security definer as $$select sum(amount) from raw.production_data$$;
create function data.get_branch_production_last_12_months(text,date) returns numeric language sql security definer as $$select sum(amount) from raw.production_data$$;
create function data.get_employee_production_last_12_months(text,date) returns numeric language sql security definer as $$select sum(amount) from raw.production_data$$;
create function data.get_file_quality_rollups(date) returns numeric language sql security definer as $$select sum(amount) from raw.production_data$$;
create function data.get_points_specialists_summary(date,text) returns numeric language sql security definer as $$select sum(amount) from raw.production_data$$;
create function data.leaderboard_posted_month_start(date) returns date language sql as $$select $1$$;
create function public.match_knowledge_chunks(vector,integer,text[]) returns table(chunk_id uuid,source_id uuid,source_type text,source_title text,source_url text,content text,metadata jsonb,similarity double precision)
language sql as $$select null::uuid,null::uuid,null::text,null::text,null::text,null::text,null::jsonb,0::double precision where false$$;
