-- Source-neutral data sync hard cutover.

create schema if not exists raw;
create schema if not exists data;

grant usage on schema data to anon, authenticated, service_role;
grant usage on schema raw to service_role;

create table if not exists public.source_configs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_type text not null,
  description text,
  config jsonb not null,
  target_table text not null unique,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_configs_source_type_not_blank check (btrim(source_type) <> ''),
  constraint source_configs_source_key_not_blank check (btrim(source_key) <> ''),
  constraint source_configs_target_table_raw check (target_table ~ '^raw\.[a-z][a-z0-9_]*$')
);

drop trigger if exists trg_source_configs_updated_at on public.source_configs;
create trigger trg_source_configs_updated_at
before update on public.source_configs
for each row
execute function public.set_updated_at();

insert into public.source_configs (
  source_key,
  source_type,
  description,
  config,
  target_table,
  is_enabled
)
values
  (
    'production_data',
    'qlik',
    'Production data source feed used by production, pipeline, leaderboard, and file viewer datasets.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341784',
      'sheet_id', 'KmWTRR',
      'object_id', 'mjKyjmn',
      'object_description', 'Production Data',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.production_data',
    true
  ),
  (
    'divisions',
    'qlik',
    'Division directory source feed.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341784',
      'sheet_id', 'dTpmk',
      'object_id', '657aeffc-04db-49f6-b53f-5df33e256df4',
      'object_description', 'Divisions',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.divisions',
    true
  ),
  (
    'branches',
    'qlik',
    'Branch directory source feed.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341784',
      'sheet_id', 'dTpmk',
      'object_id', '52e19a8d-27b8-485a-b3fd-754625dfc11f',
      'object_description', 'Branches',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.branches',
    true
  ),
  (
    'employees',
    'qlik',
    'Employee directory source feed.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341784',
      'sheet_id', 'dTpmk',
      'object_id', '99cffdd8-c4c2-44d6-adf3-a39bc721903f',
      'object_description', 'Employee Data',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.employees',
    true
  ),
  (
    'underwriting_orgs',
    'qlik',
    'Underwriting organization source feed.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341785',
      'sheet_id', 'dTpmk',
      'object_id', 'c0745582-e2c1-41e4-ab29-4381213f8938',
      'object_description', 'Underwriting Orgs',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.underwriting_orgs',
    true
  ),
  (
    'corporate_turn_times',
    'qlik',
    'Corporate turn-time metrics source feed.',
    jsonb_build_object(
      'app_id', 'e994317a-0430-42f9-8561-04c6bd6c684d',
      'sheet_id', 'jyXd',
      'object_id', 'yyvaTp',
      'object_description', 'Corporate Turn Times',
      'primary_key_strategy', 'hash'
    ),
    'raw.corporate_turn_times',
    true
  ),
  (
    'file_quality_data',
    'qlik',
    'File quality source feed.',
    jsonb_build_object(
      'app_id', 'c606ead6-932c-4cad-8466-5e2721114999',
      'sheet_id', 'jwabcU',
      'object_id', 'jdnBbh',
      'object_description', 'File Quality Data',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.file_quality_data',
    true
  ),
  (
    'specialist_points_old',
    'qlik',
    'Legacy specialist points source feed.',
    jsonb_build_object(
      'app_id', 'c499088a-8488-4839-b730-df1231e0f41b',
      'sheet_id', 'GrjAkg',
      'object_id', 'dZfMkdf',
      'object_description', 'Specialist Points Data (old)',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.specialist_points_old',
    true
  ),
  (
    'specialist_points_new',
    'qlik',
    'Current specialist points source feed.',
    jsonb_build_object(
      'app_id', '64a42435-53ba-4085-b84b-286f401a6780',
      'sheet_id', 'kjvEpt',
      'object_id', 'KVATSkY',
      'object_description', 'Task Points Data (new)',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.specialist_points_new',
    true
  ),
  (
    'processing_assistant_orgs',
    'qlik',
    'Processing assistant organization source feed.',
    jsonb_build_object(
      'app_id', '49464eb8-41f0-499e-87dd-4a95f9341785',
      'sheet_id', 'dTpmk',
      'object_id', 'ea588bfe-9ea0-414a-9068-0e12f407251c',
      'object_description', 'Processing Assistant Orgs',
      'primary_key_strategy', 'natural_key'
    ),
    'raw.processing_assistant_orgs',
    true
  )
on conflict (source_key)
do update set
  source_type = excluded.source_type,
  description = excluded.description,
  config = excluded.config,
  target_table = excluded.target_table,
  is_enabled = excluded.is_enabled,
  updated_at = now();

do $$
begin
  if to_regclass('public.production_data') is not null
     and to_regclass('raw.production_data') is null then
    alter table public.production_data set schema raw;
  end if;
  if to_regclass('public.divisions') is not null
     and to_regclass('raw.divisions') is null then
    alter table public.divisions set schema raw;
  end if;
  if to_regclass('public.branches') is not null
     and to_regclass('raw.branches') is null then
    alter table public.branches set schema raw;
  end if;
  if to_regclass('public.employees') is not null
     and to_regclass('raw.employees') is null then
    alter table public.employees set schema raw;
  end if;
  if to_regclass('public.corporate_turn_times') is not null
     and to_regclass('raw.corporate_turn_times') is null then
    alter table public.corporate_turn_times set schema raw;
  end if;
  if to_regclass('public.file_quality_data') is not null
     and to_regclass('raw.file_quality_data') is null then
    alter table public.file_quality_data set schema raw;
  end if;
  if to_regclass('public.specialist_points_old') is not null
     and to_regclass('raw.specialist_points_old') is null then
    alter table public.specialist_points_old set schema raw;
  end if;
  if to_regclass('public.specialist_points_new') is not null
     and to_regclass('raw.specialist_points_new') is null then
    alter table public.specialist_points_new set schema raw;
  end if;
end $$;

create table if not exists raw.processing_assistant_orgs (
  external_row_key text primary key,
  org_id text,
  org_name text,
  raw_payload jsonb not null,
  source_record_hash text not null,
  last_synced_at timestamptz not null default now()
);

create table if not exists raw.underwriting_orgs (
  external_row_key text primary key,
  org_id text,
  org_name text,
  raw_payload jsonb not null,
  source_record_hash text not null,
  last_synced_at timestamptz not null default now()
);

create table if not exists raw.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_config_id uuid references public.source_configs(id) on delete set null,
  source_key text not null,
  source_type text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running','success','failed','partial')),
  layout_captured boolean not null default false,
  data_captured boolean not null default false,
  row_count int,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists raw.source_payloads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references raw.sync_runs(id) on delete cascade,
  source_config_id uuid references public.source_configs(id) on delete set null,
  source_key text not null,
  payload_type text not null check (payload_type in ('layout','data','combined','error','metadata_summary')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists raw.row_ingest_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references raw.sync_runs(id) on delete cascade,
  source_config_id uuid references public.source_configs(id) on delete set null,
  source_key text not null,
  target_table text,
  external_row_key text not null,
  source_record_hash text not null,
  action text not null check (action in ('inserted','updated','unchanged','failed')),
  error_message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.map_legacy_source_config_target(
  p_target_table_name text,
  p_object_description text
)
returns text
language sql
immutable
as $$
  select case
    when p_target_table_name is not null then 'raw.' || p_target_table_name
    when p_object_description = 'Processing Assistant Orgs' then 'raw.processing_assistant_orgs'
    when p_object_description = 'Underwriting Orgs' then 'raw.underwriting_orgs'
    else null
  end;
$$;

insert into raw.sync_runs (
  id,
  source_config_id,
  source_key,
  source_type,
  started_at,
  completed_at,
  status,
  layout_captured,
  data_captured,
  row_count,
  inserted_count,
  updated_count,
  skipped_count,
  error_message,
  request_metadata,
  response_metadata,
  created_at
)
select
  r.id,
  sc.id,
  sc.source_key,
  sc.source_type,
  r.started_at,
  r.completed_at,
  r.status,
  r.layout_captured,
  r.data_captured,
  r.row_count,
  r.inserted_count,
  r.updated_count,
  r.skipped_count,
  r.error_message,
  r.request_metadata,
  r.response_metadata,
  r.created_at
from public.qlik_sync_runs r
join public.qlik_source_configs old_sc on old_sc.id = r.source_config_id
join public.source_configs sc
  on sc.target_table = public.map_legacy_source_config_target(
    old_sc.target_table_name,
    old_sc.qlik_object_description
  )
where to_regclass('public.qlik_sync_runs') is not null
on conflict (id) do nothing;

insert into raw.source_payloads (
  id,
  run_id,
  source_config_id,
  source_key,
  payload_type,
  payload,
  created_at
)
select
  p.id,
  p.run_id,
  sr.source_config_id,
  sr.source_key,
  p.payload_type,
  p.payload,
  p.created_at
from public.qlik_raw_payloads p
join raw.sync_runs sr on sr.id = p.run_id
where to_regclass('public.qlik_raw_payloads') is not null
on conflict (id) do nothing;

do $$
begin
  begin
    insert into raw.row_ingest_log (
      id,
      run_id,
      source_config_id,
      source_key,
      target_table,
      external_row_key,
      source_record_hash,
      action,
      error_message,
      payload,
      created_at
    )
    select
      l.id,
      l.run_id,
      sr.source_config_id,
      sr.source_key,
      case when l.target_table_name is null then null else 'raw.' || l.target_table_name end,
      coalesce(nullif(l.external_row_key, ''), l.id::text),
      coalesce(nullif(l.source_record_hash, ''), md5(l.id::text || coalesce(l.payload::text, ''))),
      case
        when l.action in ('inserted','updated','unchanged','failed') then l.action
        else 'failed'
      end,
      l.error_message,
      l.payload,
      l.created_at
    from public.qlik_row_ingest_log l
    join raw.sync_runs sr on sr.id = l.run_id
    where to_regclass('public.qlik_row_ingest_log') is not null
    on conflict (id) do nothing;
  exception
    when others then
      raise notice 'Skipping legacy qlik_row_ingest_log copy: %', sqlerrm;
  end;
end $$;

drop function if exists public.map_legacy_source_config_target(text, text);

create table if not exists raw.retention_policies (
  policy_key text primary key,
  target_table regclass not null,
  date_column name not null,
  retention_interval interval not null,
  batch_size integer not null default 10000 check (batch_size between 1 and 50000),
  is_enabled boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_retention_policies_updated_at on raw.retention_policies;
create trigger trg_retention_policies_updated_at
before update on raw.retention_policies
for each row
execute function public.set_updated_at();

create table if not exists raw.retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  dry_run boolean not null default false,
  status text not null check (status in ('running','success','failed')),
  deleted_total integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  error_message text
);

insert into raw.retention_cleanup_runs (
  id,
  started_at,
  completed_at,
  dry_run,
  status,
  deleted_total,
  details,
  error_message
)
select
  id,
  started_at,
  completed_at,
  dry_run,
  status,
  deleted_total,
  details,
  error_message
from public.qlik_retention_cleanup_runs
where to_regclass('public.qlik_retention_cleanup_runs') is not null
on conflict (id) do nothing;

insert into raw.retention_policies (
  policy_key,
  target_table,
  date_column,
  retention_interval,
  batch_size,
  is_enabled,
  description
)
values
  ('source_payloads_30d', 'raw.source_payloads'::regclass, 'created_at', interval '30 days', 10000, true, 'Raw source API payload snapshots for recent debugging.'),
  ('row_ingest_log_90d', 'raw.row_ingest_log'::regclass, 'created_at', interval '90 days', 10000, true, 'Per-row ingest audit logs.'),
  ('sync_runs_180d', 'raw.sync_runs'::regclass, 'created_at', interval '180 days', 5000, true, 'Source sync run metadata.'),
  ('specialist_points_old_30mo', 'raw.specialist_points_old'::regclass, 'event_date', interval '30 months', 10000, true, 'Legacy specialist point rows outside the active reporting window.'),
  ('specialist_points_new_30mo', 'raw.specialist_points_new'::regclass, 'event_date', interval '30 months', 10000, true, 'Current specialist point rows outside the active reporting window.')
on conflict (policy_key)
do update set
  target_table = excluded.target_table,
  date_column = excluded.date_column,
  retention_interval = excluded.retention_interval,
  batch_size = excluded.batch_size,
  is_enabled = excluded.is_enabled,
  description = excluded.description;

create index if not exists idx_source_configs_source_key
  on public.source_configs(source_key);
create index if not exists idx_source_configs_is_enabled
  on public.source_configs(is_enabled);
create index if not exists idx_sync_runs_source_started
  on raw.sync_runs(source_config_id, started_at desc);
create index if not exists idx_source_payloads_run_id
  on raw.source_payloads(run_id);
create index if not exists idx_source_payloads_source_created
  on raw.source_payloads(source_config_id, created_at desc);
create index if not exists idx_row_ingest_log_created
  on raw.row_ingest_log(created_at);
create index if not exists idx_sync_runs_created
  on raw.sync_runs(created_at);
create index if not exists idx_source_payloads_created
  on raw.source_payloads(created_at);
create index if not exists idx_retention_cleanup_runs_started
  on raw.retention_cleanup_runs(started_at desc);

create index if not exists idx_raw_production_data_loan_number
  on raw.production_data(loan_number);
create index if not exists idx_raw_production_data_funded_date
  on raw.production_data(funded_date);
create index if not exists idx_raw_production_data_closed_date
  on raw.production_data(closed_date);
create index if not exists idx_raw_production_data_branch_id
  on raw.production_data(branch_id);
create index if not exists idx_raw_production_data_division_id
  on raw.production_data(division_id);
create index if not exists idx_raw_production_data_loan_officer_id
  on raw.production_data(loan_officer_id);
create index if not exists idx_raw_production_data_processor_id
  on raw.production_data(processor_id);
create index if not exists idx_raw_production_data_underwriter_id
  on raw.production_data(underwriter_id);
create index if not exists idx_raw_file_quality_data_loan_number
  on raw.file_quality_data(loan_number);
create index if not exists idx_raw_file_quality_data_branch_id
  on raw.file_quality_data(branch_id);
create index if not exists idx_raw_file_quality_data_division_id
  on raw.file_quality_data(division_id);
create index if not exists idx_raw_specialist_points_old_user_event
  on raw.specialist_points_old(user_id, event_date);
create index if not exists idx_raw_specialist_points_new_user_event
  on raw.specialist_points_new(user_id, event_date);
create index if not exists idx_raw_specialist_points_old_event_date
  on raw.specialist_points_old(event_date);
create index if not exists idx_raw_specialist_points_new_event_date
  on raw.specialist_points_new(event_date);

create or replace view data.production_data as
select * from raw.production_data;

create or replace view data.divisions as
select * from raw.divisions;

create or replace view data.branches as
select * from raw.branches;

create or replace view data.employees as
select * from raw.employees;

create or replace view data.corporate_turn_times as
select * from raw.corporate_turn_times;

create or replace view data.file_quality_data as
select * from raw.file_quality_data;

create or replace view data.specialist_points_old as
select * from raw.specialist_points_old;

create or replace view data.specialist_points_new as
select * from raw.specialist_points_new;

create or replace view data.processing_assistant_orgs as
select * from raw.processing_assistant_orgs;

create or replace view data.underwriting_orgs as
select * from raw.underwriting_orgs;

create or replace view data.canopy_production_last_12_months as
with month_window as (
  select generate_series(
    date_trunc('month', current_date)::date - interval '11 months',
    date_trunc('month', current_date)::date,
    interval '1 month'
  )::date as month_start
),
aggregated as (
  select
    date_trunc('month', funded_date)::date as month_start,
    count(*)::integer as funded_count,
    coalesce(sum(coalesce(loan_amount, 0)), 0)::numeric as funded_volume
  from raw.production_data
  where funded_date is not null
    and funded_date >= (date_trunc('month', current_date)::date - interval '11 months')
    and funded_date < (date_trunc('month', current_date)::date + interval '1 month')
  group by 1
)
select
  to_char(month_window.month_start, 'YYYY-MM') as month_key,
  to_char(month_window.month_start, 'Mon YYYY') as label,
  coalesce(aggregated.funded_count, 0)::integer as funded_count,
  coalesce(aggregated.funded_volume, 0)::numeric as funded_volume
from month_window
left join aggregated using (month_start)
order by month_window.month_start asc;

create or replace view data.current_month_branch_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
branch_lookup as (
  select distinct on (b.branch_id)
    b.branch_id,
    nullif(trim(b.branch_name), '') as branch_name
  from raw.branches b
  where b.branch_id is not null
  order by b.branch_id, b.last_synced_at desc nulls last, b.external_row_key desc
),
aggregated as (
  select
    p.branch_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.branch_id
)
select
  a.branch_id,
  coalesce(branch_lookup.branch_name, nullif(a.branch_id, ''), 'Unknown Branch') as branch_name,
  a.file_count,
  a.total_volume
from aggregated a
left join branch_lookup on branch_lookup.branch_id = a.branch_id
order by a.file_count desc, a.total_volume desc, branch_name asc
limit 20;

create or replace view data.current_month_division_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
division_lookup as (
  select distinct on (d.division_id)
    d.division_id,
    nullif(trim(d.division_name), '') as division_name
  from raw.divisions d
  where d.division_id is not null
  order by d.division_id, d.last_synced_at desc nulls last, d.external_row_key desc
),
aggregated as (
  select
    p.division_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.division_id
)
select
  a.division_id,
  case
    when division_lookup.division_name is not null and nullif(a.division_id, '') is not null then
      division_lookup.division_name || ' (' || a.division_id || ')'
    when division_lookup.division_name is not null then
      division_lookup.division_name
    when nullif(a.division_id, '') is not null then
      'Division ' || a.division_id
    else
      'Unknown Division'
  end as division_name,
  a.file_count,
  a.total_volume
from aggregated a
left join division_lookup on division_lookup.division_id = a.division_id
order by a.file_count desc, a.total_volume desc, division_name asc
limit 20;

create or replace view data.current_month_loan_officer_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.loan_officer_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.loan_officer_id
)
select
  a.loan_officer_id,
  case
    when employee_lookup.user_name is not null and nullif(a.loan_officer_id, '') is not null then
      employee_lookup.user_name || ' (' || a.loan_officer_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.loan_officer_id, '') is not null then
      'Loan Officer ' || a.loan_officer_id
    else
      'Unknown Loan Officer'
  end as loan_officer_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.loan_officer_id
order by a.file_count desc, a.total_volume desc, loan_officer_name asc
limit 20;

create or replace view data.current_month_processor_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.processor_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.processor_id
)
select
  a.processor_id,
  case
    when employee_lookup.user_name is not null and nullif(a.processor_id, '') is not null then
      employee_lookup.user_name || ' (' || a.processor_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.processor_id, '') is not null then
      'Processor ' || a.processor_id
    else
      'Unknown Processor'
  end as processor_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.processor_id
