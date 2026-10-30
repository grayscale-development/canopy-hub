-- Nightly raw.run_retention_cleanup has been failing since the row_ingest_log
-- table outgrew a sequential scan. Deleting raw.sync_runs cascades to
-- raw.row_ingest_log via run_id, and that column had no index.
--
-- This migration:
--   1. Adds idx_row_ingest_log_run_id, but refuses to build it inside the
--      migration transaction when the table is already large. On production,
--      create that index with CREATE INDEX CONCURRENTLY first. See
--      docs/row-ingest-log-retention-rollout.md.
--   2. Keeps policy_key row_ingest_log_90d (the name is historical) and sets
--      its retention to 14 days and its batch size to 200000.
--   3. Raises the batch_size check so 200000 is legal. Other policy rows,
--      including both specialist_points policies, are not updated.
--   4. Replaces raw.run_retention_cleanup. row_ingest_log is still deleted by
--      its own created_at, in batches, before sync_runs. Each count and each
--      delete batch is its own subtransaction. query_canceled is caught per
--      batch, and the function returns normally, so a timeout rolls back only
--      the batch that was running. Batches that already finished commit with
--      the cron statement. On PostgreSQL 15, catching that timeout disarms it
--      for the rest of the same top-level statement; the per-run row cap is
--      what bounds the rest of the call. Setting statement_timeout from inside
--      this function does not arm a new timer, so this migration does not try.
--   5. Raises the nightly job's per-run cap from 100000 to 2000000. The old
--      cap is below one new batch and below daily ingest, so the larger batch
--      size would never have been used.

-- Prod tables of this size must not take a blocking index build here.
do $mig$
declare
  index_valid boolean;
  table_bytes bigint;
begin
  select i.indisvalid
    into index_valid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'raw'
    and c.relname = 'idx_row_ingest_log_run_id';

  if index_valid is true then
    return;
  end if;

  select pg_catalog.pg_total_relation_size('raw.row_ingest_log'::regclass)
    into table_bytes;

  if coalesce(table_bytes, 0) > 1073741824 then
    raise exception using
      message = 'idx_row_ingest_log_run_id is missing or invalid on a large raw.row_ingest_log',
      hint = 'Run this outside a transaction before applying the migration: CREATE INDEX CONCURRENTLY idx_row_ingest_log_run_id ON raw.row_ingest_log (run_id); If an invalid index of that name exists, DROP INDEX CONCURRENTLY raw.idx_row_ingest_log_run_id; and create it again. See docs/row-ingest-log-retention-rollout.md.';
  end if;

  execute 'drop index if exists raw.idx_row_ingest_log_run_id';
  execute 'create index idx_row_ingest_log_run_id on raw.row_ingest_log (run_id)';
end;
$mig$;

do $mig$
declare
  constraint_name text;
  constraint_def text;
begin
  select c.conname, pg_catalog.pg_get_constraintdef(c.oid)
    into constraint_name, constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'raw'
    and t.relname = 'retention_policies'
    and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) ilike '%batch_size%';

  if constraint_name is not null and constraint_def not ilike '%200000%' then
    execute format(
      'alter table raw.retention_policies drop constraint %I',
      constraint_name
    );
    constraint_name := null;
  end if;

  if constraint_name is null then
    alter table raw.retention_policies
      add constraint retention_policies_batch_size_check
      check (batch_size between 1 and 200000);
  end if;
end;
$mig$;

