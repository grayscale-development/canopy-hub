-- Processing Points matches Jimmy's Qlik expression:
-- Sum(If(MonthStart(Date) >= MonthStart(Today(),-12) AND Event='Processed', Points)).
-- The existing function already restricts the source rows to that month window.
-- Keep Underwriting Points unchanged.
--
-- The stable department event key is implemented in data-sync. Invalid identity
-- rows have no target key and are recorded as skipped ingest-log rows, so the
-- log must permit a null key and the explicit skipped action.

alter table raw.row_ingest_log
  alter column external_row_key drop not null;

alter table raw.row_ingest_log
  drop constraint if exists row_ingest_log_action_check;

alter table raw.row_ingest_log
  add constraint row_ingest_log_action_check
  check (action in ('inserted', 'updated', 'unchanged', 'skipped', 'failed')) not valid;

do $migration$
declare
  function_definition text;
  old_points_expression text := 'coalesce(sum(s.points), 0)::numeric as points,';
  old_organization_points_expression text := 'coalesce(sum(f.points), 0)::numeric as points,';
  new_points_expression text := $points$
      coalesce(
        case
          when (select department from params) = 'processing' then sum(s.points) filter (
            where lower(coalesce(s.event_name, '')) = 'processed'
          )
          else sum(s.points)
        end,
        0
      )::numeric as points,$points$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)'::regprocedure
  )
  into function_definition;

  select (length(function_definition) - length(replace(function_definition, old_points_expression, '')))
    / length(old_points_expression)
  into replacement_count;

  if replacement_count <> 1 then
    raise exception 'Expected one employee department dashboard points expression, found %', replacement_count;
  end if;

  select (length(function_definition) - length(replace(function_definition, old_organization_points_expression, '')))
    / length(old_organization_points_expression)
  into replacement_count;

  if replacement_count <> 1 then
    raise exception 'Expected one organization department dashboard points expression, found %', replacement_count;
  end if;

  function_definition := replace(function_definition, old_points_expression, new_points_expression);
  function_definition := replace(
    function_definition,
    old_organization_points_expression,
    replace(
      replace(new_points_expression, 's.points', 'f.points'),
      's.event_name',
      'f.event_name'
    )
  );

  execute function_definition;
end;
$migration$;

revoke all on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  from public, anon;
grant execute on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  to authenticated, service_role;

comment on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date) is
  'Processing and underwriting department dashboards. The window is the first day of the month 12 months before the reference month through the reference date. Processing Total Funded counts Funded rows with Processing Net Workdays. Processing Events and Points include only Processed rows with Points. Underwriting Points remain the sum of all event Points. Employee metrics are all-org totals for people who match the filters. Company Avg is the unweighted mean of the entity rows. Organization rows and the org filter group by organization_id when it is present, otherwise by organization_name.';

update public.source_configs
set
  description = 'Processing Last 12 Months events for the department dashboard. Stable key is AppId + Event + EmployeeId + Qlik Date calendar date + Qlik timestamp minute and second. Disabled until data-sync is deployed with the processing_events target.',
  updated_at = now()
where source_key = 'processing_events';

update public.source_configs
set
  description = 'Underwriting Last 12 Months events for the department dashboard. Stable key is AppId + Event + EmployeeId + Qlik Date calendar date + Qlik timestamp minute and second. Disabled until data-sync is deployed with the underwriting_events target.',
  updated_at = now()
where source_key = 'underwriting_events';