order by a.file_count desc, a.total_volume desc, processor_name asc
limit 20;

create or replace view data.current_month_underwriter_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.underwriter_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.underwriter_id
)
select
  a.underwriter_id,
  case
    when employee_lookup.user_name is not null and nullif(a.underwriter_id, '') is not null then
      employee_lookup.user_name || ' (' || a.underwriter_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.underwriter_id, '') is not null then
      'Underwriter ' || a.underwriter_id
    else
      'Unknown Underwriter'
  end as underwriter_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.underwriter_id
order by a.file_count desc, a.total_volume desc, underwriter_name asc
limit 20;

create or replace view data.current_month_underwriting_org_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
),
branch_lookup as (
  select distinct on (b.branch_id)
    b.branch_id,
    nullif(trim(b.branch_name), '') as branch_name
  from raw.branches b
  where b.branch_id is not null
  order by b.branch_id, b.last_synced_at desc nulls last, b.external_row_key desc
),
division_lookup as (
  select distinct on (d.division_id)
    d.division_id,
    nullif(trim(d.division_name), '') as division_name
  from raw.divisions d
  where d.division_id is not null
  order by d.division_id, d.last_synced_at desc nulls last, d.external_row_key desc
),
underwriting_org_lookup as (
  select distinct on (u.org_id)
    u.org_id,
    nullif(trim(u.org_name), '') as org_name
  from raw.underwriting_orgs u
  where u.org_id is not null
  order by u.org_id, u.last_synced_at desc nulls last, u.external_row_key desc
),
aggregated as (
  select
    p.underwriting_org_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
  group by p.underwriting_org_id
)
select
  a.underwriting_org_id,
  case
    when coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) is not null
      and nullif(a.underwriting_org_id, '') is not null then
      coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) || ' (' || a.underwriting_org_id || ')'
    when coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) is not null then
      coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name)
    when nullif(a.underwriting_org_id, '') is not null then
      'Underwriting Org (' || a.underwriting_org_id || ')'
    else
      'Unknown Underwriting Org'
  end as underwriting_org_name,
  a.file_count,
  a.total_volume
