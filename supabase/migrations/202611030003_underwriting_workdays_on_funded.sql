-- Underwriting workday fields are populated on Funded rows in the event feed.
-- Keep the existing Final Underwrite and condition counters, but calculate both
-- workday averages from the rows that actually carry their values.

do $migration$
declare
  function_definition text;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)'::regprocedure
  )
  into function_definition;

  select (length(function_definition) - length(replace(function_definition, $old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(s.workdays_in_underwriting) filter (
        where lower(s.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(s.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$, '')))
    / length($old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(s.workdays_in_underwriting) filter (
        where lower(s.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(s.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one employee underwriting workday metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(s.workdays_in_underwriting) filter (
        where lower(s.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(s.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$, $new$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(s.workdays_in_underwriting) filter (
        where lower(s.event_name) = 'funded'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(s.workdays_in_conditions) filter (
        where lower(s.event_name) = 'funded'
      )::numeric as avg_workdays_conditions,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(f.workdays_in_underwriting) filter (
        where lower(f.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(f.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$, '')))
    / length($old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(f.workdays_in_underwriting) filter (
        where lower(f.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(f.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one organization underwriting workday metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(f.workdays_in_underwriting) filter (
        where lower(f.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(f.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$old$, $new$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(f.workdays_in_underwriting) filter (
        where lower(f.event_name) = 'funded'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(f.workdays_in_conditions) filter (
        where lower(f.event_name) = 'funded'
      )::numeric as avg_workdays_conditions,$new$);

  execute function_definition;
end;
$migration$;
