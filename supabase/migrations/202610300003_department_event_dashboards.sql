-- Processing and Underwriting department dashboards.
-- Ingest only the Qlik "Last 12 Months" event objects. Employee and org
-- summaries, Company Avg, and the Branch / Event Month / Event Week Of /
-- Event / Org filters are computed here so a later Specialists or
-- Closing/Funding department can add its own event table and a branch in
-- data.get_department_dashboard without copying the filter shell.
--
-- Source configs are inserted disabled. Dispatch only reads is_enabled rows.
-- Enable them after the data-sync function that knows these targets is deployed.
-- See docs/department-dashboards.md.

create table if not exists raw.processing_events (
  external_row_key text primary key,
  app_id text,
  organization_name text,
  organization_id text,
  loan_program_code text,
  employee_id text,
  employee_name text,
  event text,
  event_date date,
  points numeric,
  processing_net_workdays numeric,
  released_to_closer date,
  closing_deadline date,
  docs_to_closing numeric,
  is_closing_funding_rush boolean,
  rush_percent_raw numeric,
  raw_payload jsonb not null,
  source_record_hash text not null,
  last_synced_at timestamptz not null default now()
);

create table if not exists raw.underwriting_events (
  external_row_key text primary key,
  app_id text,
  organization_name text,
  organization_id text,
  loan_program_code text,
  employee_id text,
  employee_name text,
  event text,
  event_date date,
  points numeric,
  submitted_for_initial_review date,
  initial_review_complete date,
  workdays_in_initial_review numeric,
  qc_count numeric,
  avg_qc_score numeric,
  is_bad_loan boolean,
  bad_loan_percent_raw numeric,
  raw_payload jsonb not null,
  source_record_hash text not null,
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_raw_processing_events_event_date
  on raw.processing_events (event_date);
create index if not exists idx_raw_processing_events_employee_date
  on raw.processing_events (employee_id, event_date);
create index if not exists idx_raw_processing_events_org_date
  on raw.processing_events (organization_id, event_date);
create index if not exists idx_raw_processing_events_app_id
  on raw.processing_events (app_id);

create index if not exists idx_raw_underwriting_events_event_date
  on raw.underwriting_events (event_date);
create index if not exists idx_raw_underwriting_events_employee_date
  on raw.underwriting_events (employee_id, event_date);
create index if not exists idx_raw_underwriting_events_org_date
  on raw.underwriting_events (organization_id, event_date);
create index if not exists idx_raw_underwriting_events_app_id
  on raw.underwriting_events (app_id);

alter table raw.processing_events enable row level security;
alter table raw.underwriting_events enable row level security;

revoke all on raw.processing_events from public, anon, authenticated;
revoke all on raw.underwriting_events from public, anon, authenticated;
grant all on raw.processing_events to service_role;
grant all on raw.underwriting_events to service_role;
grant select on raw.processing_events to authenticated;
grant select on raw.underwriting_events to authenticated;

drop policy if exists report_read_authenticated on raw.processing_events;
create policy report_read_authenticated on raw.processing_events
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists report_read_authenticated on raw.underwriting_events;
create policy report_read_authenticated on raw.underwriting_events
  for select to authenticated
  using (auth.uid() is not null);

create or replace view data.processing_events
with (security_invoker = true) as
select * from raw.processing_events;

create or replace view data.underwriting_events
with (security_invoker = true) as
select * from raw.underwriting_events;

revoke all on data.processing_events from public, anon;
revoke all on data.underwriting_events from public, anon;
grant select on data.processing_events to authenticated, service_role;
grant select on data.underwriting_events to authenticated, service_role;

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
  (
    'processing_events_14mo',
    'raw.processing_events'::regclass,
    'event_date',
    interval '14 months',
    10000,
    true,
    'Processing department events outside the 12-month dashboard window. Upserts do not delete rows that fall off the Qlik extract.'
  ),
  (
    'underwriting_events_14mo',
    'raw.underwriting_events'::regclass,
    'event_date',
    interval '14 months',
    10000,
    true,
    'Underwriting department events outside the 12-month dashboard window. Upserts do not delete rows that fall off the Qlik extract.'
  )
on conflict (policy_key) do update set
  target_table = excluded.target_table,
  date_column = excluded.date_column,
  retention_interval = excluded.retention_interval,
  batch_size = excluded.batch_size,
  is_enabled = excluded.is_enabled,
  description = excluded.description;

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
    'processing_events',
    'qlik',
    'Processing Last 12 Months events for the department dashboard. Disabled until data-sync is deployed with the processing_events target. Natural key is AppId + Event + EmployeeId + Date.',
    jsonb_build_object(
      'app_id', '8cf1d499-2303-44e0-a3ae-3a029c951270',
      'sheet_id', 'mjkMka',
      'object_id', 'phqfdS',
      'object_description', 'Processing Last 12 Months',
      'primary_key_strategy', 'natural_key',
      'natural_key_columns', jsonb_build_array('AppId', 'Event', 'EmployeeId', 'Date')
    ),
    'raw.processing_events',
    false
  ),
  (
    'underwriting_events',
    'qlik',
    'Underwriting Last 12 Months events for the department dashboard. Disabled until data-sync is deployed with the underwriting_events target. Natural key is AppId + Event + EmployeeId + Date.',
    jsonb_build_object(
      'app_id', '8cf1d499-2303-44e0-a3ae-3a029c951270',
      'sheet_id', '19dfa7e3-7cfb-4f4f-bc72-b590abb24514',
      'object_id', '3926bb86-4cb8-4ef5-9726-95907d6b967a',
      'object_description', 'Underwriting Last 12 Months',
      'primary_key_strategy', 'natural_key',
      'natural_key_columns', jsonb_build_array('AppId', 'Event', 'EmployeeId', 'Date')
    ),
    'raw.underwriting_events',
    false
  )