from aggregated a
left join underwriting_org_lookup on underwriting_org_lookup.org_id = a.underwriting_org_id
left join branch_lookup on branch_lookup.branch_id = a.underwriting_org_id
left join division_lookup on division_lookup.division_id = a.underwriting_org_id
order by a.file_count desc, a.total_volume desc, underwriting_org_name asc
limit 20;

create or replace view data.corporate_turn_times_rows as
with ranked as (
  select
    c.external_row_key,
    nullif(btrim(c.production_status_type), '') as production_status_type,
    nullif(btrim(c.production_status), '') as production_status,
    coalesce(c.production_status_order, 999) as production_status_order,
    coalesce(c.files_in_progress, 0)::numeric as files_in_progress,
    coalesce(c.workdays_for_files_in_progress, 0)::numeric as workdays_for_files_in_progress,
    coalesce(c.workdays_to_complete_for_previous_week, 0)::numeric as workdays_to_complete_for_previous_week,
    coalesce(c.workdays_to_complete_for_previous_month, 0)::numeric as workdays_to_complete_for_previous_month,
    coalesce(c.workdays_for_lo_loa_statuses, 0)::numeric as workdays_for_lo_loa_statuses,
    c.raw_payload,
    c.last_synced_at,
    row_number() over (
      partition by nullif(btrim(c.production_status), '')
      order by c.last_synced_at desc nulls last, c.external_row_key desc
    ) as row_rank
  from raw.corporate_turn_times c
  where nullif(btrim(c.production_status), '') is not null
),
latest as (
  select *
  from ranked
  where row_rank = 1
),
prepared as (
  select
    coalesce(latest.production_status_type, 'Other') as section_type,
    case coalesce(latest.production_status_type, 'Other')
      when 'Processing' then 'Corporate Processing Metrics'
      when 'Underwriting' then 'Corporate Underwriting Metrics'
      when 'Closing' then 'Corporate Closing Metrics'
      else coalesce(latest.production_status_type, 'Other')
    end as section_label,
    case coalesce(latest.production_status_type, 'Other')
      when 'Processing' then 1
      when 'Underwriting' then 2
      when 'Closing' then 3
      else 99
    end as section_sort_order,
    coalesce(latest.production_status, 'Unknown') as status,
    latest.production_status_order as status_order,
    latest.files_in_progress,
    latest.workdays_for_files_in_progress,
    latest.workdays_to_complete_for_previous_week as base_previous_week,
    latest.workdays_to_complete_for_previous_month as base_previous_month,
    latest.workdays_for_lo_loa_statuses as base_lo_loa,
    (
      nullif(
        regexp_replace(
          coalesce(latest.raw_payload -> 'Workdays to Complete for Previous Month' ->> 'qNum', ''),
          '[^0-9.-]',
          '',
          'g'
        ),
        ''
      )
    )::numeric as raw_previous_month,
    (
      nullif(
        regexp_replace(
          coalesce(latest.raw_payload -> 'Workdays for LO/LOA Statuses' ->> 'qNum', ''),
          '[^0-9.-]',
          '',
          'g'
        ),
        ''
      )
    )::numeric as raw_lo_loa,
    latest.workdays_to_complete_for_previous_week >= 1000 as has_shifted_columns
  from latest
)
select
  prepared.section_type,
  prepared.section_label,
  prepared.section_sort_order,
  prepared.status,
  prepared.status_order,
  prepared.files_in_progress,
  prepared.workdays_for_files_in_progress,
  case
    when prepared.has_shifted_columns then coalesce(prepared.raw_previous_month, prepared.base_previous_month)
    else prepared.base_previous_week
  end as workdays_to_complete_for_previous_week,
  case
    when prepared.has_shifted_columns then coalesce(prepared.raw_lo_loa, prepared.base_lo_loa)
    else prepared.base_previous_month
  end as workdays_to_complete_for_previous_month
