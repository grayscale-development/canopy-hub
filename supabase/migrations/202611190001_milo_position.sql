alter table public.user_ui_preferences
  add column if not exists milo_position jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_ui_preferences'::regclass
      and conname = 'user_ui_preferences_milo_position_check'
  ) then
    alter table public.user_ui_preferences
      add constraint user_ui_preferences_milo_position_check check (
        milo_position is null or case
          when jsonb_typeof(milo_position) = 'object'
            and milo_position ? 'x' and milo_position ? 'y'
            and milo_position - 'x' - 'y' = '{}'::jsonb
            and jsonb_typeof(milo_position->'x') = 'number'
            and jsonb_typeof(milo_position->'y') = 'number'
          then (milo_position->>'x')::numeric between 0 and 1
            and (milo_position->>'y')::numeric between 0 and 1
          else false
        end
      );
  end if;
end
$migration$;

grant select, insert, update, delete on public.user_ui_preferences to service_role;
