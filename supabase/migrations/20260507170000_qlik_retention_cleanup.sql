-- Daily retention cleanup for high-volume Qlik operational data.
--
-- Policies are intentionally conservative. They target import telemetry and
-- rolling specialist point history, not core business tables such as
-- production_data, employees, branches, or divisions.

create table if not exists public.qlik_retention_policies (
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

drop trigger if exists trg_qlik_retention_policies_updated_at on public.qlik_retention_policies;
create trigger trg_qlik_retention_policies_updated_at
before update on public.qlik_retention_policies
for each row
execute function public.set_updated_at();

create table if not exists public.qlik_retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  dry_run boolean not null default false,
  status text not null check (status in ('running','success','failed')),
  deleted_total integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  error_message text
);

create index if not exists idx_qlik_retention_cleanup_runs_started
  on public.qlik_retention_cleanup_runs(started_at desc);

create index if not exists idx_qlik_row_ingest_log_created
  on public.qlik_row_ingest_log(created_at);

create index if not exists idx_qlik_sync_runs_created
  on public.qlik_sync_runs(created_at);

create index if not exists idx_qlik_raw_payloads_created
  on public.qlik_raw_payloads(created_at);

create index if not exists idx_specialist_points_old_event_date
  on public.specialist_points_old(event_date);

create index if not exists idx_specialist_points_new_event_date
  on public.specialist_points_new(event_date);

insert into public.qlik_retention_policies (
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
    'qlik_raw_payloads_30d',
    'public.qlik_raw_payloads'::regclass,
    'created_at',
    interval '30 days',
    10000,
    true,
    'Raw Qlik API payload snapshots. Useful for recent debugging only.'
  ),
  (
    'qlik_row_ingest_log_90d',
    'public.qlik_row_ingest_log'::regclass,
    'created_at',
    interval '90 days',
    10000,
    true,
    'Per-row ingest audit logs. Keep enough history for recent sync investigation.'
  ),
  (
    'qlik_sync_runs_180d',
    'public.qlik_sync_runs'::regclass,
    'created_at',
    interval '180 days',
    5000,
    true,
    'Qlik sync run metadata. Deleting old runs cascades to their remaining raw payloads and row logs.'
  ),
  (
    'specialist_points_old_30mo',
    'public.specialist_points_old'::regclass,
    'event_date',
    interval '30 months',
    10000,
    true,
    'Old specialist point source rows outside the active reporting and audit window.'
  ),
  (
    'specialist_points_new_30mo',
    'public.specialist_points_new'::regclass,
    'event_date',
    interval '30 months',
    10000,
    true,
    'New specialist point source rows outside the active reporting and audit window.'
  )
on conflict (policy_key)
do update set
  target_table = excluded.target_table,
  date_column = excluded.date_column,
  retention_interval = excluded.retention_interval,
  batch_size = excluded.batch_size,
  is_enabled = excluded.is_enabled,
  description = excluded.description;

create or replace function public.run_qlik_retention_cleanup(
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
set search_path = public
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
  insert into public.qlik_retention_cleanup_runs (dry_run, status)
  values (p_dry_run, 'running')
  returning id into run_id_value;

  for policy in
    select p.*
    from public.qlik_retention_policies p
    where p.is_enabled
      and (p_policy_key is null or p.policy_key = p_policy_key)
    order by
      case p.policy_key
        when 'qlik_raw_payloads_30d' then 10
        when 'qlik_row_ingest_log_90d' then 20
        when 'qlik_sync_runs_180d' then 30
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

  update public.qlik_retention_cleanup_runs
  set
    completed_at = now(),
    status = 'success',
    deleted_total = total_deleted,
    details = result_details
  where id = run_id_value;

exception
  when others then
    update public.qlik_retention_cleanup_runs
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

revoke all on function public.run_qlik_retention_cleanup(boolean, text, integer) from public;
grant execute on function public.run_qlik_retention_cleanup(boolean, text, integer) to service_role;

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

  perform cron.schedule(
    'qlik_retention_cleanup_daily_0230_denver',
    '30 8,9 * * *',
    $job$
      do $retention_job$
      begin
        if extract(hour from (now() at time zone 'America/Denver')) = 2 then
          perform public.run_qlik_retention_cleanup(false, null, 100000);
        end if;
      end;
      $retention_job$;
    $job$
  );
end;
$mig$;
