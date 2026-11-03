-- Jimmy added these measures to the event-level Underwriting Qlik table.
-- They are nullable so historic rows and Qlik rows without the new columns remain blank.

alter table raw.underwriting_events
  add column if not exists workdays_in_underwriting numeric,
  add column if not exists workdays_in_conditions numeric;

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
      null::numeric as workdays_in_initial_review,
      null::numeric as qc_count,$old$, '')))
    / length($old$
      null::numeric as workdays_in_initial_review,
      null::numeric as qc_count,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one processing workday source block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      null::numeric as workdays_in_initial_review,
      null::numeric as qc_count,$old$, $new$
      null::numeric as workdays_in_initial_review,
      null::numeric as workdays_in_underwriting,
      null::numeric as workdays_in_conditions,
      null::numeric as qc_count,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
      e.workdays_in_initial_review,
      e.qc_count,$old$, '')))
    / length($old$
      e.workdays_in_initial_review,
      e.qc_count,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one underwriting workday source block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      e.workdays_in_initial_review,
      e.qc_count,$old$, $new$
      e.workdays_in_initial_review,
      e.workdays_in_underwriting,
      e.workdays_in_conditions,
      e.qc_count,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$, '')))
    / length($old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one employee underwriting metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$, $new$
      count(*) filter (where lower(s.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(s.workdays_in_underwriting) filter (
        where lower(s.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(s.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(s.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$, '')))
    / length($old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one organization underwriting metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      null::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      null::numeric as avg_workdays_conditions,$old$, $new$
      count(*) filter (where lower(f.event_name) = 'final underwrite')::numeric as final_underwriting_events,
      avg(f.workdays_in_underwriting) filter (
        where lower(f.event_name) = 'final underwrite'
      )::numeric as avg_workdays_underwriting,
      count(*) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as condition_events,
      avg(f.workdays_in_conditions) filter (
        where position('condition' in lower(coalesce(f.event_name, ''))) > 0
      )::numeric as avg_workdays_conditions,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
              'workdays_in_initial_review', f.workdays_in_initial_review,
              'qc_count', f.qc_count,$old$, '')))
    / length($old$
              'workdays_in_initial_review', f.workdays_in_initial_review,
              'qc_count', f.qc_count,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one event workday payload block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
              'workdays_in_initial_review', f.workdays_in_initial_review,
              'qc_count', f.qc_count,$old$, $new$
              'workdays_in_initial_review', f.workdays_in_initial_review,
              'workdays_in_underwriting', f.workdays_in_underwriting,
              'workdays_in_conditions', f.workdays_in_conditions,
              'qc_count', f.qc_count,$new$);

  execute function_definition;
end;
$migration$;

revoke all on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  from public, anon;
grant execute on function data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)
  to authenticated, service_role;