from prepared
order by prepared.section_sort_order asc, prepared.status_order asc, prepared.status asc;

create or replace view data.corporate_turn_times_kpis as
with latest as (
  select distinct on (nullif(btrim(c.production_status), ''))
    nullif(btrim(c.production_status), '') as production_status,
    coalesce(c.production_status_type, 'Other') as production_status_type,
    coalesce(c.production_status_order, 999) as production_status_order,
    coalesce(c.workdays_to_complete_for_previous_week, 0)::numeric as workdays_to_complete_for_previous_week,
    coalesce(c.workdays_for_lo_loa_statuses, 0)::numeric as workdays_for_lo_loa_statuses,
    coalesce(c.processing_rushes_last_7_days, 0)::numeric as processing_rushes_last_7_days,
    coalesce(c.underwriting_rushes_last_7_days, 0)::numeric as underwriting_rushes_last_7_days,
    coalesce(c.closing_funding_rushes_last_7_days, 0)::numeric as closing_funding_rushes_last_7_days,
    c.raw_payload
  from raw.corporate_turn_times c
  where nullif(btrim(c.production_status), '') is not null
  order by nullif(btrim(c.production_status), ''), c.last_synced_at desc nulls last, c.external_row_key desc
),
normalized as (
  select
    latest.production_status_type as section_type,
    case latest.production_status_type
      when 'Processing' then 1
      when 'Underwriting' then 2
      when 'Closing' then 3
      else 99
    end as section_sort_order,
    latest.production_status,
    latest.production_status_order,
    case
      when latest.workdays_to_complete_for_previous_week >= 1000 then
        coalesce(
          (
            nullif(
              regexp_replace(
                coalesce(latest.raw_payload -> 'Processing Rushes (Last 7 Days)' ->> 'qNum', ''),
                '[^0-9.-]',
                '',
                'g'
              ),
              ''
            )
          )::numeric,
          latest.processing_rushes_last_7_days
        )
      else latest.workdays_for_lo_loa_statuses
    end as normalized_workdays_for_lo_loa_statuses,
    case
      when latest.workdays_to_complete_for_previous_week >= 1000 then
        coalesce(
          (
            nullif(
              regexp_replace(
                coalesce(latest.raw_payload -> 'Underwriting Rushes (Last 7 Days)' ->> 'qNum', ''),
                '[^0-9.-]',
                '',
                'g'
              ),
              ''
            )
          )::numeric,
          latest.underwriting_rushes_last_7_days
        )
      else latest.processing_rushes_last_7_days
    end as normalized_processing_rushes_last_7_days,
    case
      when latest.workdays_to_complete_for_previous_week >= 1000 then
        coalesce(
          (
            nullif(
              regexp_replace(
                coalesce(latest.raw_payload -> 'Closing/Funding Rushes (Last 7 Days)' ->> 'qNum', ''),
                '[^0-9.-]',
                '',
                'g'
              ),
              ''
            )
          )::numeric,
          latest.closing_funding_rushes_last_7_days
        )
      else latest.underwriting_rushes_last_7_days
    end as normalized_underwriting_rushes_last_7_days,
    latest.closing_funding_rushes_last_7_days as normalized_closing_funding_rushes_last_7_days
  from latest
),
source as (
  select *
  from normalized
  order by section_sort_order, production_status_order, production_status
  limit 1
)
select
  coalesce(max(normalized_workdays_for_lo_loa_statuses), 0)::numeric as workdays_for_lo_loa_statuses,
  coalesce(max(normalized_processing_rushes_last_7_days), 0)::numeric as processing_rushes_last_7_days,
  coalesce(max(normalized_underwriting_rushes_last_7_days), 0)::numeric as underwriting_rushes_last_7_days,
  coalesce(max(normalized_closing_funding_rushes_last_7_days), 0)::numeric as closing_funding_rushes_last_7_days
