import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const levels = readFileSync(
  "supabase/migrations/202611090002_wiki_tag_levels.sql",
  "utf8"
)
const cleanup = readFileSync(
  "supabase/migrations/202611090003_wiki_tag_cleanup.sql",
  "utf8"
)
const migration = readFileSync(
  "supabase/migrations/202611090006_wiki_tag_audit_apply.sql",
  "utf8"
)
const docs = readFileSync("docs/wiki-tag-audit.md", "utf8")
const root = "10000000-0000-4000-8000-000000000001"
const section = "10000000-0000-4000-8000-000000000002"
const otherSection = "10000000-0000-4000-8000-000000000003"
const closing = "20000000-0000-4000-8000-000000000001"
const variant = "20000000-0000-4000-8000-000000000002"
const single = "20000000-0000-4000-8000-000000000003"
const unused = "20000000-0000-4000-8000-000000000004"
const unchanged = "20000000-0000-4000-8000-000000000005"
let db: PGlite

async function snapshot() {
  return (
    await db.query(`select
    (select jsonb_agg(to_jsonb(t) order by id) from public.wiki_tags t) tags,
    (select jsonb_agg(to_jsonb(p) order by node_id,tag_id) from public.wiki_page_tags p) links,
    (select jsonb_agg(jsonb_build_array(id,tags) order by id) from public.wiki_nodes) nodes`)
  ).rows
}

