import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("AI action log database trigger", { timeout: 60_000 }, () => {
  it("enforces roles and remains immutable even if service-role privileges are expanded", () => {
    // The SQL runs only inside the named local Supabase container and rolls back
    // the temporary users, rows, and elevated grants at the end.
    const sql = `
begin;
do $test$
declare
  manager_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  target_id uuid := gen_random_uuid();
  log_id uuid;
  denied boolean;
begin
  insert into auth.users (id) values (manager_id), (viewer_id);
  insert into public.user_permissions (user_id, permission_id)
    select manager_id, id from public.permissions where code = 'wiki.manage';
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
  perform public.log_user_ai_action('milo_answer', target_id, null);
  denied := false;
  begin
    perform public.log_user_ai_action('alert_apply', target_id, target_id);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'viewer apply was allowed'; end if;
  denied := false;
  begin
    insert into public.ai_action_log (action_type, summary) values ('milo_answer', 'direct');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'direct authenticated insert was allowed'; end if;
  denied := false;
  begin
    update public.ai_action_log set summary = 'changed';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'viewer update was allowed'; end if;
  denied := false;
  begin
    delete from public.ai_action_log;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'viewer delete was allowed'; end if;
  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  perform public.log_user_ai_action('alert_apply', target_id, target_id);
  denied := false;
  begin
    update public.ai_action_log set summary = 'changed';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'authenticated update was allowed'; end if;
  denied := false;
  begin
    delete from public.ai_action_log;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'authenticated delete was allowed'; end if;
  perform set_config('role', 'anon', true);
  denied := false;
  begin
    perform public.log_user_ai_action('milo_answer', null, null);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anonymous RPC was allowed'; end if;
  denied := false;
  begin
    insert into public.ai_action_log (action_type, summary) values ('milo_answer', 'direct');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anonymous insert was allowed'; end if;
  perform set_config('role', 'service_role', true);
  insert into public.ai_action_log (action_type, target_page_id, target_alert_id, summary)
    values ('alert_recommendation', target_id, target_id, 'Recommendation') returning id into log_id;
  denied := false;
  begin
    insert into public.ai_action_log (action_type, summary) values ('invalid', 'Invalid');
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'invalid action was allowed'; end if;
  perform set_config('role', 'none', true);
  if (select count(*) from public.ai_action_log where target_page_id = target_id) <> 3
    or not exists (select 1 from public.ai_action_log where target_page_id = target_id and action_type = 'milo_answer' and actor_user_id = viewer_id)
    or not exists (select 1 from public.ai_action_log where target_page_id = target_id and action_type = 'alert_apply' and actor_user_id = manager_id)
    or not exists (select 1 from public.ai_action_log where id = log_id and actor_user_id is null)
  then raise exception 'action rows or actors were incorrect'; end if;
  execute 'grant update, delete on public.ai_action_log to service_role';
  perform set_config('role', 'service_role', true);
  denied := false;
  begin
    update public.ai_action_log set summary = 'changed' where id = log_id;
  exception when raise_exception then denied := true;
  end;
  if not denied then raise exception 'service-role update bypassed the trigger'; end if;
  denied := false;
  begin
    delete from public.ai_action_log where id = log_id;
  exception when raise_exception then denied := true;
  end;
  if not denied then raise exception 'service-role delete bypassed the trigger'; end if;
end
$test$;
rollback;
`
    expect(() =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_canopy-hub-sync",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-q",
        ],
        { input: sql, encoding: "utf8" }
      )
    ).not.toThrow()
  })
})
