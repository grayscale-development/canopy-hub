insert into public.permissions (name, code)
values ('View Department Dashboard Events', 'department-dashboard.events.view')
on conflict (code) do nothing;

do $migration$
declare
  function_definition text;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'data.get_department_dashboard(text, text, date, date, text, text, integer, integer, date)'::regprocedure
  )
  into function_definition;

  select (length(function_definition) - length(replace(
    function_definition,
    'least(greatest(coalesce(p_event_limit, 100), 1), 200) as event_limit,',
    ''
  ))) / length('least(greatest(coalesce(p_event_limit, 100), 1), 200) as event_limit,')
  into replacement_count;

  if replacement_count <> 1 then
    raise exception 'Expected one department dashboard event limit expression, found %', replacement_count;
  end if;

  function_definition := replace(
    function_definition,
    'least(greatest(coalesce(p_event_limit, 100), 1), 200) as event_limit,',
    'least(greatest(coalesce(p_event_limit, 100), 0), 200) as event_limit,'
  );

  execute function_definition;
end;
$migration$;