describe("reviewed tag migration", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.user_has_permission_code(uuid,text) returns boolean language sql stable as $$ select true $$;
      create table public.wiki_nodes(id uuid primary key default gen_random_uuid(), parent_id uuid references public.wiki_nodes(id), type text not null, tags text[] not null default '{}', updated_by uuid, check (cardinality(tags) <= 12));
      create table public.wiki_tags(id uuid primary key default gen_random_uuid(), name text not null unique check(btrim(name) <> ''), created_at timestamptz not null default now());
      create table public.wiki_page_tags(node_id uuid references public.wiki_nodes(id) on delete cascade, tag_id uuid references public.wiki_tags(id) on delete cascade, primary key(node_id,tag_id));
      insert into public.wiki_nodes(id,parent_id,type) values ('${root}',null,'folder'), ('${section}','${root}','folder'), ('${otherSection}','${root}','folder');
      insert into public.wiki_tags(id,name) values ('${closing}','Closing'), ('${variant}','closing'), ('${single}','Operations'), ('${unused}','Unused'), ('${unchanged}','Keep');
      insert into public.wiki_tags(name) select 'Fixture tag ' || i from generate_series(1,250) i;
      insert into public.wiki_nodes(parent_id,type) select '${section}','page' from generate_series(1,40);
      with pages as (select id, row_number() over (order by id) n from public.wiki_nodes where type='page')
      insert into public.wiki_page_tags select id, '${closing}'::uuid from pages where n <= 20 union all select id, '${variant}'::uuid from pages where n between 10 and 30 union all select id, '${single}'::uuid from pages where n <= 10 union all select id, '${unchanged}'::uuid from pages where n >= 35;
      insert into public.wiki_page_tags(node_id,tag_id)
      select (select id from public.wiki_nodes where type='page' order by id limit 1), id from public.wiki_tags where name in (select 'Fixture tag ' || i from generate_series(1,10) i);
      update public.wiki_nodes n set tags = coalesce((select array_agg(t.name order by t.name) from public.wiki_page_tags pt join public.wiki_tags t on t.id=pt.tag_id where pt.node_id=n.id), array[]::text[]) where n.type='page';
    `)
    await db.exec(levels)
    await db.exec(cleanup)
    await db.exec(migration)
    await db.exec(migration)
  })
  afterAll(async () => {
    await db?.close()
  })

  it("limits execution to service_role", async () => {
    const result = await db.query<{
      role: string
      private_exec: boolean
      public_exec: boolean
    }>(
      `select role, has_function_privilege(role,'app_private.apply_wiki_tag_decisions(jsonb)','execute') private_exec, has_function_privilege(role,'public.apply_wiki_tag_decisions(jsonb)','execute') public_exec from (values ('anon'),('authenticated'),('service_role')) r(role)`
    )
    expect(result.rows).toEqual([
      { role: "anon", private_exec: false, public_exec: false },
      { role: "authenticated", private_exec: false, public_exec: false },
      { role: "service_role", private_exec: true, public_exec: true },
    ])
  })

  it("rolls back failed verification, applies mixed decisions, backs up, repeats safely and restores", async () => {
    const before = await snapshot()
    const day = (
      await db.query<{ backup_date: string }>(
        "select to_char(now() at time zone 'UTC','YYYYMMDD') as backup_date"
      )
    ).rows[0].backup_date
    const bad = [
      { tag_id: single, action: "section", section_id: otherSection },
    ]
    await expect(
      db.query("select app_private.apply_wiki_tag_decisions($1::jsonb)", [
        JSON.stringify(bad),
      ])
    ).rejects.toThrow("wiki_tag_demote_blocked")
    expect(await snapshot()).toEqual(before)
    expect(
      (
        await db.query<{ backup: string | null }>(
          "select to_regclass($1) backup",
          [`app_private.wiki_tags_backup_${day}`]
        )
      ).rows[0].backup
    ).toBeNull()
    await expect(
      db.query("select app_private.apply_wiki_tag_decisions($1::jsonb)", [
        JSON.stringify([
          { tag_id: closing, action: "delete" },
          { tag_id: variant, action: "delete" },
          { tag_id: single, action: "delete" },
        ]),
      ])
    ).rejects.toThrow("wiki_tag_page_would_lose_all_tags")
    expect(await snapshot()).toEqual(before)
    await db.exec("begin")
    await db.query("select app_private.apply_wiki_tag_decisions($1::jsonb)", [
      JSON.stringify([{ tag_id: unchanged, action: "delete" }]),
    ])
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.wiki_page_tags where tag_id=$1",
          [unchanged]
        )
      ).rows[0].n
    ).toBe(0)
    await db.exec("rollback")
    expect(await snapshot()).toEqual(before)
    // Simulate an unexpected side effect to exercise the independent pair check.
    await db.exec(`create function public.test_corrupt_links() returns trigger language plpgsql as $$ begin delete from public.wiki_page_tags where tag_id='${unchanged}'; return old; end $$;
      create trigger test_corrupt_links after delete on public.wiki_page_tags for each row when (old.tag_id='${variant}'::uuid) execute function public.test_corrupt_links();`)
    await expect(
      db.query("select app_private.apply_wiki_tag_decisions($1::jsonb)", [
        JSON.stringify([
          { tag_id: variant, action: "merge", target_id: closing },
        ]),
      ])
    ).rejects.toThrow("wiki_tag_pair_verification_failed")
    expect(await snapshot()).toEqual(before)
    expect(
      (
        await db.query<{ backup: string | null }>(
          "select to_regclass($1) backup",
          [`app_private.wiki_tags_backup_${day}`]
        )
      ).rows[0].backup
    ).toBeNull()
    await db.exec(
      "drop trigger test_corrupt_links on public.wiki_page_tags; drop function public.test_corrupt_links();"
    )
    const decisions = [
      { tag_id: variant, action: "merge", target_id: closing },
      { tag_id: single, action: "section", section_id: section },
      { tag_id: unused, action: "delete" },
      { tag_id: closing, action: "global" },
    ]
    const result = (
      await db.query<{
        result: {
          pairs_before: number
          pairs_after: number
          tags_before: number
          tags_after: number
        }
      }>("select app_private.apply_wiki_tag_decisions($1::jsonb) result", [
        JSON.stringify(decisions),
      ])
    ).rows[0].result
    expect(result.pairs_before - result.pairs_after).toBe(11)
    expect(result.tags_before - result.tags_after).toBe(2)
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from app_private.wiki_tags_backup_${day}`
        )
      ).rows[0].n
    ).toBe(result.tags_before)
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from app_private.wiki_page_tags_backup_${day}`
        )
      ).rows[0].n
    ).toBe(result.pairs_before)
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from app_private.wiki_node_tags_backup_${day}`
        )
      ).rows[0].n
    ).toBe(43)
    expect(
      (
        await db.query<{ scope: string }>(
          "select scope from public.wiki_tags where id=$1",
          [unchanged]
        )
      ).rows[0].scope
    ).toBe("global")
    expect(
      (
        await db.query(
          "select scope,section_id from public.wiki_tags where id=$1",
          [single]
        )
      ).rows[0]
    ).toEqual({ scope: "section", section_id: section })
    const after = await snapshot()
    expect(
      (
        await db.query<{ result: { already_applied: boolean } }>(
          "select app_private.apply_wiki_tag_decisions($1::jsonb) result",
          [JSON.stringify(decisions)]
        )
      ).rows[0].result.already_applied
    ).toBe(true)
    expect(await snapshot()).toEqual(after)
    await expect(
      db.query("select app_private.apply_wiki_tag_decisions($1::jsonb)", [
        JSON.stringify([{ tag_id: unchanged, action: "keep" }]),
      ])
    ).rejects.toThrow("backup_already_exists")
    const rollback = docs.match(/```sql\n(begin;[\s\S]*?commit;)\n```/)?.[1]
    expect(rollback).toBeTruthy()
    await db.exec(rollback!.replaceAll("YYYYMMDD", day))
    expect(await snapshot()).toEqual(before)
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.wiki_tag_audit where action='migration_rollback'"
        )
      ).rows[0].n
    ).toBe(1)
  })
})
