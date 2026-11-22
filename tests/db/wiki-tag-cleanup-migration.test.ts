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
const root = "10000000-0000-4000-8000-000000000001"
const a = "10000000-0000-4000-8000-000000000002"
const b = "10000000-0000-4000-8000-000000000003"
const pageA = "10000000-0000-4000-8000-000000000004"
const pageB = "10000000-0000-4000-8000-000000000005"
const closing = "20000000-0000-4000-8000-000000000001"
const variant = "20000000-0000-4000-8000-000000000002"
const other = "20000000-0000-4000-8000-000000000003"
let db: PGlite

describe("tag cleanup migration", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable as $$ select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
      create function public.user_has_permission_code(uuid,text) returns boolean language sql stable as $$ select coalesce(current_setting('test.manager', true), 'true') = 'true' $$;
      create table public.wiki_nodes (id uuid primary key, parent_id uuid references public.wiki_nodes(id), type text not null, tags text[] not null default '{}', updated_by uuid, check (cardinality(tags) <= 12));
      create table public.wiki_tags (id uuid primary key default gen_random_uuid(), name text not null unique check (btrim(name) <> ''), created_at timestamptz not null default now());
      create table public.wiki_page_tags (node_id uuid references public.wiki_nodes(id) on delete cascade, tag_id uuid references public.wiki_tags(id) on delete cascade, primary key(node_id,tag_id));
      insert into public.wiki_nodes(id,parent_id,type,tags) values
        ('${root}',null,'folder','{}'), ('${a}','${root}','folder','{}'), ('${b}','${root}','folder','{}'),
        ('${pageA}','${a}','page',array['Closing','closing']), ('${pageB}','${b}','page',array['closing']);
      insert into public.wiki_tags(id,name) values ('${closing}','Closing'), ('${variant}','closing'), ('${other}','Other');
      insert into public.wiki_page_tags values ('${pageA}','${closing}'), ('${pageA}','${variant}'), ('${pageB}','${variant}');
    `)
    await db.exec(levels)
    await db.exec(cleanup)
    await db.exec(cleanup)
  })
  afterAll(async () => {
    await db?.close()
  })

  it("allows case-only renames of grandfathered variants and merges without losing existing links", async () => {
    await db.query(
      "select public.manage_wiki_tag('rename', $1, null, 'CLOSING')",
      [variant]
    )
    await db.query(
      "select public.manage_wiki_tag('merge', $1, $2, null, null, null, $3)",
      [variant, closing, [pageA, pageB]]
    )
    expect(
      (
        await db.query(
          "select node_id, tag_id from public.wiki_page_tags order by node_id"
        )
      ).rows
    ).toEqual([
      { node_id: pageA, tag_id: closing },
      { node_id: pageB, tag_id: closing },
    ])
    expect(
      (
        await db.query(
          "select tags from public.wiki_nodes where type='page' order by id"
        )
      ).rows
    ).toEqual([{ tags: ["Closing"] }, { tags: ["Closing"] }])
    const audit = (
      await db.query<{
        details: {
          affected_node_ids: string[]
          target_existing_node_ids: string[]
        }
      }>("select details from public.wiki_tag_audit where action='merge'")
    ).rows[0].details
    expect(audit.affected_node_ids).toEqual([pageA, pageB])
    expect(audit.target_existing_node_ids).toEqual([pageA])
    await expect(
      db.query("select public.manage_wiki_tag('rename', $1, null, 'OTHER')", [
        closing,
      ])
    ).rejects.toThrow("wiki_tag_name_conflict")
    await db.query(
      "select public.manage_wiki_tag('rename', $1, null, 'CLOSING')",
      [closing]
    )
    expect(
      (
        await db.query<{ tags: string[] }>(
          "select tags from public.wiki_nodes where id=$1",
          [pageA]
        )
      ).rows[0].tags
    ).toEqual(["CLOSING"])
  })

  it("blocks cross-section merges and demotion of pages in different sections", async () => {
    const scoped = (
      await db.query<{ id: string }>(
        "insert into public.wiki_tags(name,scope,section_id) values ('Scoped','section',$1) returning id",
        [a]
      )
    ).rows[0].id
    await expect(
      db.query("select public.manage_wiki_tag('merge', $1, $2)", [
        closing,
        scoped,
      ])
    ).rejects.toThrow("wiki_tag_out_of_scope")
    await expect(
      db.query("select public.manage_wiki_tag('demote', $1, null, null, $2)", [
        closing,
        a,
      ])
    ).rejects.toThrow("wiki_tag_demote_blocked")
    await expect(
      db.query("select public.manage_wiki_tag('demote', $1, null, null, $2)", [
        closing,
        root,
      ])
    ).rejects.toThrow("wiki_tag_invalid_section")
    await db.query("select public.sync_wiki_page_tags($1, '[]'::jsonb)", [
      pageB,
    ])
    await db.query(
      "select public.manage_wiki_tag('demote', $1, null, null, $2)",
      [closing, a]
    )
    expect(
      (
        await db.query(
          "select scope,section_id from public.wiki_tags where id=$1",
          [closing]
        )
      ).rows[0]
    ).toEqual({ scope: "section", section_id: a })
    await db.query("select public.manage_wiki_tag('promote', $1)", [closing])
    expect(
      (
        await db.query(
          "select scope,section_id from public.wiki_tags where id=$1",
          [closing]
        )
      ).rows[0]
    ).toEqual({ scope: "global", section_id: null })
  })

  it("rejects stale previews, used deletes and non-managers; deletes only selected unused tags", async () => {
    await expect(
      db.query(
        "select public.manage_wiki_tag('rename', $1, null, 'New', null, null, '{}'::uuid[])",
        [closing]
      )
    ).rejects.toThrow("wiki_tag_preview_changed")
    await expect(
      db.query(
        "select public.manage_wiki_tag('delete', null, null, null, null, $1)",
        [[other, closing]]
      )
    ).rejects.toThrow("wiki_tag_delete_used")
    await db.exec("select set_config('test.manager', 'false', false)")
    await expect(
      db.query(
        "select public.manage_wiki_tag('delete', null, null, null, null, $1)",
        [[other]]
      )
    ).rejects.toThrow("wiki_manage_required")
    await db.exec("select set_config('test.manager', 'true', false)")
    await db.query(
      "select public.manage_wiki_tag('delete', null, null, null, null, $1)",
      [[other]]
    )
    expect(
      (await db.query("select id from public.wiki_tags where id=$1", [other]))
        .rows
    ).toHaveLength(0)
    expect(
      (await db.query("select id from public.wiki_tags where id=$1", [closing]))
        .rows
    ).toHaveLength(1)
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.wiki_tag_audit"
        )
      ).rows[0].count
    ).toBe(6)
  })

  it("blocks promotion when a global name exists and permits merging into it", async () => {
    // Simulate a pre-existing collision; the current name guard prevents creating one.
    await db.exec(
      "alter table public.wiki_tags disable trigger wiki_tags_guard_name"
    )
    const global = (
      await db.query<{ id: string }>(
        "insert into public.wiki_tags(name) values ('Scoped') returning id"
      )
    ).rows[0].id
    await db.exec(
      "alter table public.wiki_tags enable trigger wiki_tags_guard_name"
    )
    const scoped = (
      await db.query<{ id: string }>(
        "select id from public.wiki_tags where scope='section' and name='Scoped'"
      )
    ).rows[0].id
    await expect(
      db.query("select public.manage_wiki_tag('promote', $1)", [scoped])
    ).rejects.toThrow("wiki_tag_name_conflict")
    await db.query("select public.manage_wiki_tag('merge', $1, $2)", [
      scoped,
      global,
    ])
    expect(
      (await db.query("select id from public.wiki_tags where id=$1", [scoped]))
        .rows
    ).toHaveLength(0)
  })
})