insert into raw.retention_policies (
  policy_key,
  target_table,
  date_column,
  retention_interval,
  batch_size,
  is_enabled,
  description
)
values (
  'row_ingest_log_90d',
  'raw.row_ingest_log'::regclass,
  'created_at',
  interval '14 days',
  200000,
  true,
  'Per-row ingest audit logs kept for 14 days. policy_key name is historical.'
)
on conflict (policy_key) do update set
  target_table = excluded.target_table,
  date_column = excluded.date_column,
  retention_interval = excluded.retention_interval,
  batch_size = excluded.batch_size,
  description = excluded.description;

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
set search_path = ''
as $retention$
declare
  run_id_value uuid;
  policy record;
  cutoff_value timestamptz;
  matched_value integer;
  deleted_value integer;
  batch_deleted integer;
  batch_limit integer;
  total_deleted integer := 0;
  result_details jsonb := '[]'::jsonb;
  count_error text;
  policy_error text;
  run_error text;
  any_failed boolean := false;
  count_failed boolean;
  delete_this_policy boolean;
  loop_this_policy boolean;
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
    cutoff_value := pg_catalog.now() - policy.retention_interval;
    matched_value := 0;
    deleted_value := 0;
    batch_deleted := 0;
    count_error := null;
    policy_error := null;
    count_failed := false;

    begin
      -- A full count of row_ingest_log during catch-up can choose a sequential
      -- scan, so that policy counts only as far as the run cap and uses the
      -- created_at index.
      if policy.policy_key = 'row_ingest_log_90d' then
        execute format(
          'select count(*)::integer from (
             select 1
             from %s
             where %I < $1
             order by %I
             limit $2
           ) capped',
          policy.target_table,
          policy.date_column,
          policy.date_column
        )
        using cutoff_value, least(coalesce(p_max_total_deletes, 0), 2147483646) + 1
        into matched_value;
      else
        execute format(
          'select count(*)::integer from %s where %I < $1',
          policy.target_table,
          policy.date_column
        )
        using cutoff_value
        into matched_value;
      end if;
    exception
      when query_canceled then
        count_failed := true;
        count_error := sqlerrm;
        matched_value := 0;
      when others then
        count_failed := true;
        count_error := sqlerrm;
        matched_value := 0;
    end;

    -- row_ingest_log still deletes when the count times out. Other policies
    -- skip the delete and record the count error.
    if count_failed and policy.policy_key <> 'row_ingest_log_90d' then
      policy_error := count_error;
    end if;

    delete_this_policy := not p_dry_run
      and policy_error is null
      and total_deleted < p_max_total_deletes
      and (
        (policy.policy_key = 'row_ingest_log_90d' and (count_failed or matched_value > 0))
        or (policy.policy_key <> 'row_ingest_log_90d' and matched_value > 0)
      );

    if not p_dry_run
      and not delete_this_policy
      and policy_error is null
      and matched_value > 0
      and total_deleted >= p_max_total_deletes
    then
      matched_value := 0;
    end if;

    if delete_this_policy then
      loop_this_policy := policy.policy_key = 'row_ingest_log_90d';

      loop
        exit when total_deleted >= p_max_total_deletes;

        batch_limit := least(
          policy.batch_size,
          greatest(p_max_total_deletes - total_deleted, 0)
        );
        exit when batch_limit <= 0;

        begin
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
          using cutoff_value, batch_limit
          into batch_deleted;

          batch_deleted := coalesce(batch_deleted, 0);
          deleted_value := deleted_value + batch_deleted;
          total_deleted := total_deleted + batch_deleted;
        exception
          when query_canceled then
            policy_error := sqlerrm;
            batch_deleted := 0;
          when others then
            policy_error := sqlerrm;
            batch_deleted := 0;
        end;

        exit when policy_error is not null;
        exit when not loop_this_policy;
        exit when batch_deleted < batch_limit;
      end loop;
    end if;

    if policy_error is not null then
      any_failed := true;
      run_error := concat_ws('; ', run_error, policy.policy_key || ': ' || policy_error);
    end if;

    result_details := result_details || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'policy_key', policy.policy_key,
        'target_table', policy.target_table::text,
        'date_column', policy.date_column,
        'cutoff', cutoff_value,
        'matched_count', matched_value,
        'deleted_count', deleted_value,
        'dry_run', p_dry_run,
        'count_error', count_error,
        'error', policy_error
      ))
    );

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
    completed_at = pg_catalog.now(),
    status = case when any_failed then 'failed' else 'success' end,
    deleted_total = total_deleted,
    details = result_details,
    error_message = run_error
  where id = run_id_value;

  if any_failed then
    raise warning 'raw.run_retention_cleanup % completed with policy errors: %', run_id_value, run_error;
  end if;
end;
$retention$;

revoke all on function raw.run_retention_cleanup(boolean, text, integer) from public, anon, authenticated;
grant execute on function raw.run_retention_cleanup(boolean, text, integer) to service_role;

-- Same schedule as 202607270001. Only the per-run delete cap changes, from
-- 100000 to 2000000 (ten row_ingest_log batches). Applying this migration
-- reschedules the job; it does not run the cleanup.
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
          perform raw.run_retention_cleanup(false, null, 2000000);
        end if;
      end;
      $retention_job$;
    $job$
  );
end;
$mig$;
