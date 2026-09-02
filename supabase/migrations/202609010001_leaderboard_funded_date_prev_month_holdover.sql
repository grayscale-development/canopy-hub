-- Hub leaderboards post previous-month standings for the first 5 calendar days
-- of the new month (America/Denver), then switch to the current month.
-- Month membership uses funded_date (Funded column), matching original
-- leaderboards and other Hub production reports.

create or replace function data.leaderboard_posted_month_start(
  p_reference_date date default (timezone('America/Denver', now()))::date
)
returns date
language sql
stable
as $$
  select case
    when extract(day from p_reference_date)::integer <= 5 then
      (date_trunc('month', p_reference_date) - interval '1 month')::date
    else
      date_trunc('month', p_reference_date)::date
  end;
$$;

grant execute on function data.leaderboard_posted_month_start(date)
to anon, authenticated, service_role;

create or replace view data.current_month_branch_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
branch_lookup as (
  select distinct on (b.branch_id)
    b.branch_id,
    nullif(trim(b.branch_name), '') as branch_name
  from raw.branches b
  where b.branch_id is not null
  order by b.branch_id, b.last_synced_at desc nulls last, b.external_row_key desc
),
aggregated as (
  select
    p.branch_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
  group by p.branch_id
)
select
  a.branch_id,
  coalesce(branch_lookup.branch_name, nullif(a.branch_id, ''), 'Unknown Branch') as branch_name,
  a.file_count,
  a.total_volume
from aggregated a
left join branch_lookup on branch_lookup.branch_id = a.branch_id
order by a.file_count desc, a.total_volume desc, branch_name asc
limit 20;

create or replace view data.current_month_division_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
division_lookup as (
  select distinct on (d.division_id)
    d.division_id,
    nullif(trim(d.division_name), '') as division_name
  from raw.divisions d
  where d.division_id is not null
  order by d.division_id, d.last_synced_at desc nulls last, d.external_row_key desc
),
aggregated as (
  select
    p.division_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
  group by p.division_id
)
select
  a.division_id,
  case
    when division_lookup.division_name is not null and nullif(a.division_id, '') is not null then
      division_lookup.division_name || ' (' || a.division_id || ')'
    when division_lookup.division_name is not null then
      division_lookup.division_name
    when nullif(a.division_id, '') is not null then
      'Division ' || a.division_id
    else
      'Unknown Division'
  end as division_name,
  a.file_count,
  a.total_volume
from aggregated a
left join division_lookup on division_lookup.division_id = a.division_id
order by a.file_count desc, a.total_volume desc, division_name asc
limit 20;

create or replace view data.current_month_loan_officer_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.loan_officer_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
  group by p.loan_officer_id
)
select
  a.loan_officer_id,
  case
    when employee_lookup.user_name is not null and nullif(a.loan_officer_id, '') is not null then
      employee_lookup.user_name || ' (' || a.loan_officer_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.loan_officer_id, '') is not null then
      'Loan Officer ' || a.loan_officer_id
    else
      'Unknown Loan Officer'
  end as loan_officer_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.loan_officer_id
order by a.file_count desc, a.total_volume desc, loan_officer_name asc
limit 20;

create or replace view data.current_month_processor_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.processor_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from data.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
    and p.is_brokered is false
  group by p.processor_id
)
select
  a.processor_id,
  case
    when employee_lookup.user_name is not null and nullif(a.processor_id, '') is not null then
      employee_lookup.user_name || ' (' || a.processor_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.processor_id, '') is not null then
      'Processor ' || a.processor_id
    else
      'Unknown Processor'
  end as processor_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.processor_id
order by a.file_count desc, a.total_volume desc, processor_name asc
limit 20;

create or replace view data.current_month_underwriter_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
employee_lookup as (
  select distinct on (e.user_id)
    e.user_id,
    nullif(trim(e.user_name), '') as user_name
  from raw.employees e
  where e.user_id is not null
  order by e.user_id, e.last_synced_at desc nulls last, e.external_row_key desc
),
aggregated as (
  select
    p.underwriter_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from data.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
    and p.is_brokered is false
  group by p.underwriter_id
)
select
  a.underwriter_id,
  case
    when employee_lookup.user_name is not null and nullif(a.underwriter_id, '') is not null then
      employee_lookup.user_name || ' (' || a.underwriter_id || ')'
    when employee_lookup.user_name is not null then
      employee_lookup.user_name
    when nullif(a.underwriter_id, '') is not null then
      'Underwriter ' || a.underwriter_id
    else
      'Unknown Underwriter'
  end as underwriter_name,
  a.file_count,
  a.total_volume
from aggregated a
left join employee_lookup on employee_lookup.user_id = a.underwriter_id
order by a.file_count desc, a.total_volume desc, underwriter_name asc
limit 20;

create or replace view data.current_month_underwriting_org_summary as
with posted_month_window as (
  select data.leaderboard_posted_month_start() as start_date
),
branch_lookup as (
  select distinct on (b.branch_id)
    b.branch_id,
    nullif(trim(b.branch_name), '') as branch_name
  from raw.branches b
  where b.branch_id is not null
  order by b.branch_id, b.last_synced_at desc nulls last, b.external_row_key desc
),
division_lookup as (
  select distinct on (d.division_id)
    d.division_id,
    nullif(trim(d.division_name), '') as division_name
  from raw.divisions d
  where d.division_id is not null
  order by d.division_id, d.last_synced_at desc nulls last, d.external_row_key desc
),
underwriting_org_lookup as (
  select distinct on (u.org_id)
    u.org_id,
    nullif(trim(u.org_name), '') as org_name
  from raw.underwriting_orgs u
  where u.org_id is not null
  order by u.org_id, u.last_synced_at desc nulls last, u.external_row_key desc
),
aggregated as (
  select
    p.underwriting_org_id,
    count(*)::integer as file_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as total_volume
  from raw.production_data p
  cross join posted_month_window w
  where p.funded_date is not null
    and p.funded_date >= w.start_date
    and p.funded_date < (w.start_date + interval '1 month')
  group by p.underwriting_org_id
)
select
  a.underwriting_org_id,
  case
    when coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) is not null
      and nullif(a.underwriting_org_id, '') is not null then
      coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) || ' (' || a.underwriting_org_id || ')'
    when coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name) is not null then
      coalesce(underwriting_org_lookup.org_name, branch_lookup.branch_name, division_lookup.division_name)
    when nullif(a.underwriting_org_id, '') is not null then
      'Underwriting Org (' || a.underwriting_org_id || ')'
    else
      'Unknown Underwriting Org'
  end as underwriting_org_name,
  a.file_count,
  a.total_volume
from aggregated a
left join underwriting_org_lookup on underwriting_org_lookup.org_id = a.underwriting_org_id
left join branch_lookup on branch_lookup.branch_id = a.underwriting_org_id
left join division_lookup on division_lookup.division_id = a.underwriting_org_id
order by a.file_count desc, a.total_volume desc, underwriting_org_name asc
limit 20;

grant select on
  data.current_month_branch_summary,
  data.current_month_division_summary,
  data.current_month_loan_officer_summary,
  data.current_month_processor_summary,
  data.current_month_underwriter_summary,
  data.current_month_underwriting_org_summary
to anon, authenticated, service_role;
