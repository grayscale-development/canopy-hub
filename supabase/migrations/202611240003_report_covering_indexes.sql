-- Covering indexes for the report queries that still read wide heaps after
-- 202611240001 / 202611240002. These are plain CREATE INDEX statements, not
-- CREATE INDEX CONCURRENTLY. supabase db push runs this file inside a
-- transaction, and CONCURRENTLY cannot run there.
--
-- Each build takes SHARE on its table: writes wait, reads continue. The lock
-- is held until this file commits, so a write to an earlier table also waits
-- out the later builds. The columns are narrow and the row counts are
-- 86k / 268k / 63k / 44k, so each build should be seconds and the combined
-- write pause should stay well under a minute. Reads are not blocked.
--
-- REINDEX of the bloated raw.specialist_points_new indexes is intentionally
-- not in this file. A blocking REINDEX takes ACCESS EXCLUSIVE. The manual
-- REINDEX CONCURRENTLY script is
-- supabase/scripts/reindex_specialist_points_new_concurrently.sql
-- and docs/specialist-points-new-reindex.md. Deploy does not run it.

create index if not exists idx_raw_specialist_points_new_event_date_cover
  on raw.specialist_points_new (event_date)
  include (pa_org_id, user_id, month_date, points);

create index if not exists idx_raw_specialist_points_old_event_date_cover
  on raw.specialist_points_old (event_date)
  include (pa_org_id, user_id, month_date, points);

-- Expression matches nullif(btrim(loan_number), '') in
-- data.get_department_dashboard. INCLUDE keeps branch_id and the newest-row
-- ordering columns off the production_data heap.
create index if not exists idx_raw_production_data_loan_number_branch
  on raw.production_data (nullif(btrim(loan_number), ''))
  include (branch_id, last_synced_at, external_row_key);

-- Every column data.get_department_dashboard reads from underwriting events.
-- raw_payload stays off this index so a year-range that matches the whole
-- table does not have to read the inline payload heap.
create index if not exists idx_raw_underwriting_events_event_date_cover
  on raw.underwriting_events (event_date)
  include (
    app_id,
    organization_id,
    organization_name,
    loan_program_code,
    employee_id,
    employee_name,
    event,
    event_at,
    points,
    submitted_for_initial_review,
    initial_review_complete,
    workdays_in_initial_review,
    workdays_in_underwriting,
    workdays_in_conditions,
    qc_count,
    avg_qc_score,
    is_bad_loan,
    external_row_key
  );