on conflict (source_key) do update set
  source_type = excluded.source_type,
  description = excluded.description,
  config = excluded.config,
  target_table = excluded.target_table,
  is_enabled = excluded.is_enabled,
  updated_at = now();

create or replace function data.get_department_dashboard(
  p_department text,
  p_branch_id text default null,
  p_event_month date default null,
  p_event_week date default null,
  p_event text default null,
  p_org_id text default null,
  p_event_limit integer default 100,
  p_event_offset integer default 0,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $department$
declare
  payload jsonb;
begin
  if lower(btrim(coalesce(p_department, ''))) not in ('processing', 'underwriting') then
    raise exception 'Unsupported department: %', p_department
      using errcode = '22023';
  end if;

  with params as (
    select
      lower(btrim(p_department)) as department,
      (date_trunc('month', p_reference_date)::date - interval '11 months')::date as window_start,
      (date_trunc('month', p_reference_date)::date + interval '1 month' - interval '1 day')::date as window_end,
      nullif(btrim(p_branch_id), '') as branch_id,
      case
        when p_event_month is null then null
        else date_trunc('month', p_event_month)::date
      end as event_month,
      case
        when p_event_week is null then null
        else date_trunc('week', p_event_week)::date
      end as event_week,
      nullif(btrim(p_event), '') as event_name,
      nullif(btrim(p_org_id), '') as org_id,
      least(greatest(coalesce(p_event_limit, 100), 1), 200) as event_limit,
      greatest(coalesce(p_event_offset, 0), 0) as event_offset
  ),
  employee_lookup as (
    select distinct on (nullif(btrim(e.user_id), ''))
      nullif(btrim(e.user_id), '') as user_id,
      nullif(btrim(e.user_name), '') as user_name
    from raw.employees e
    where nullif(btrim(e.user_id), '') is not null
    order by nullif(btrim(e.user_id), ''), e.last_synced_at desc nulls last, e.external_row_key desc
  ),
  processing_org_lookup as (
    select distinct on (nullif(btrim(o.org_id), ''))
      nullif(btrim(o.org_id), '') as org_id,
      nullif(btrim(o.org_name), '') as org_name
    from raw.processing_assistant_orgs o
    where nullif(btrim(o.org_id), '') is not null
    order by nullif(btrim(o.org_id), ''), o.last_synced_at desc nulls last, o.external_row_key desc
  ),
  underwriting_org_lookup as (
    select distinct on (nullif(btrim(o.org_id), ''))
      nullif(btrim(o.org_id), '') as org_id,
      nullif(btrim(o.org_name), '') as org_name
    from raw.underwriting_orgs o
    where nullif(btrim(o.org_id), '') is not null
    order by nullif(btrim(o.org_id), ''), o.last_synced_at desc nulls last, o.external_row_key desc
  ),
  branch_lookup as (
    select distinct on (nullif(btrim(b.branch_id), ''))
      nullif(btrim(b.branch_id), '') as branch_id,
      nullif(btrim(b.branch_name), '') as branch_name
    from raw.branches b
    where nullif(btrim(b.branch_id), '') is not null
    order by nullif(btrim(b.branch_id), ''), b.last_synced_at desc nulls last, b.external_row_key desc
  ),
  processing_source as (
    select
      nullif(btrim(e.app_id), '') as app_id,
      nullif(btrim(e.organization_id), '') as organization_id,
      nullif(btrim(e.organization_name), '') as organization_name,
      nullif(btrim(e.loan_program_code), '') as loan_program_code,
      nullif(btrim(e.employee_id), '') as employee_id,
      nullif(btrim(e.employee_name), '') as employee_name,
      nullif(btrim(e.event), '') as event_name,
      e.event_date,
      e.points,
      e.processing_net_workdays,
      e.released_to_closer,
      e.closing_deadline,
      e.docs_to_closing,
      e.is_closing_funding_rush,
      null::date as submitted_for_initial_review,
      null::date as initial_review_complete,
      null::numeric as workdays_in_initial_review,
      null::numeric as qc_count,
      null::numeric as avg_qc_score,
      null::boolean as is_bad_loan,
      e.external_row_key
    from raw.processing_events e
    cross join params p
    where p.department = 'processing'
      and e.event_date between p.window_start and p.window_end
      and lower(coalesce(btrim(e.employee_name), '')) not in ('company avg', 'company average', 'company averages')
      and lower(coalesce(btrim(e.organization_name), '')) not in ('company avg', 'company average', 'company averages')
  ),
  underwriting_source as (
    select
      nullif(btrim(e.app_id), '') as app_id,
      nullif(btrim(e.organization_id), '') as organization_id,
      nullif(btrim(e.organization_name), '') as organization_name,
      nullif(btrim(e.loan_program_code), '') as loan_program_code,
      nullif(btrim(e.employee_id), '') as employee_id,
      nullif(btrim(e.employee_name), '') as employee_name,
      nullif(btrim(e.event), '') as event_name,
      e.event_date,
      e.points,
      null::numeric as processing_net_workdays,
      null::date as released_to_closer,
      null::date as closing_deadline,
      null::numeric as docs_to_closing,
      null::boolean as is_closing_funding_rush,
      e.submitted_for_initial_review,
      e.initial_review_complete,
      e.workdays_in_initial_review,
      e.qc_count,
      e.avg_qc_score,
      e.is_bad_loan,
      e.external_row_key
    from raw.underwriting_events e
    cross join params p
    where p.department = 'underwriting'
      and e.event_date between p.window_start and p.window_end
      and lower(coalesce(btrim(e.employee_name), '')) not in ('company avg', 'company average', 'company averages')
      and lower(coalesce(btrim(e.organization_name), '')) not in ('company avg', 'company average', 'company averages')
  ),
  events_in_window as (
    select * from processing_source
    union all
    select * from underwriting_source
  ),
  loan_branch as (
    select distinct on (nullif(btrim(p.loan_number), ''))
      nullif(btrim(p.loan_number), '') as loan_number,
      nullif(btrim(p.branch_id), '') as branch_id
    from raw.production_data p
    where nullif(btrim(p.loan_number), '') is not null
      and nullif(btrim(p.loan_number), '') in (
        select app_id from events_in_window where app_id is not null
      )
    order by nullif(btrim(p.loan_number), ''), p.last_synced_at desc nulls last, p.external_row_key desc
  ),
  events_with_dims as (
    select
      ev.*,
      lb.branch_id,
      coalesce(bl.branch_name, case when lb.branch_id is null then null else 'Branch ' || lb.branch_id end) as branch_name,
      coalesce(
        el.user_name,
        ev.employee_name,
        case when ev.employee_id is null then 'Unassigned' else 'Employee ' || ev.employee_id end
      ) as employee_label,
      coalesce(
        case
          when (select department from params) = 'processing' then pol.org_name
          else uol.org_name
        end,
        ev.organization_name,
        case when ev.organization_id is null then 'Unassigned' else 'Org ' || ev.organization_id end
      ) as organization_label
    from events_in_window ev
    left join loan_branch lb on lb.loan_number = ev.app_id
    left join branch_lookup bl on bl.branch_id = lb.branch_id
    left join employee_lookup el on el.user_id = ev.employee_id
    left join processing_org_lookup pol on pol.org_id = ev.organization_id
    left join underwriting_org_lookup uol on uol.org_id = ev.organization_id
  ),
  filtered as (
    select d.*
    from events_with_dims d
    cross join params p
    where (p.branch_id is null or d.branch_id = p.branch_id)
      and (
        p.event_month is null
        or (
          d.event_date >= p.event_month
          and d.event_date < (p.event_month + interval '1 month')::date
        )
      )
      and (
        p.event_week is null
        or (
          d.event_date >= p.event_week
          and d.event_date < (p.event_week + interval '7 days')::date
        )
      )
      and (
        p.event_name is null
        or lower(d.event_name) = lower(p.event_name)
      )
      and (p.org_id is null or d.organization_id = p.org_id)
  ),
  employee_metrics as (
    select
      f.employee_id,
      max(f.employee_label) as employee_label,
      count(*) filter (where lower(f.event_name) = 'funded')::numeric as total_funded,
      count(*)::numeric as event_count,
      coalesce(sum(f.points), 0)::numeric as points,
      avg(f.processing_net_workdays)::numeric as processing_speed,
      avg(f.docs_to_closing)::numeric as docs_to_deadline,
      case
        when count(*) filter (where lower(f.event_name) = 'funded') = 0 then null
        else count(*) filter (
          where lower(f.event_name) = 'funded' and f.is_closing_funding_rush is true
        )::numeric
          / count(*) filter (where lower(f.event_name) = 'funded')::numeric
      end as rush_ratio,
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,
      case
        when count(*) filter (where lower(f.event_name) = 'funded') = 0 then null
        else count(*) filter (
          where lower(f.event_name) = 'funded' and f.is_bad_loan is true
        )::numeric
          / count(*) filter (where lower(f.event_name) = 'funded')::numeric
      end as bad_loan_ratio
    from filtered f
    group by f.employee_id
  ),
  organization_metrics as (
    select
      f.organization_id,
      max(f.organization_label) as organization_label,
      count(*) filter (where lower(f.event_name) = 'funded')::numeric as total_funded,
      count(*)::numeric as event_count,
      coalesce(sum(f.points), 0)::numeric as points,
      avg(f.processing_net_workdays)::numeric as processing_speed,
      avg(f.docs_to_closing)::numeric as docs_to_deadline,
      case
        when count(*) filter (where lower(f.event_name) = 'funded') = 0 then null
        else count(*) filter (
          where lower(f.event_name) = 'funded' and f.is_closing_funding_rush is true
        )::numeric
          / count(*) filter (where lower(f.event_name) = 'funded')::numeric
      end as rush_ratio,
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,
      case
        when count(*) filter (where lower(f.event_name) = 'funded') = 0 then null
        else count(*) filter (
          where lower(f.event_name) = 'funded' and f.is_bad_loan is true
        )::numeric
          / count(*) filter (where lower(f.event_name) = 'funded')::numeric
      end as bad_loan_ratio
    from filtered f
    group by f.organization_id
  ),
  employee_display as (
    select
      0 as sort_rank,
      'company_avg'::text as row_kind,
      null::text as entity_id,
      'Company Avg'::text as label,
      avg(m.total_funded)::numeric as total_funded,
      avg(m.event_count)::numeric as event_count,
      avg(m.points)::numeric as points,
      avg(m.processing_speed)::numeric as processing_speed,
      avg(m.docs_to_deadline)::numeric as docs_to_deadline,
      avg(m.rush_ratio)::numeric as rush_ratio,
      avg(m.initial_review_events)::numeric as initial_review_events,
      avg(m.avg_workdays_initial_review)::numeric as avg_workdays_initial_review,
      avg(m.final_underwriting_events)::numeric as final_underwriting_events,
      avg(m.avg_workdays_underwriting)::numeric as avg_workdays_underwriting,
      avg(m.condition_events)::numeric as condition_events,
      avg(m.avg_workdays_conditions)::numeric as avg_workdays_conditions,
      avg(m.bad_loan_ratio)::numeric as bad_loan_ratio
    from employee_metrics m
    having count(*) > 0
    union all
    select
      1,
      'employee'::text,
      m.employee_id,
      m.employee_label,
      m.total_funded,
      m.event_count,
      m.points,
      m.processing_speed,
      m.docs_to_deadline,
      m.rush_ratio,
      m.initial_review_events,
      m.avg_workdays_initial_review,
      m.final_underwriting_events,
      m.avg_workdays_underwriting,
      m.condition_events,
      m.avg_workdays_conditions,
      m.bad_loan_ratio
    from employee_metrics m
  ),
  organization_display as (
    select
      0 as sort_rank,
      'company_avg'::text as row_kind,
      null::text as entity_id,
      'Company Avg'::text as label,
      avg(m.total_funded)::numeric as total_funded,
      avg(m.event_count)::numeric as event_count,
      avg(m.points)::numeric as points,
      avg(m.processing_speed)::numeric as processing_speed,
      avg(m.docs_to_deadline)::numeric as docs_to_deadline,
      avg(m.rush_ratio)::numeric as rush_ratio,
      avg(m.initial_review_events)::numeric as initial_review_events,
      avg(m.avg_workdays_initial_review)::numeric as avg_workdays_initial_review,
      avg(m.final_underwriting_events)::numeric as final_underwriting_events,
      avg(m.avg_workdays_underwriting)::numeric as avg_workdays_underwriting,
      avg(m.condition_events)::numeric as condition_events,
      avg(m.avg_workdays_conditions)::numeric as avg_workdays_conditions,
      avg(m.bad_loan_ratio)::numeric as bad_loan_ratio
    from organization_metrics m
    having count(*) > 0
    union all
    select
      1,
      'organization'::text,
      m.organization_id,
      m.organization_label,
      m.total_funded,
      m.event_count,
      m.points,
      m.processing_speed,
      m.docs_to_deadline,
      m.rush_ratio,
      m.initial_review_events,
      m.avg_workdays_initial_review,
      m.final_underwriting_events,
      m.avg_workdays_underwriting,
      m.condition_events,
      m.avg_workdays_conditions,
      m.bad_loan_ratio
    from organization_metrics m
  )
  select jsonb_build_object(
    'department', p.department,
    'window_start', p.window_start,
    'window_end', p.window_end,
    'filters', jsonb_build_object(
      'branches', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', s.branch_id, 'label', s.branch_name)
          order by s.branch_name, s.branch_id
        )
        from (
          select d.branch_id, max(d.branch_name) as branch_name
          from events_with_dims d
          where d.branch_id is not null
          group by d.branch_id
        ) s
      ), '[]'::jsonb),
      'months', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', to_char(s.month_start, 'YYYY-MM-DD'),
            'label', to_char(s.month_start, 'Mon YYYY')
          )
          order by s.month_start
        )
        from (
          select distinct date_trunc('month', d.event_date)::date as month_start
          from events_with_dims d
          where d.event_date is not null
        ) s
      ), '[]'::jsonb),
      'weeks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', to_char(s.week_start, 'YYYY-MM-DD'),
            'label', to_char(s.week_start, 'FMMon FMDD, YYYY')
          )
          order by s.week_start
        )
        from (
          select distinct date_trunc('week', d.event_date)::date as week_start
          from events_with_dims d
          where d.event_date is not null
        ) s
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', s.event_name, 'label', s.event_name)
          order by s.event_name
        )
        from (
          select distinct d.event_name
          from events_with_dims d
          where d.event_name is not null
        ) s
      ), '[]'::jsonb),
      'orgs', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', s.organization_id, 'label', s.organization_label)
          order by s.organization_label, s.organization_id
        )
        from (
          select d.organization_id, max(d.organization_label) as organization_label
          from events_with_dims d
          where d.organization_id is not null
          group by d.organization_id
        ) s
      ), '[]'::jsonb)
    ),
    'employees', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'row_kind', d.row_kind,
          'id', d.entity_id,
          'label', d.label,
          'metrics', case
            when (select department from params) = 'processing' then jsonb_build_object(
              'total_funded', d.total_funded,
              'processing_events', d.event_count,
              'points', d.points,
              'processing_speed', d.processing_speed,
              'docs_to_deadline', d.docs_to_deadline,
              'rush_ratio', d.rush_ratio
            )
            else jsonb_build_object(
              'points', d.points,
              'total_funded', d.total_funded,
              'initial_review_events', d.initial_review_events,
              'avg_workdays_initial_review', d.avg_workdays_initial_review,
              'final_underwriting_events', d.final_underwriting_events,
              'avg_workdays_underwriting', d.avg_workdays_underwriting,
              'condition_events', d.condition_events,
              'avg_workdays_conditions', d.avg_workdays_conditions,
              'bad_loan_ratio', d.bad_loan_ratio
            )
          end
        )
        order by d.sort_rank, d.label
      )
      from employee_display d
    ), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'row_kind', d.row_kind,
          'id', d.entity_id,
          'label', d.label,
          'metrics', case
            when (select department from params) = 'processing' then jsonb_build_object(
              'total_funded', d.total_funded,
              'processing_events', d.event_count,
              'points', d.points,
              'processing_speed', d.processing_speed,
              'docs_to_deadline', d.docs_to_deadline,
              'rush_ratio', d.rush_ratio
            )
            else jsonb_build_object(
              'points', d.points,
              'total_funded', d.total_funded,
              'initial_review_events', d.initial_review_events,
              'avg_workdays_initial_review', d.avg_workdays_initial_review,
              'final_underwriting_events', d.final_underwriting_events,
              'avg_workdays_underwriting', d.avg_workdays_underwriting,
              'condition_events', d.condition_events,
              'avg_workdays_conditions', d.avg_workdays_conditions,
              'bad_loan_ratio', d.bad_loan_ratio
            )
          end
        )
        order by d.sort_rank, d.label
      )
      from organization_display d
    ), '[]'::jsonb),
    'events', jsonb_build_object(
      'total', (select count(*)::integer from filtered),
      'limit', p.event_limit,
      'offset', p.event_offset,
      'rows', coalesce((
        select jsonb_agg(
          page.event_row
          order by page.sort_date desc nulls last, page.sort_label asc, page.sort_app asc, page.sort_key asc
        )
        from (
          select
            jsonb_build_object(
              'app_id', f.app_id,
              'organization_id', f.organization_id,
              'organization_name', f.organization_label,
              'loan_program_code', f.loan_program_code,
              'employee_id', f.employee_id,
              'employee_name', f.employee_label,
              'event', f.event_name,
              'event_date', f.event_date,
              'points', f.points,
              'branch_id', f.branch_id,
              'branch_name', f.branch_name,
              'processing_net_workdays', f.processing_net_workdays,
              'released_to_closer', f.released_to_closer,
              'closing_deadline', f.closing_deadline,
              'docs_to_closing', f.docs_to_closing,
              'is_closing_funding_rush', f.is_closing_funding_rush,
              'submitted_for_initial_review', f.submitted_for_initial_review,
              'initial_review_complete', f.initial_review_complete,
              'workdays_in_initial_review', f.workdays_in_initial_review,
              'qc_count', f.qc_count,
              'avg_qc_score', f.avg_qc_score,
              'is_bad_loan', f.is_bad_loan
            ) as event_row,
            f.event_date as sort_date,
            f.employee_label as sort_label,
            f.app_id as sort_app,
            f.external_row_key as sort_key
          from filtered f
          order by f.event_date desc nulls last, f.employee_label asc, f.app_id asc, f.external_row_key asc
          limit (select event_limit from params)
          offset (select event_offset from params)
        ) page
      ), '[]'::jsonb)
    )
  )
  into payload
  from params p;

  return payload;
end;
$department$;

revoke all on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  from public, anon;
grant execute on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  to authenticated, service_role;

comment on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date) is
  'Processing and underwriting department dashboards computed from Last 12 Months event rows. Company Avg is the unweighted mean of the entity rows.';