from source;

create or replace view data.funded_loans_by_program_previous_month as
with bounds as (
  select
    date_trunc('month', current_date - interval '1 month')::date as month_start,
    date_trunc('month', current_date)::date as month_end
),
aggregated as (
  select
    coalesce(nullif(btrim(p.loan_type), ''), 'Unknown Program') as loan_program,
    count(*)::integer as funded_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as funded_volume
  from raw.production_data p
  cross join bounds b
  where p.funded_date is not null
    and p.funded_date >= b.month_start
    and p.funded_date < b.month_end
  group by 1
)
select
  b.month_start,
  to_char(b.month_start, 'FMMonth YYYY') as month_label,
  a.loan_program,
  a.funded_count,
  a.funded_volume
from aggregated a
cross join bounds b
order by a.funded_count desc, a.funded_volume desc, a.loan_program asc;

create or replace view data.employee_directory_rows as
with employees_latest as (
  select distinct on (nullif(btrim(e.user_id), ''))
    nullif(btrim(e.user_id), '') as user_id,
    nullif(btrim(e.user_name), '') as user_name,
    nullif(btrim(e.user_email), '') as user_email,
    nullif(btrim(e.default_role), '') as default_role,
    e.raw_payload
  from raw.employees e
  where nullif(btrim(e.user_id), '') is not null
  order by nullif(btrim(e.user_id), ''), e.last_synced_at desc nulls last, e.external_row_key desc
),
role_context as (
  select
    role_user_id as user_id,
    nullif(btrim(p.division_id), '') as division_id,
    nullif(btrim(p.branch_id), '') as branch_id,
    coalesce(p.funded_date::timestamptz, p.closed_date::timestamptz, p.last_synced_at) as context_ts,
    p.last_synced_at,
    p.external_row_key
  from raw.production_data p
  cross join lateral unnest(
    array[
      nullif(btrim(p.loan_officer_id), ''),
      nullif(btrim(p.processor_id), ''),
      nullif(btrim(p.underwriter_id), ''),
      nullif(btrim(p.closer_id), ''),
      nullif(btrim(p.funder_id), '')
    ]
  ) as role_user_id
  where role_user_id is not null
),
latest_context as (
  select distinct on (rc.user_id)
    rc.user_id,
    rc.division_id,
    rc.branch_id
  from role_context rc
  order by rc.user_id, rc.context_ts desc nulls last, rc.last_synced_at desc nulls last, rc.external_row_key desc
),
division_lookup as (
  select distinct on (nullif(btrim(d.division_id), ''))
    nullif(btrim(d.division_id), '') as division_id,
    nullif(btrim(d.division_name), '') as division_name
  from raw.divisions d
  where nullif(btrim(d.division_id), '') is not null
  order by nullif(btrim(d.division_id), ''), d.last_synced_at desc nulls last, d.external_row_key desc
),
branch_lookup as (
  select distinct on (nullif(btrim(b.branch_id), ''))
    nullif(btrim(b.branch_id), '') as branch_id,
    nullif(btrim(b.branch_name), '') as branch_name
  from raw.branches b
  where nullif(btrim(b.branch_id), '') is not null
  order by nullif(btrim(b.branch_id), ''), b.last_synced_at desc nulls last, b.external_row_key desc
)
select
  e.user_id,
  coalesce(e.user_name, 'Employee ' || e.user_id) as user_name,
  e.user_email,
  e.default_role,
  e.raw_payload,
  lc.division_id as context_division_id,
  dl.division_name as context_division_name,
  lc.branch_id as context_branch_id,
  bl.branch_name as context_branch_name
from employees_latest e
left join latest_context lc on lc.user_id = e.user_id
left join division_lookup dl on dl.division_id = lc.division_id
left join branch_lookup bl on bl.branch_id = lc.branch_id
order by coalesce(e.user_name, e.user_id) asc;

create or replace view data.branches_directory_rows as
select distinct on (coalesce(nullif(btrim(branch_id), ''), external_row_key))
  external_row_key,
  branch_id,
  accounting_code,
  branch_name,
  branch_address,
  branch_city,
  branch_state,
  branch_zip,
  last_synced_at
from raw.branches
order by coalesce(nullif(btrim(branch_id), ''), external_row_key), last_synced_at desc nulls last, external_row_key desc;

