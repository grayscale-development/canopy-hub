# Specialist points new-key cleanup

Use this once, after the stable `external_row_key` change for
`raw.specialist_points_new` is deployed and one full sync has finished. This
is not a migration. Do not run it against production from the app deploy.

## What the first sync does

Existing rows were inserted under the old key, a SHA-256 of the mapped columns
plus the raw Qlik payload. The new key is a SHA-256 of the normalized identity
(`app_id`, `pa_org_id`, `record_id`, `event`, `event_date`, `user_id`) and an
occurrence rank. The upsert matches `external_row_key`, so it does not see the
old rows. The first complete sync inserts one new-key copy of every current
source row and leaves the old-key copies in place.

Until those old rows are removed, `data.get_points_specialists_summary` sums
both copies. Do not truncate the table before that sync. Truncating first
drops the only copy until the resync finishes.

## When it is safe

Wait until the `specialist_points_new` sync run has `status = 'success'`
(not `running`) and the response metadata has `hasMore = false`. Then preview
the delete. The cutoff is the `started_at` of that run. Rows written by the
new key have `last_synced_at` at or after that instant. Old-key rows were not
updated, so they stay older.

```sql
-- Preview. Replace the timestamp with that run's started_at.
select count(*) as old_key_rows
from raw.specialist_points_new
where last_synced_at < timestamptz '2026-10-31T00:00:00Z';

select count(*) as new_key_rows
from raw.specialist_points_new
where last_synced_at >= timestamptz '2026-10-31T00:00:00Z';
```

`new_key_rows` should be about one copy of the current Qlik extract (tens of
thousands, not the accumulated history). `old_key_rows` should be the
pre-deploy copies.

```sql
delete from raw.specialist_points_new
where last_synced_at < timestamptz '2026-10-31T00:00:00Z';
```

The same cutoff works if a second sync finishes before the delete. A skipped
unchanged row keeps the `last_synced_at` from the insert, which is still
inside the post-deploy window.

`raw.row_ingest_log` is telemetry. Leaving it does not change the points
summary. The nightly ingest-log retention job cleans it on its own schedule.

## If a repeated identity is split across sync chunks

Occurrence is assigned inside one data-sync chunk (`QLIK_MAX_ROWS_PER_RUN`,
default 1000), after sorting by points, then month, then input order. A
repeated `(AppId, PA Org ID, RecordId, Event, Date, User ID)` that falls in
two chunks can get the same rank and collapse. Unique identities are
unaffected. Confirm a post-cleanup count against the Qlik object before
treating the totals as final.
