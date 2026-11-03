-- Underwriting workdays are populated on Funded rows in the event feed.
-- Keep the Initial Review Complete event count, but calculate the workday
-- average from the Funded rows that carry the value.

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
      count(*) filter (where lower(s.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(s.workdays_in_initial_review) filter (
        where lower(s.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$, '')))
    / length($old$
      count(*) filter (where lower(s.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(s.workdays_in_initial_review) filter (
        where lower(s.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one employee initial-review workday metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(s.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(s.workdays_in_initial_review) filter (
        where lower(s.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$, $new$
      count(*) filter (where lower(s.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(s.workdays_in_initial_review) filter (
        where lower(s.event_name) = 'funded'
          and s.workdays_in_initial_review is not null
      )::numeric as avg_workdays_initial_review,$new$);

  select (length(function_definition) - length(replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$, '')))
    / length($old$
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$)
  into replacement_count;
  if replacement_count <> 1 then
    raise exception 'Expected one organization initial-review workday metric block, found %', replacement_count;
  end if;
  function_definition := replace(function_definition, $old$
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'initial review complete'
      )::numeric as avg_workdays_initial_review,$old$, $new$
      count(*) filter (where lower(f.event_name) = 'initial review complete')::numeric as initial_review_events,
      avg(f.workdays_in_initial_review) filter (
        where lower(f.event_name) = 'funded'
          and f.workdays_in_initial_review is not null
      )::numeric as avg_workdays_initial_review,$new$);

  execute function_definition;
end;
$migration$;