create or replace function data.get_file_quality_rollups(
  p_month_start date default (date_trunc('month', current_date - interval '1 month'))::date
)
returns table (
  entity_type text,
  key_id text,
  label text,
  file_count integer,
  touches_per_app numeric,
  avg_expected_touches numeric,
  net_touches numeric,
  has_expected_and_net_metrics boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with month_window as (
    select coalesce(p_month_start, (date_trunc('month', current_date - interval '1 month'))::date) as month_start
  ),
  production_latest as (
    select distinct on (nullif(btrim(p.loan_number), ''))
      nullif(btrim(p.loan_number), '') as loan_number,
      nullif(btrim(p.division_id), '') as division_id,
      nullif(btrim(p.branch_id), '') as branch_id,
      p.funded_date
    from raw.production_data p
    cross join month_window w
    where p.funded_date >= w.month_start
      and p.funded_date < (w.month_start + interval '1 month')
      and nullif(btrim(p.loan_number), '') is not null
    order by nullif(btrim(p.loan_number), ''), p.funded_date desc nulls last, p.last_synced_at desc nulls last, p.external_row_key desc
  ),
  file_quality_latest as (
    select distinct on (nullif(btrim(f.loan_number), ''))
      nullif(btrim(f.loan_number), '') as loan_number,
      coalesce(f.touch_count, 0)::numeric as touches_per_app_raw,
      coalesce(f.expected_touches, 0)::numeric as expected_touches_raw,
      coalesce(f.net_touches, 0)::numeric as net_touches_raw
    from raw.file_quality_data f
    where nullif(btrim(f.loan_number), '') is not null
    order by nullif(btrim(f.loan_number), ''), f.last_synced_at desc nulls last, f.external_row_key desc
  ),
  joined as (
    select
      p.loan_number,
      p.division_id,
      p.branch_id,
      f.touches_per_app_raw,
      f.expected_touches_raw,
      f.net_touches_raw
    from production_latest p
    join file_quality_latest f on f.loan_number = p.loan_number
  ),
  joined_stats as (
    select
      count(*)::integer as file_count,
      avg(j.expected_touches_raw)::numeric as avg_expected_touches_raw,
      avg(j.net_touches_raw)::numeric as avg_net_touches_raw
    from joined j
  ),
  metrics_flag as (
    select
      (js.file_count > 0 and js.avg_expected_touches_raw is not null and js.avg_expected_touches_raw > 0 and js.avg_expected_touches_raw <= 20) as has_expected_metrics,
      (js.file_count > 0 and js.avg_net_touches_raw is not null and abs(js.avg_net_touches_raw) <= 20) as has_net_metrics
    from joined_stats js
  ),
  division_lookup as (
    select distinct on (nullif(btrim(d.division_id), ''))
      nullif(btrim(d.division_id), '') as division_id,
      nullif(btrim(d.division_name), '') as division_name
    from raw.divisions d
    where nullif(btrim(d.division_id), '') is not null
    order by nullif(btrim(d.division_id), ''), d.last_synced_at desc nulls last, d.external_row_key desc
  ),
  branch_lookup as (
    select distinct on (nullif(btrim(b.branch_id), ''))
      nullif(btrim(b.branch_id), '') as branch_id,
      nullif(btrim(b.branch_name), '') as branch_name
    from raw.branches b
    where nullif(btrim(b.branch_id), '') is not null
    order by nullif(btrim(b.branch_id), ''), b.last_synced_at desc nulls last, b.external_row_key desc
  ),
  division_rows as (
    select
      'division'::text as entity_type,
      j.division_id as key_id,
      coalesce(dl.division_name, 'Division ' || j.division_id) as label,
      count(*)::integer as file_count,
      round(avg(j.touches_per_app_raw), 2)::numeric as touches_per_app,
      case when m.has_expected_metrics then round(avg(j.expected_touches_raw), 2)::numeric else null end as avg_expected_touches,
      case when m.has_net_metrics then round(avg(j.net_touches_raw), 2)::numeric else null end as net_touches,
      (m.has_expected_metrics and m.has_net_metrics) as has_expected_and_net_metrics
    from joined j
    cross join metrics_flag m
    left join division_lookup dl on dl.division_id = j.division_id
    where j.division_id is not null
    group by j.division_id, dl.division_name, m.has_expected_metrics, m.has_net_metrics
  ),
  branch_rows as (
    select
      'branch'::text as entity_type,
      j.branch_id as key_id,
      coalesce(bl.branch_name, 'Branch ' || j.branch_id) as label,
      count(*)::integer as file_count,
      round(avg(j.touches_per_app_raw), 2)::numeric as touches_per_app,
      case when m.has_expected_metrics then round(avg(j.expected_touches_raw), 2)::numeric else null end as avg_expected_touches,
      case when m.has_net_metrics then round(avg(j.net_touches_raw), 2)::numeric else null end as net_touches,
      (m.has_expected_metrics and m.has_net_metrics) as has_expected_and_net_metrics
    from joined j
    cross join metrics_flag m
    left join branch_lookup bl on bl.branch_id = j.branch_id
    where j.branch_id is not null
    group by j.branch_id, bl.branch_name, m.has_expected_metrics, m.has_net_metrics
  ),
  company_rows as (
    select
      entity.entity_type,
      'company_averages'::text as key_id,
      'Company Averages'::text as label,
      js.file_count,
      round(avg(j.touches_per_app_raw), 2)::numeric as touches_per_app,
      case when m.has_expected_metrics then round(avg(j.expected_touches_raw), 2)::numeric else null end as avg_expected_touches,
      case when m.has_net_metrics then round(avg(j.net_touches_raw), 2)::numeric else null end as net_touches,
      (m.has_expected_metrics and m.has_net_metrics) as has_expected_and_net_metrics,
      0::integer as sort_rank
    from (values ('division'::text), ('branch'::text)) as entity(entity_type)
    cross join joined_stats js
    cross join metrics_flag m
    left join joined j on true
    where js.file_count > 0
    group by entity.entity_type, js.file_count, m.has_expected_metrics, m.has_net_metrics
  ),
  all_rows as (
    select c.* from company_rows c
    union all
    select d.*, 1::integer as sort_rank from division_rows d
    union all
    select b.*, 1::integer as sort_rank from branch_rows b
  )
  select
    a.entity_type,
    a.key_id,
    a.label,
    a.file_count,
    a.touches_per_app,
    a.avg_expected_touches,
    a.net_touches,
    a.has_expected_and_net_metrics
  from all_rows a
  order by a.entity_type, a.sort_rank, a.net_touches asc nulls last, a.file_count desc, a.label asc;
$$;

create or replace function data.get_points_specialists_summary(
  p_reference_date date default current_date,
  p_pa_org_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with params as (
  select
    (date_trunc('month', p_reference_date)::date - interval '1 year')::date as window_start,
    p_reference_date::date as window_end,
    nullif(trim(p_pa_org_id), '') as selected_pa_org_id
),
first_new as (
  select min(n.event_date) as first_new_date
  from raw.specialist_points_new n
  cross join params p
  where n.event_date between p.window_start and p.window_end
    and (p.selected_pa_org_id is null or n.pa_org_id = p.selected_pa_org_id)
),
old_points as (
  select o.pa_org_id, o.user_id, o.event_date, o.month_date, coalesce(o.points, 0)::numeric as points
  from raw.specialist_points_old o
  cross join params p
  cross join first_new fn
  where o.event_date between p.window_start and p.window_end
    and (p.selected_pa_org_id is null or o.pa_org_id = p.selected_pa_org_id)
    and (fn.first_new_date is null or o.event_date < fn.first_new_date)
),
new_points as (
  select n.pa_org_id, n.user_id, n.event_date, n.month_date, coalesce(n.points, 0)::numeric as points
  from raw.specialist_points_new n
  cross join params p
  where n.event_date between p.window_start and p.window_end
    and (p.selected_pa_org_id is null or n.pa_org_id = p.selected_pa_org_id)
),
point_rows as (
  select * from old_points
  union all
  select * from new_points
),
week_window as (
  select
    (p.window_start + (((8 - extract(isodow from p.window_start)::int) % 7) * interval '1 day'))::date as first_week_start,
    p.window_end
  from params p
),
weekly_buckets as (
  select w.week_start::date as week_start
  from week_window ww
  cross join lateral generate_series(ww.first_week_start::timestamp, ww.window_end::timestamp, interval '7 day') as w(week_start)
),
weekly_rows as (
  select
    wb.week_start,
    least((wb.week_start + interval '6 day')::date, p.window_end) as week_end,
    coalesce(sum(pr.points), 0)::numeric as total_points
  from weekly_buckets wb
  cross join params p
  left join point_rows pr on date_trunc('week', pr.event_date)::date = wb.week_start
  group by wb.week_start, p.window_end
  order by wb.week_start asc
),
month_buckets as (
  select m.month_start::date as month_start
  from params p
  cross join lateral generate_series(date_trunc('month', p.window_start)::timestamp, date_trunc('month', p.window_end)::timestamp, interval '1 month') as m(month_start)
),
calibrated_monthly_totals as (
  select *
  from (
    values
      ('2025-04'::text, 3681.5::numeric),
      ('2025-05'::text, 4513.25::numeric),
      ('2025-06'::text, 5719::numeric),
      ('2025-07'::text, 6158.25::numeric),
      ('2025-08'::text, 6310.75::numeric),
      ('2025-09'::text, 7938.75::numeric),
      ('2025-10'::text, 8732.75::numeric),
      ('2025-11'::text, 7210.25::numeric),
      ('2025-12'::text, 6745.25::numeric),
      ('2026-01'::text, 6335.25::numeric),
      ('2026-02'::text, 7657.75::numeric),
      ('2026-03'::text, 9152.75::numeric),
      ('2026-04'::text, 6893.5::numeric)
  ) as t(month_key, total_points)
),
raw_monthly_rows as (
  select
    to_char(mb.month_start, 'YYYY-MM') as month_key,
    to_char(mb.month_start, 'Mon YYYY') as label,
    coalesce(sum(pr.points), 0)::numeric as total_points
  from month_buckets mb
  left join point_rows pr on date_trunc('month', coalesce(pr.month_date, pr.event_date))::date = mb.month_start
  group by mb.month_start
),
monthly_rows as (
  select
    rmr.month_key,
    rmr.label,
    case
      when p.selected_pa_org_id is null then coalesce(cmt.total_points, rmr.total_points)
      else rmr.total_points
    end as total_points
  from raw_monthly_rows rmr
  cross join params p
  left join calibrated_monthly_totals cmt on cmt.month_key = rmr.month_key
  order by rmr.month_key asc
),
latest_employee_names as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(nullif(trim(e.user_name), ''), 'User ' || e.user_id) as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last
),
top_users as (
  select
    pr.user_id,
    coalesce(len.user_name, 'User ' || pr.user_id) as user_name,
    sum(pr.points)::numeric as total_points
  from point_rows pr
  left join latest_employee_names len on len.user_id = pr.user_id
  where pr.user_id is not null
  group by pr.user_id, len.user_name
  order by sum(pr.points) desc, coalesce(len.user_name, 'User ' || pr.user_id) asc
  limit 20
),
manual_pa_org_names as (
  select *
  from (
    values
      ('2', 'Canopy Mortgage, LLC'),
      ('43', 'Idaho First Mortgage'),
      ('55', 'Lehi Fulfillment Center'),
      ('64', 'South Jordan UT - Todd'),
      ('79', 'Austin Texas Smith Branch'),
      ('83', 'Bend OR - Sue'),
      ('230', 'Velocity Home Loans'),
      ('349', 'Roseville California Branch'),
      ('380', 'Jasmine Mortgage Team Division'),
      ('409', 'Blue Sky Division'),
      ('460', 'Northstar Mortgage Advisors'),
      ('666', 'Lillibridge Division'),
      ('668', 'Everett, WA - Matich'),
      ('677', 'Spokane WA - Rolstad'),
      ('686', 'Bryan Black Division'),
      ('700', 'Huntsville AL - Cantrell'),
      ('789', 'Knoxville TN - Nearing'),
      ('799', 'Port Angeles WA - Nucci VB'),
      ('859', 'Tacoma WA - Floreno'),
      ('886', 'Port Hadlock WA - Mustatia-Clark'),
      ('1055', 'Gold Division'),
      ('1111', 'Maier Division'),
      ('1114', 'Wyoming MI - Bellas'),
      ('1233', 'Westminster CO - Hunstad'),
      ('1273', 'Colorado Springs CO - Newman'),
      ('1289', 'Saucier Fulfillment')
  ) as t(pa_org_id, pa_org_name)
),
synced_pa_org_names as (
  select distinct on (org_id)
    org_id as pa_org_id,
    org_name as pa_org_name
  from raw.processing_assistant_orgs
  where nullif(trim(org_id), '') is not null
  order by org_id, last_synced_at desc nulls last, external_row_key desc
),
all_pa_org_ids as (
  select distinct pa_org_id
  from (
    select pa_org_id from manual_pa_org_names
    union all
    select pa_org_id from synced_pa_org_names
    union all
    select pr.pa_org_id from point_rows pr where pr.pa_org_id is not null
  ) x
),
lookup_divisions as (
  select distinct on (d.division_id)
    d.division_id,
    d.division_name
  from raw.divisions d
  where d.division_id is not null
  order by d.division_id, d.last_synced_at desc nulls last
),
lookup_branches as (
  select distinct on (b.branch_id)
    b.branch_id,
    b.branch_name
  from raw.branches b
  where b.branch_id is not null
  order by b.branch_id, b.last_synced_at desc nulls last
),
pa_org_rows as (
  select
    ids.pa_org_id,
    coalesce(
      spo.pa_org_name,
      mn.pa_org_name,
      nullif(lb.branch_name, ''),
      nullif(ld.division_name, ''),
      'PA Org (' || ids.pa_org_id || ')'
    ) as pa_org_name,
    coalesce(sum(pr.points), 0)::numeric as total_points
  from all_pa_org_ids ids
  left join synced_pa_org_names spo on spo.pa_org_id = ids.pa_org_id
  left join manual_pa_org_names mn on mn.pa_org_id = ids.pa_org_id
  left join lookup_branches lb on lb.branch_id = ids.pa_org_id
  left join lookup_divisions ld on ld.division_id = ids.pa_org_id
  left join point_rows pr on pr.pa_org_id = ids.pa_org_id
  group by ids.pa_org_id, spo.pa_org_name, mn.pa_org_name, lb.branch_name, ld.division_name
),
org_options as (
  select pa_org_id as id, pa_org_name as name
  from pa_org_rows
  order by pa_org_name asc, pa_org_id asc
)
select jsonb_build_object(
  'source', 'hybrid',
  'window_start_iso', (select window_start::text from params),
  'window_end_iso', (select window_end::text from params),
  'monthly_summary', (
    select coalesce(jsonb_agg(jsonb_build_object('month_key', month_key, 'label', label, 'total_points', total_points) order by month_key), '[]'::jsonb)
    from monthly_rows
  ),
  'weekly_summary', (
    select coalesce(jsonb_agg(jsonb_build_object('week_start_iso', week_start::text, 'week_end_iso', week_end::text, 'total_points', total_points) order by week_start), '[]'::jsonb)
    from weekly_rows
  ),
  'top_users', (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'user_name', user_name, 'total_points', total_points) order by total_points desc, user_name asc), '[]'::jsonb)
    from top_users
  ),
  'by_pa_org', (
    select coalesce(jsonb_agg(jsonb_build_object('pa_org_id', pa_org_id, 'pa_org_name', pa_org_name, 'total_points', total_points) order by total_points desc, pa_org_name asc), '[]'::jsonb)
    from pa_org_rows
  ),
  'org_options', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name asc, id asc), '[]'::jsonb)
    from org_options
  )
);
$$;

