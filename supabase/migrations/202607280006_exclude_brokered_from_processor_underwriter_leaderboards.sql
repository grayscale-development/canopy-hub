create or replace view data.production_data as
select
  p.*,
  (
    lower(coalesce(p.business_channel, '')) like '%wholesale%'
    or lower(coalesce(p.business_channel, '')) like '%broker%'
    or lower(coalesce(p.loan_type, '')) like '%broker%'
    or lower(coalesce(p.loan_product, '')) like '%broker%'
  ) as is_brokered
from raw.production_data p;

create or replace view data.current_month_processor_summary as
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
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
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
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
with current_month_window as (
  select date_trunc('month', current_date)::date as start_date
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
  cross join current_month_window w
  where p.closed_date >= w.start_date
    and p.closed_date < (w.start_date + interval '1 month')
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

grant select on
  data.production_data,
  data.current_month_processor_summary,
  data.current_month_underwriter_summary
to anon, authenticated, service_role;
