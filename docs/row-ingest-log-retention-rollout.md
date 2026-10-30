# Row ingest log retention rollout

The nightly job `data_retention_cleanup_daily_0230_denver` deletes old `raw.sync_runs` rows. That delete cascades to `raw.row_ingest_log` through `run_id`. The log table has no index on `run_id`, so each cascaded delete scans the whole table, the statement times out, and the transaction rolls back every policy in the run.

`supabase/migrations/202610300001_row_ingest_log_retention_cleanup.sql` shortens `row_ingest_log` retention to 14 days, raises its batch size to 200000, deletes that table by `created_at` in batches before `sync_runs`, and stops one table's timeout from rolling back the batches that already finished. The policy key stays `row_ingest_log_90d`. Specialist point policies are unchanged.

Do not apply the migration on production until the index exists. A plain `CREATE INDEX` inside the migration would block data-sync writes while it builds, and `CREATE INDEX CONCURRENTLY` cannot run inside the migration transaction. On a table larger than 1 GiB the migration raises instead of building the index. Local and CI databases are small, so they build it inline.

## Before the migration, on production

Run this on its own, not inside `BEGIN`. It can take a while. Writes continue.

```sql
select c.relname, i.indisvalid
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'raw'
  and c.relname = 'idx_row_ingest_log_run_id';
```

If that returns a row with `indisvalid = false`, a previous concurrent build failed. Drop it, then create it again:

```sql
drop index concurrently if exists raw.idx_row_ingest_log_run_id;
```

Then:

```sql
create index concurrently if not exists idx_row_ingest_log_run_id
  on raw.row_ingest_log (run_id);
```

Confirm `indisvalid` is true before applying the migration. The migration's index step is then a no-op.

## Apply

Apply the migration through the normal migration path. Do not run it by hand against production from a checkout. Applying it also reschedules `data_retention_cleanup_daily_0230_denver` with the same UTC hours and raises that job's third argument from `100000` to `2000000`. It does not run a cleanup itself.

After it is applied, a dry run is optional:

```sql
select *
from raw.run_retention_cleanup(true, 'row_ingest_log_90d', 2000000);
```

`matched_count` for `row_ingest_log` is capped at the run limit plus one. It is not a full backlog count.

## After the next nights

Read `raw.retention_cleanup_runs`, not only cron success. A policy timeout is stored as `status = 'failed'` with `deleted_total` for the batches that finished. Those batches commit, and the cron job itself stays successful, because the function records the error and returns. `error_message` names the policy. On PostgreSQL 15, catching `statement_timeout` disarms it for the rest of that cron statement. Later batches in the same call are bounded by the 2,000,000 row cap, not by a new timer. The function cannot arm one from the inside.

Catch-up deletes about 2,000,000 `row_ingest_log` rows per night (ten batches, after the small `source_payloads` batch). While that cap is used up, `sync_runs` and the specialist point policies delete nothing that night. That is temporary. Daily ingest is about 160,000 rows, so once the 14-day window is reached the other policies fit in the same run.

Expect table and index bloat until autovacuum catches up. A later manual `VACUUM (ANALYZE) raw.row_ingest_log` is a separate operation, not part of this migration.

## Rollback

New cleanup behavior stops if the function and the one policy row are restored. The `run_id` index can stay; dropping it brings the sequential-scan timeout back. To restore the previous cap, reschedule the job with `100000` as the third argument. To restore the previous retention without restoring the old function:

```sql
update raw.retention_policies
set retention_interval = interval '90 days',
    batch_size = 10000,
    description = 'Per-row ingest audit logs.'
where policy_key = 'row_ingest_log_90d';
```

The widened `batch_size` check allows the old value. Revert the migration file to restore the previous function body and the 100000 job cap.