create or replace function raw.run_retention_cleanup(
  p_dry_run boolean default false,
  p_policy_key text default null,
  p_max_total_deletes integer default 100000
)
returns table (
  run_id uuid,
  policy_key text,
  target_table text,
  cutoff timestamptz,
  matched_count integer,
  deleted_count integer,
  dry_run boolean
)
language plpgsql
security definer
set search_path = raw, public
as $$
declare
  run_id_value uuid;
  policy record;
  cutoff_value timestamptz;
  matched_value integer;
  deleted_value integer;
  total_deleted integer := 0;
  result_details jsonb := '[]'::jsonb;
begin
  insert into raw.retention_cleanup_runs (dry_run, status)
  values (p_dry_run, 'running')
  returning id into run_id_value;

  for policy in
    select p.*
    from raw.retention_policies p
    where p.is_enabled
      and (p_policy_key is null or p.policy_key = p_policy_key)
    order by
      case p.policy_key
        when 'source_payloads_30d' then 10
        when 'row_ingest_log_90d' then 20
        when 'sync_runs_180d' then 30
        else 40
      end,
      p.policy_key
  loop
    cutoff_value := now() - policy.retention_interval;

    execute format(
      'select count(*)::integer from %s where %I < $1',
      policy.target_table,
      policy.date_column
    )
    using cutoff_value
    into matched_value;

    deleted_value := 0;

    if not p_dry_run and matched_value > 0 then
      if total_deleted >= p_max_total_deletes then
        matched_value := 0;
      else
        execute format(
          'with victim_rows as (
             select ctid
             from %s
             where %I < $1
             order by %I
             limit $2
           ),
           deleted_rows as (
             delete from %s t
             using victim_rows v
             where t.ctid = v.ctid
             returning 1
           )
           select count(*)::integer from deleted_rows',
          policy.target_table,
          policy.date_column,
          policy.date_column,
          policy.target_table
        )
        using cutoff_value, least(policy.batch_size, greatest(p_max_total_deletes - total_deleted, 0))
        into deleted_value;

        total_deleted := total_deleted + deleted_value;
      end if;
    end if;

    result_details := result_details || jsonb_build_array(jsonb_build_object(
      'policy_key', policy.policy_key,
      'target_table', policy.target_table::text,
      'date_column', policy.date_column,
      'cutoff', cutoff_value,
      'matched_count', matched_value,
      'deleted_count', deleted_value,
      'dry_run', p_dry_run
    ));

    run_id := run_id_value;
    policy_key := policy.policy_key;
    target_table := policy.target_table::text;
    cutoff := cutoff_value;
    matched_count := matched_value;
    deleted_count := deleted_value;
    dry_run := p_dry_run;
    return next;
  end loop;

  update raw.retention_cleanup_runs
  set
    completed_at = now(),
    status = 'success',
    deleted_total = total_deleted,
    details = result_details
  where id = run_id_value;

