-- Manual maintenance for raw.specialist_points_new. Not a migration.
-- supabase db push and the Deploy workflow do not run this file.
--
-- Run it only after Zach's explicit OK, in a session that is not the app:
--
--   psql "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/scripts/reindex_specialist_points_new_concurrently.sql
--
-- psql autocommit is required. Do not wrap this file in BEGIN.
-- REINDEX CONCURRENTLY cannot run inside a transaction.
--
-- statement_timeout = 0 applies to this maintenance session only. It does
-- not change the authenticator / PostgREST 8s timeout.
--
-- REINDEX CONCURRENTLY takes ShareUpdateExclusiveLock. Reads and writes
-- continue. It builds a second index, then swaps. A failure leaves an
-- INVALID index (usually named with a _ccnew suffix). Drop that invalid
-- index with DROP INDEX CONCURRENTLY and run this file again. Do not use
-- a blocking REINDEX on specialist_points_new_pkey: that takes
-- ACCESS EXCLUSIVE and can sit for minutes.
--
-- Expected shape on 2026-11-24 production: the primary key is about 542MB
-- for 86,527 rows and should land near 8–16MB. The two secondary indexes
-- are about 38MB and 29MB and should land near a couple of MB. Wall time
-- is the time to read the 127MB heap, on the order of one to a few minutes
-- per index. Extra disk during the build is about the size of the new
-- compact index, not another copy of the 542MB index.

set statement_timeout = 0;
set lock_timeout = '15s';

do $check$
declare
  invalid_name text;
begin
  select n.nspname || '.' || c.relname
    into invalid_name
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'raw'
    and t.relname = 'specialist_points_new'
    and not i.indisvalid
  limit 1;

  if invalid_name is not null then
    raise exception
      'Invalid index % on raw.specialist_points_new. Drop it with DROP INDEX CONCURRENTLY and retry. See docs/specialist-points-new-reindex.md.',
      invalid_name;
  end if;
end
$check$;

reindex index concurrently raw.specialist_points_new_pkey;
reindex index concurrently raw.idx_specialist_points_new_user_event;
reindex index concurrently raw.idx_specialist_points_new_event_date;
