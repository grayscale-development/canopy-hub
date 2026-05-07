create or replace function public.invoke_single_qlik_sync_source(
  p_sync_key text,
  p_start_at integer default 0,
  p_max_rows_per_run integer default null
)
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  with secrets as (
    select
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
      ) as project_url,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_BEARER_TOKEN' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_bearer_token' limit 1)
      ) as bearer_token
  ),
  request_body as (
    select jsonb_strip_nulls(
      jsonb_build_object(
        'syncKey', p_sync_key,
        'startAt', greatest(coalesce(p_start_at, 0), 0),
        'maxRowsPerRun', p_max_rows_per_run
      )
    ) as body
  )
  select coalesce(
    (
      select net.http_post(
        url := project_url || '/functions/v1/qlik-sync-source',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || bearer_token
        ),
        body := request_body.body,
        timeout_milliseconds := 120000
      )
      from secrets, request_body
      where project_url is not null
        and bearer_token is not null
        and nullif(trim(p_sync_key), '') is not null
    ),
    0::bigint
  );
$$;

grant execute on function public.invoke_single_qlik_sync_source(text, integer, integer) to service_role;
