import fs from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite-pgvector"
import { beforeAll, afterAll, describe, expect, it } from "vitest"

const standard = "10000000-0000-4000-8000-000000000001"
const manager = "10000000-0000-4000-8000-000000000002"
const permission = "20000000-0000-4000-8000-000000000001"
const beta = "20000000-0000-4000-8000-000000000002"
const wiki = "20000000-0000-4000-8000-000000000003"
const support = "20000000-0000-4000-8000-000000000004"
const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8")
let db: PGlite

async function asRole(role: string, user: string | null, sql: string) {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false);`
  )
  try {
    return (await db.query(sql)).rows
  } finally {
    await db.exec("reset role")
  }
}

describe("Supabase security migration in PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { vector } })
    await db.exec(read("tests/security/security-fixture.sql"))
    // Use the actual production Wiki ancestry helper, rather than a test copy.
    const milo = read(
      "supabase/migrations/202610090001_milo_effective_knowledge_access.sql"
    )
    await db.exec(milo.slice(0, milo.indexOf("-- Direct select/search")))
    await db.exec(
      read(
        "supabase/migrations/202607280013_refine_milo_keyword_word_matches.sql"
      )
    )
    await db.exec(
      read("supabase/migrations/202610130001_security_hardening.sql")
    )
    await db.exec(`
      insert into auth.users(id,email) values ('${standard}','standard@example.test'),('${manager}','manager@example.test');
      insert into public.permissions values ('${permission}','Permissions','permissions.access'),('${beta}','Beta','beta.1'),('${wiki}','Wiki','wiki.manage'),('${support}','Support','support.edit');
      insert into public.user_permissions(user_id,permission_id) values ('${manager}','${permission}'),('${manager}','${beta}'),('${manager}','${wiki}'),('${manager}','${support}'),('${standard}','${beta}');
      insert into public.roles values (2,'employee','Employee');
      insert into public.user_roles values ('${standard}',2),('${manager}',2);
      insert into raw.production_data values (1,125);
      insert into public.wiki_nodes values ('30000000-0000-4000-8000-000000000001',null,'published'),('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','draft');
      insert into public.knowledge_sources(id,source_type,title,status) values ('40000000-0000-4000-8000-000000000001','report','Funding checklist','active');
      insert into public.knowledge_chunks(id,source_id,content,embedding) values ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Funding checklist','[1,0,0]');
    `)
  }, 60_000)
  afterAll(async () => {
    await db?.close()
  })

  it("blocks anonymous report reads and RPC calls", async () => {
    await expect(
      asRole("anon", null, "select * from data.production_data")
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole("anon", null, "select data.get_file_quality_rollups(current_date)")
    ).rejects.toThrow(/permission denied/)
  })
  it("keeps signed-in reports and nested invoker views working", async () => {
    expect(
      await asRole(
        "authenticated",
        standard,
        "select volume from data.current_month_branch_summary"
      )
    ).toEqual([{ volume: "125" }])
    expect(
      await asRole(
        "authenticated",
        standard,
        "select data.get_file_quality_rollups(current_date) as total"
      )
    ).toEqual([{ total: "125" }])
    expect(
      await asRole("authenticated", null, "select * from data.production_data")
    ).toEqual([])
  })
  it("denies client access to backend config, raw payloads and scheduler controls", async () => {
    for (const sql of [
      "select * from public.source_configs",
      "select * from public.allowed_domains",
      "select * from raw.source_payloads",
      "select public.invoke_data_sync_dispatch_now()",
      "select public.invoke_single_data_sync_source('test',0,1)",
      "select public.get_data_sync_scheduler_health()",
      "select raw.run_retention_cleanup(true,null,1)",
    ]) {
      await expect(asRole("authenticated", standard, sql)).rejects.toThrow(
        /permission denied/
      )
    }
    await expect(
      asRole("service_role", null, "select * from public.source_configs")
    ).resolves.toEqual([])
    expect(
      await asRole(
        "service_role",
        null,
        "select public.invoke_data_sync_dispatch_now() as id"
      )
    ).toEqual([{ id: 1 }])
  })
  it("prevents self-grants and permission catalog edits", async () => {
    await expect(
      asRole(
        "authenticated",
        standard,
        `insert into public.user_permissions(user_id,permission_id) values ('${standard}','${permission}')`
      )
    ).rejects.toThrow(/row-level security/)
    expect(
      await asRole(
        "authenticated",
        standard,
        `update public.permissions set code='stolen' where id='${permission}' returning id`
      )
    ).toEqual([])
    expect(
      await asRole(
        "authenticated",
        standard,
        `delete from public.user_permissions where user_id='${manager}' returning id`
      )
    ).toEqual([])
    await expect(
      asRole(
        "authenticated",
        standard,
        `update public.user_roles set role_id=1 where user_id='${standard}'`
      )
    ).rejects.toThrow(/permission denied/)
  })
  it("allows authorized permission management and own-permission checks without recursion", async () => {
    await asRole(
      "authenticated",
      manager,
      `insert into public.user_permissions(user_id,permission_id) values ('${standard}','${support}')`
    )
    expect(
      await asRole(
        "authenticated",
        standard,
        `select public.user_has_permission_code('${standard}','support.edit') as allowed`
      )
    ).toEqual([{ allowed: true }])
    expect(
      await asRole(
        "authenticated",
        standard,
        `select public.user_has_permission_code('${manager}','permissions.access') as allowed`
      )
    ).toEqual([{ allowed: false }])
    await asRole(
      "authenticated",
      manager,
      `delete from public.user_permissions where user_id='${standard}' and permission_id='${support}'`
    )
    const own = await asRole(
      "authenticated",
      standard,
      "select user_id from public.user_permissions"
    )
    expect(own).toEqual([{ user_id: standard }])
    expect(
      await asRole(
        "authenticated",
        standard,
        "select * from public.list_permission_users()"
      )
    ).toEqual([])
    expect(
      (
        await asRole(
          "authenticated",
          manager,
          "select * from public.list_permission_users()"
        )
      ).length
    ).toBeGreaterThan(0)
  })
  it("requires support.edit for support mutations", async () => {
    for (const table of [
      "support_directory_sections",
      "support_directory_entries",
      "support_directory_entry_contacts",
    ]) {
      await expect(
        asRole(
          "authenticated",
          standard,
          `insert into public.${table} values (gen_random_uuid(),'Denied')`
        )
      ).rejects.toThrow(/row-level security/)
      await asRole(
        "authenticated",
        manager,
        `insert into public.${table} values (gen_random_uuid(),'Allowed')`
      )
      expect(
        (
          await asRole(
            "authenticated",
            standard,
            `select * from public.${table}`
          )
        ).length
      ).toBe(1)
      expect(
        await asRole(
          "authenticated",
          standard,
          `update public.${table} set title='Denied' returning id`
        )
      ).toEqual([])
      expect(
        await asRole(
          "authenticated",
          standard,
          `delete from public.${table} returning id`
        )
      ).toEqual([])
    }
  })
  it("preserves Wiki manager access and viewer draft denial through wrappers", async () => {
    const sql =
      "select public.milo_can_access_wiki_node('30000000-0000-4000-8000-000000000002') as allowed"
    expect(await asRole("authenticated", standard, sql)).toEqual([
      { allowed: false },
    ])
    expect(await asRole("authenticated", manager, sql)).toEqual([
      { allowed: true },
    ])
    expect(
      (
        await asRole(
          "authenticated",
          standard,
          "select * from public.list_permission_directory_users()"
        )
      ).length
    ).toBe(2)
  })
  it("preserves vector and keyword retrieval after extension relocation and path pinning", async () => {
    expect(
      (
        await asRole(
          "authenticated",
          standard,
          "select * from public.match_knowledge_chunks('[1,0,0]'::extensions.vector,8,null)"
        )
      ).length
    ).toBe(1)
    expect(
      (
        await asRole(
          "authenticated",
          standard,
          "select * from public.match_knowledge_chunks_keyword('Funding',8,null)"
        )
      ).length
    ).toBe(1)
  })
  it("leaves no API definer RPC executable by anonymous or authenticated roles", async () => {
    const result = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','data','raw') and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))`
    )
    expect(result.rows).toEqual([])
    const paths = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','data','raw','app_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') and not exists(select 1 from unnest(p.proconfig) config where config like 'search_path=%')`
    )
    expect(paths.rows).toEqual([])
    await db.exec(
      "create function public.future_rpc() returns integer language sql as $$select 1$$"
    )
    const grants = await db.query(
      "select has_function_privilege('anon','public.future_rpc()','EXECUTE') as anon,has_function_privilege('authenticated','public.future_rpc()','EXECUTE') as authenticated"
    )
    expect(grants.rows).toEqual([{ anon: false, authenticated: false }])
  })
})

describe("security migration with the checked-in legacy baseline", () => {
  it("hardens existing objects when hosted-only legacy objects are absent", async () => {
    const fresh = new PGlite({ extensions: { vector } })
    try {
      await fresh.exec(read("tests/security/security-fixture.sql"))
      await fresh.exec(`
        drop function public.get_current_user_role_code();
        drop function public.list_canopy_users_simple();
        drop table public.allowed_domains, public.roles, public.user_roles;
      `)
      const milo = read(
        "supabase/migrations/202610090001_milo_effective_knowledge_access.sql"
      )
      await fresh.exec(milo.slice(0, milo.indexOf("-- Direct select/search")))
      await fresh.exec(
        read("supabase/migrations/202610130001_security_hardening.sql")
      )
      expect(
        (
          await fresh.query(
            "select relrowsecurity from pg_class where oid = 'public.source_configs'::regclass"
          )
        ).rows
      ).toEqual([{ relrowsecurity: true }])
      expect(
        (
          await fresh.query(
            "select to_regclass('public.roles') as legacy_table"
          )
        ).rows
      ).toEqual([{ legacy_table: null }])
    } finally {
      await fresh.close()
    }
  }, 60_000)
})
