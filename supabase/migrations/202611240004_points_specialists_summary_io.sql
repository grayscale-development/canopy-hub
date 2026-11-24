-- Follow-up to 202611240002. The grouping-sets aggregate is unchanged and was
-- not the timeout. A params CTE hid the year bounds, so the planner estimated
-- a few hundred rows, bitmap-scanned the specialist_points_new heap twice
-- (including inline raw_payload), and index-scanned a year of
-- specialist_points_old with event_date < first_new applied only as a join
-- filter. On a cold 256MB shared_buffers that read misses the 8s app timeout.
-- With the dates as literals, min(event_date) is an index-only scan.
--
-- This wrapper computes the scalars, then runs the same aggregate. first_new
-- is its own statement so the old-table upper bound is a real parameter:
-- event_date >= window_start and event_date < first_new when a new row exists,
-- otherwise the inclusive window. The new table is scanned once for its
-- points, not once for the min and again for the heap. Totals, calibrated
-- company months, and the organization list are unchanged. work_mem and
-- statement_timeout are unchanged.

create or replace function data.get_points_specialists_summary(
  p_reference_date date default current_date,
  p_pa_org_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = 'force_custom_plan'
as $function$
declare
  v_window_start date;
  v_window_end date;
  v_selected_pa_org_id text;
  v_first_new date;
  v_old_end_exclusive date;
  payload jsonb;
begin
  v_window_end := p_reference_date;
  v_window_start := (date_trunc('month', p_reference_date)::date - interval '1 year')::date;
  v_selected_pa_org_id := nullif(trim(p_pa_org_id), '');

  -- All-orgs min must not carry an organization filter, or the planner cannot
  -- take the first event_date index entry. One organization still filters.
  if v_selected_pa_org_id is null then
    select min(n.event_date)
      into v_first_new
    from raw.specialist_points_new n
    where n.event_date >= v_window_start
      and n.event_date <= v_window_end;
  else
    select min(n.event_date)
      into v_first_new
    from raw.specialist_points_new n
    where n.event_date >= v_window_start
      and n.event_date <= v_window_end
      and n.pa_org_id = v_selected_pa_org_id;
  end if;

  if v_first_new is null then
    v_old_end_exclusive := v_window_end + 1;
  else
    v_old_end_exclusive := least(v_first_new, v_window_end + 1);
  end if;

  with old_points as (
    select o.pa_org_id, o.user_id, o.event_date, o.month_date, coalesce(o.points, 0)::numeric as points
    from raw.specialist_points_old o
    where o.event_date >= v_window_start
      and o.event_date < v_old_end_exclusive
      and (v_selected_pa_org_id is null or o.pa_org_id = v_selected_pa_org_id)
  ),
  new_points as (
    select n.pa_org_id, n.user_id, n.event_date, n.month_date, coalesce(n.points, 0)::numeric as points
    from raw.specialist_points_new n
    where n.event_date >= v_window_start
      and n.event_date <= v_window_end
      and (v_selected_pa_org_id is null or n.pa_org_id = v_selected_pa_org_id)
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
      (v_window_start + (((8 - extract(isodow from v_window_start)::int) % 7) * interval '1 day'))::date as first_week_start,
      v_window_end as window_end
  ),
  weekly_buckets as (
    select w.week_start::date as week_start
    from week_window ww
    cross join lateral generate_series(ww.first_week_start::timestamp, ww.window_end::timestamp, interval '7 day') as w(week_start)
  ),
  weekly_rows as (
    select
      wb.week_start,
      least((wb.week_start + interval '6 day')::date, v_window_end) as week_end,
      coalesce(wp.total_points, 0)::numeric as total_points
    from weekly_buckets wb
    left join weekly_points wp on wp.week_start = wb.week_start
  ),
  month_buckets as (
    select m.month_start::date as month_start
    from generate_series(
      date_trunc('month', v_window_start)::timestamp,
      date_trunc('month', v_window_end)::timestamp,
      interval '1 month'
    ) as m(month_start)
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
        when v_selected_pa_org_id is null then coalesce(cmt.total_points, rmr.total_points)
        else rmr.total_points
      end as total_points
    from raw_monthly_rows rmr
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
    'window_start_iso', v_window_start::text,
    'window_end_iso', v_window_end::text,
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
  )
  into payload;

  return payload;
end;
$function$;

revoke all on function data.get_points_specialists_summary(date, text)
  from public, anon;
grant execute on function data.get_points_specialists_summary(date, text)
  to authenticated, service_role;

comment on function data.get_points_specialists_summary(date, text) is
  'Specialists Points summary for the month-truncated year ending on the reference date. Old-table rows count only before the first new-table event in that window. Company-wide months in the calibrated list keep those fixed totals. An organization filter uses raw totals and still lists every known organization.';
