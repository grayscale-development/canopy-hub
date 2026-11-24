# Specialist points new index rebuild

`raw.specialist_points_new_pkey` is about 542MB for 86,527 rows. The secondary indexes `idx_specialist_points_new_user_event` (about 38MB) and `idx_specialist_points_new_event_date` (about 29MB) are bloated the same way. `shared_buffers` is 256MB. Those indexes crowd report pages out of cache, so a cold Specialists Points or department-dashboard call misses the 8 second app statement timeout.

The covering indexes in `supabase/migrations/202611240003_report_covering_indexes.sql` are what the rewritten queries scan. This rebuild is still required. It is not a migration. `supabase db push` and the Deploy workflow do not run it. Run it only after Zach's explicit OK, and only after that covering-index migration is on the database you are rebuilding. Do not run it against production or staging as part of opening the pull request.

`REINDEX CONCURRENTLY` cannot run inside a transaction. A blocking `REINDEX` takes `ACCESS EXCLUSIVE` on the table and can hold it for minutes. Do not use a blocking reindex on this primary key.

## What the session may do

- `ShareUpdateExclusiveLock` on each index. Reads and writes continue.
- No long write lock.
- Extra disk for the new index while the old one still exists. The new primary key should be about 8–16MB, so peak extra space is about that size, not another 542MB.
- Wall time on the order of one to a few minutes per index. The work is reading the 127MB heap.
- A failed build leaves an `INVALID` index, often with a `_ccnew` suffix. Queries ignore it, but the next `REINDEX CONCURRENTLY` of that index will not proceed until the invalid one is dropped.

`statement_timeout = 0` in the script is for this maintenance session only. It does not change the authenticator or PostgREST 8 second timeout.

The names below are the indexes that moved into `raw` with the table. `idx_raw_specialist_points_new_user_event` and `idx_raw_specialist_points_new_event_date` are different indexes created later. This script does not rebuild those.

## Run

Use a maintenance connection, not the app role. `psql` autocommit is required.

```bash
psql "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/scripts/reindex_specialist_points_new_concurrently.sql
```

The script sets `statement_timeout` and `lock_timeout` for the session, refuses to continue when an invalid index is already present, then runs:

```sql
reindex index concurrently raw.specialist_points_new_pkey;
reindex index concurrently raw.idx_specialist_points_new_user_event;
reindex index concurrently raw.idx_specialist_points_new_event_date;
```

`lock_timeout` is 15 seconds. If another session already holds `ShareUpdateExclusiveLock` (a vacuum or another reindex), the statement fails immediately instead of queueing. Retry when that lock is gone. Normal inserts do not take that lock.

## If a build fails

Find the invalid index:

```sql
select n.nspname, c.relname, i.indisvalid
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_class t on t.oid = i.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'raw'
  and t.relname = 'specialist_points_new'
  and not i.indisvalid;
```

Drop it outside a transaction, then run the script again:

```sql
drop index concurrently raw.<invalid_index_name>;
```

Do not drop `specialist_points_new_pkey` itself. Drop only the invalid `_ccnew` index.

## After

```sql
select c.relname,
       pg_size_pretty(pg_relation_size(c.oid)) as size,
       i.indisvalid
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_class t on t.oid = i.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'raw'
  and t.relname = 'specialist_points_new'
  and c.relname in (
    'specialist_points_new_pkey',
    'idx_specialist_points_new_user_event',
    'idx_specialist_points_new_event_date',
    'idx_raw_specialist_points_new_event_date_cover'
  )
order by c.relname;
```

The primary key should be on the order of 8–16MB and `indisvalid` should be true for every row. This script does not `VACUUM`. The heap visibility map is already partial on this table; index-only scans use it as it stands.
