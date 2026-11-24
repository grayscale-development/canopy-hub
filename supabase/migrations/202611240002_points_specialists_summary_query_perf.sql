-- Specialists Points stored every point row, then scanned that copy once per
-- weekly total, monthly total, top user, and organization total. At the
-- default 4MB work_mem the copy spilled (about 12MB written, 26MB read back)
-- on a production-sized year of specialist_points_old and specialist_points_new.
--
-- The totals are unchanged. Point rows are aggregated once into week, month,
-- user, and organization sums, and those small results fill the same buckets,
-- calibrated company months, top-20 list, and organization list. Old rows
-- still stop at the first new-table event in the window. statement_timeout
-- and work_mem are unchanged.

create or replace function data.get_points_specialists_summary(
  p_reference_date date default current_date,
  p_pa_org_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
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
point_groups as (
  select
    date_trunc('week', pr.event_date)::date as week_start,
    date_trunc('month', coalesce(pr.month_date, pr.event_date))::date as month_start,
    pr.user_id,
    pr.pa_org_id,
    sum(pr.points)::numeric as total_points,
    grouping(date_trunc('week', pr.event_date)::date) as week_grouped_out,
    grouping(date_trunc('month', coalesce(pr.month_date, pr.event_date))::date) as month_grouped_out,
    grouping(pr.user_id) as user_grouped_out,
    grouping(pr.pa_org_id) as org_grouped_out
  from point_rows pr
  group by grouping sets (
    (date_trunc('week', pr.event_date)::date),
    (date_trunc('month', coalesce(pr.month_date, pr.event_date))::date),
    (pr.user_id),
    (pr.pa_org_id)
  )
),
weekly_points as (
  select week_start, total_points
  from point_groups
  where week_grouped_out = 0
    and month_grouped_out = 1
    and user_grouped_out = 1
    and org_grouped_out = 1
),
monthly_points as (
  select month_start, total_points
  from point_groups
  where week_grouped_out = 1
    and month_grouped_out = 0
    and user_grouped_out = 1
    and org_grouped_out = 1
),
user_points as (
  select user_id, total_points
  from point_groups
  where week_grouped_out = 1
    and month_grouped_out = 1
    and user_grouped_out = 0
    and org_grouped_out = 1
    and user_id is not null
),
org_points as (
  select pa_org_id, total_points
  from point_groups
  where week_grouped_out = 1
    and month_grouped_out = 1
    and user_grouped_out = 1
    and org_grouped_out = 0
    and pa_org_id is not null
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
    coalesce(wp.total_points, 0)::numeric as total_points
  from weekly_buckets wb
  cross join params p
  left join weekly_points wp on wp.week_start = wb.week_start
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
    coalesce(mp.total_points, 0)::numeric as total_points
  from month_buckets mb
  left join monthly_points mp on mp.month_start = mb.month_start
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
    up.user_id,
    coalesce(len.user_name, 'User ' || up.user_id) as user_name,
    up.total_points
  from user_points up
  left join latest_employee_names len on len.user_id = up.user_id
  order by up.total_points desc, coalesce(len.user_name, 'User ' || up.user_id) asc
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
    select pa_org_id from org_points
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
    coalesce(sum(op.total_points), 0)::numeric as total_points
  from all_pa_org_ids ids
  left join synced_pa_org_names spo on spo.pa_org_id = ids.pa_org_id
  left join manual_pa_org_names mn on mn.pa_org_id = ids.pa_org_id
  left join lookup_branches lb on lb.branch_id = ids.pa_org_id
  left join lookup_divisions ld on ld.division_id = ids.pa_org_id
  left join org_points op on op.pa_org_id = ids.pa_org_id
  group by ids.pa_org_id, spo.pa_org_name, mn.pa_org_name, lb.branch_name, ld.division_name
),
org_options as (
  select pa_org_id as id, pa_org_name as name
  from pa_org_rows
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
$function$;

revoke all on function data.get_points_specialists_summary(date, text)
  from public, anon;
grant execute on function data.get_points_specialists_summary(date, text)
  to authenticated, service_role;

comment on function data.get_points_specialists_summary(date, text) is
  'Specialists Points summary for the month-truncated year ending on the reference date. Old-table rows count only before the first new-table event in that window. Company-wide months in the calibrated list keep those fixed totals. An organization filter uses raw totals and still lists every known organization.';
