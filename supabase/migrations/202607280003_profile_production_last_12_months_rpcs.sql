create or replace function data.get_division_production_last_12_months(
  p_division_id text,
  p_reference_date date default current_date
)
returns table (
  month_key text,
  label text,
  funded_count integer,
  funded_volume numeric
)
language sql
stable
security definer
set search_path = ''
as $$
with bounds as (
  select date_trunc('month', coalesce(p_reference_date, current_date))::date as current_month_start
),
month_window as (
  select generate_series(
    bounds.current_month_start - interval '11 months',
    bounds.current_month_start,
    interval '1 month'
  )::date as month_start
  from bounds
),
aggregated as (
  select
    date_trunc('month', p.funded_date)::date as month_start,
    count(*)::integer as funded_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as funded_volume
  from raw.production_data p
  cross join bounds
  where p.division_id = p_division_id
    and p.funded_date is not null
    and p.funded_date >= (bounds.current_month_start - interval '11 months')
    and p.funded_date < (bounds.current_month_start + interval '1 month')
  group by 1
)
select
  to_char(month_window.month_start, 'YYYY-MM') as month_key,
  to_char(month_window.month_start, 'Mon YYYY') as label,
  coalesce(aggregated.funded_count, 0)::integer as funded_count,
  coalesce(aggregated.funded_volume, 0)::numeric as funded_volume
from month_window
left join aggregated using (month_start)
order by month_window.month_start asc;
$$;

create or replace function data.get_branch_production_last_12_months(
  p_branch_id text,
  p_reference_date date default current_date
)
returns table (
  month_key text,
  label text,
  funded_count integer,
  funded_volume numeric
)
language sql
stable
security definer
set search_path = ''
as $$
with bounds as (
  select date_trunc('month', coalesce(p_reference_date, current_date))::date as current_month_start
),
month_window as (
  select generate_series(
    bounds.current_month_start - interval '11 months',
    bounds.current_month_start,
    interval '1 month'
  )::date as month_start
  from bounds
),
aggregated as (
  select
    date_trunc('month', p.funded_date)::date as month_start,
    count(*)::integer as funded_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as funded_volume
  from raw.production_data p
  cross join bounds
  where p.branch_id = p_branch_id
    and p.funded_date is not null
    and p.funded_date >= (bounds.current_month_start - interval '11 months')
    and p.funded_date < (bounds.current_month_start + interval '1 month')
  group by 1
)
select
  to_char(month_window.month_start, 'YYYY-MM') as month_key,
  to_char(month_window.month_start, 'Mon YYYY') as label,
  coalesce(aggregated.funded_count, 0)::integer as funded_count,
  coalesce(aggregated.funded_volume, 0)::numeric as funded_volume
from month_window
left join aggregated using (month_start)
order by month_window.month_start asc;
$$;

create or replace function data.get_employee_production_last_12_months(
  p_employee_id text,
  p_reference_date date default current_date
)
returns table (
  month_key text,
  label text,
  funded_count integer,
  funded_volume numeric
)
language sql
stable
security definer
set search_path = ''
as $$
with bounds as (
  select date_trunc('month', coalesce(p_reference_date, current_date))::date as current_month_start
),
month_window as (
  select generate_series(
    bounds.current_month_start - interval '11 months',
    bounds.current_month_start,
    interval '1 month'
  )::date as month_start
  from bounds
),
aggregated as (
  select
    date_trunc('month', p.funded_date)::date as month_start,
    count(*)::integer as funded_count,
    coalesce(sum(coalesce(p.loan_amount, 0)), 0)::numeric as funded_volume
  from raw.production_data p
  cross join bounds
  where (
      p.loan_officer_id = p_employee_id
      or p.processor_id = p_employee_id
      or p.underwriter_id = p_employee_id
    )
    and p.funded_date is not null
    and p.funded_date >= (bounds.current_month_start - interval '11 months')
    and p.funded_date < (bounds.current_month_start + interval '1 month')
  group by 1
)
select
  to_char(month_window.month_start, 'YYYY-MM') as month_key,
  to_char(month_window.month_start, 'Mon YYYY') as label,
  coalesce(aggregated.funded_count, 0)::integer as funded_count,
  coalesce(aggregated.funded_volume, 0)::numeric as funded_volume
from month_window
left join aggregated using (month_start)
order by month_window.month_start asc;
$$;

grant execute on function data.get_division_production_last_12_months(text, date) to anon, authenticated, service_role;
grant execute on function data.get_branch_production_last_12_months(text, date) to anon, authenticated, service_role;
grant execute on function data.get_employee_production_last_12_months(text, date) to anon, authenticated, service_role;