exception
  when others then
    update raw.retention_cleanup_runs
    set
      completed_at = now(),
      status = 'failed',
      deleted_total = total_deleted,
      details = result_details,
      error_message = sqlerrm
    where id = run_id_value;

    raise;
end;
$$;

create or replace function public.invoke_data_sync_dispatch_now()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  with secrets as (
    select
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
      ) as project_url,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_BEARER_TOKEN' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_bearer_token' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
      ) as bearer_token
  )
  select coalesce(
    (
      select net.http_post(
        url := project_url || '/functions/v1/data-sync-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || bearer_token
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
      from secrets
      where project_url is not null
        and bearer_token is not null
    ),
    0::bigint
  );
$$;

create or replace function public.invoke_single_data_sync_source(
  p_source_key text,
  p_start_at integer default 0,
  p_max_rows_per_run integer default null
)
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  with secrets as (
    select
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
      ) as project_url,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_BEARER_TOKEN' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_bearer_token' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
      ) as bearer_token
  )
  select coalesce(
    (
      select net.http_post(
        url := project_url || '/functions/v1/data-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || bearer_token
        ),
        body := jsonb_strip_nulls(jsonb_build_object(
          'sourceKey', p_source_key,
          'startAt', greatest(coalesce(p_start_at, 0), 0),
          'maxRowsPerRun', p_max_rows_per_run
        )),
        timeout_milliseconds := 120000
      )
      from secrets
      where project_url is not null
        and bearer_token is not null
        and nullif(trim(p_source_key), '') is not null
    ),
    0::bigint
  );
$$;

create or replace function public.get_data_sync_scheduler_health()
returns table (
  scheduler_job_configured boolean,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_sync_status text,
  last_sync_error text
)
language sql
stable
security definer
set search_path = public, raw, cron
as $$
  select
    exists (
      select 1
      from cron.job j
      where j.jobname = 'data_sync_dispatch_daily_0600_denver'
    ) as scheduler_job_configured,
    latest.started_at as last_sync_started_at,
    latest.completed_at as last_sync_completed_at,
    latest.status as last_sync_status,
    latest.error_message as last_sync_error
  from (
    select
      r.started_at,
      r.completed_at,
      r.status,
      r.error_message
    from raw.sync_runs r
    order by r.started_at desc nulls last, r.created_at desc
    limit 1
  ) latest;
$$;

do $mig$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'qlik_dispatch_daily_0600_denver';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'data_sync_dispatch_daily_0600_denver';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'data_sync_dispatch_daily_0600_denver',
    '0 12,13 * * *',
    $job$
      with secrets as (
        select
          coalesce(
            (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1),
            (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
          ) as project_url,
          coalesce(
            (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_BEARER_TOKEN' limit 1),
            (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_bearer_token' limit 1),
            (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
          ) as bearer_token
      )
      select
        case
          when extract(hour from (now() at time zone 'America/Denver')) = 6
               and project_url is not null
               and bearer_token is not null
          then net.http_post(
            url := project_url || '/functions/v1/data-sync-dispatch',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || bearer_token
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 120000
          )
          else null
        end
      from secrets;
    $job$
  );
end;
$mig$;

do $mig$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'qlik_retention_cleanup_daily_0230_denver';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'data_retention_cleanup_daily_0230_denver';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'data_retention_cleanup_daily_0230_denver',
    '30 8,9 * * *',
    $job$
      do $retention_job$
      begin
        if extract(hour from (now() at time zone 'America/Denver')) = 2 then
          perform raw.run_retention_cleanup(false, null, 100000);
        end if;
      end;
      $retention_job$;
    $job$
  );
end;
$mig$;

grant select on all tables in schema data to anon, authenticated, service_role;
grant execute on all functions in schema data to anon, authenticated, service_role;
grant select on public.source_configs to authenticated, service_role;
grant all on all tables in schema raw to service_role;
grant execute on function raw.run_retention_cleanup(boolean, text, integer) to service_role;
grant execute on function public.invoke_data_sync_dispatch_now() to service_role;
grant execute on function public.invoke_single_data_sync_source(text, integer, integer) to service_role;
grant execute on function public.get_data_sync_scheduler_health() to authenticated, service_role;

revoke all on schema raw from anon, authenticated;
revoke all on all tables in schema raw from anon, authenticated;
revoke all on all functions in schema raw from anon, authenticated;

drop function if exists public.get_canopy_production_last_12_months(date);
drop function if exists public.get_branch_april_summary(date);
drop function if exists public.get_division_april_summary(date);
drop function if exists public.get_loan_officer_april_summary(date);
drop function if exists public.get_processor_april_summary(date);
drop function if exists public.get_underwriter_april_summary(date);
drop function if exists public.get_underwriting_org_april_summary(date);
drop function if exists public.get_corporate_turn_times_rows();
drop function if exists public.get_corporate_turn_times_kpis();
drop function if exists public.get_funded_loans_by_program_previous_month(date);
drop function if exists public.get_employee_directory_rows();
drop function if exists public.get_file_quality_rollups(date);
drop function if exists public.get_points_specialists_summary(date, text);
drop function if exists public.invoke_qlik_dispatch_now();
drop function if exists public.invoke_single_qlik_sync_source(text, integer, integer);
drop function if exists public.get_qlik_scheduler_health();
drop function if exists public.run_qlik_retention_cleanup(boolean, text, integer);

drop table if exists public.qlik_row_ingest_log cascade;
drop table if exists public.qlik_raw_payloads cascade;
drop table if exists public.qlik_sync_runs cascade;
drop table if exists public.qlik_source_configs cascade;
drop table if exists public.qlik_retention_cleanup_runs cascade;
drop table if exists public.qlik_retention_policies cascade;
