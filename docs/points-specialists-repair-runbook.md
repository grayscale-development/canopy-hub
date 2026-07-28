# Points Specialists Repair Runbook

Use this when deploying the specialist points accuracy fix.

## Why this needs a controlled resync

The previous specialist points transform used `RecordId` as `external_row_key`.
That collapses multiple point events for the same record into one target row.

After deploying the new transform, the key becomes a stable hash of the full
row. Existing `RecordId` keyed rows must be cleared before resyncing, otherwise
old rows and new rows can coexist and double count.

## Deploy Order

1. Deploy the database migration:

```bash
supabase db push --project-ref rvwmxbuycfbmntxkovmn
```

2. Deploy the updated sync function:

```bash
supabase functions deploy data-sync --project-ref rvwmxbuycfbmntxkovmn
```

3. Clear only the specialist point target tables and their ingest logs:

```sql
delete from raw.row_ingest_log
where target_table in ('raw.specialist_points_old', 'raw.specialist_points_new');

truncate table
  raw.specialist_points_old,
  raw.specialist_points_new;
```

4. Resync these source configs from `startAt = 0`. DS self-continues until each
source is complete:

```text
specialist_points_old
specialist_points_new
```

Do not use `invoke_data_sync_dispatch_now()` for this repair unless you intend
to refresh every enabled source.

## Validate

After the resync, call:

```sql
select data.get_points_specialists_summary('2026-04-24'::date, null);
```

The monthly summary should preserve decimal totals and should match the
expected April 24, 2026 chart values.
