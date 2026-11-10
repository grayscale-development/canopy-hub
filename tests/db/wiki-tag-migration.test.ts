import { readFileSync } from "node:fs"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611090002_wiki_tag_levels.sql",
  "utf8"
)
let db: PGlite
let before: unknown

async function snapshot() {
  return (
    await db.query(`select
    (select jsonb_agg(jsonb_build_array(id, name) order by id) from public.wiki_tags) as tags,
    (select jsonb_agg(jsonb_build_array(node_id, tag_id) order by node_id, tag_id) from public.wiki_page_tags) as links,
    (select jsonb_agg(jsonb_build_array(id, tags) order by id) from public.wiki_nodes) as nodes`)
  ).rows
}

describe("tag levels migration over legacy data", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable as $$ select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
      create function public.user_has_permission_code(uuid, text) returns boolean language sql stable as $$ select true $$;
      create table public.wiki_nodes (id uuid primary key default gen_random_uuid(), parent_id uuid references public.wiki_nodes(id), type text not null, tags text[] not null default '{}', updated_by uuid, constraint wiki_nodes_tags_limit check (cardinality(tags) <= 12));
      create table public.wiki_tags (id uuid primary key default gen_random_uuid(), name text not null unique check (btrim(name) <> ''), created_at timestamptz not null default now());
      create table public.wiki_page_tags (node_id uuid references public.wiki_nodes(id) on delete cascade, tag_id uuid references public.wiki_tags(id) on delete cascade, primary key (node_id,tag_id));
      insert into public.wiki_nodes(id,type) values ('10000000-0000-4000-8000-000000000001','folder'), ('10000000-0000-4000-8000-000000000002','folder');
      insert into public.wiki_tags(name) select 'Tag ' || i from generate_series(1, 250) i;
      insert into public.wiki_tags(name) values ('Closing'), ('closing');
      insert into public.wiki_nodes(type,parent_id,tags) select 'page', '10000000-0000-4000-8000-000000000001', array(select 'Tag ' || i from generate_series(1,12) i) from generate_series(1,200);
      with selected as (select id, row_number() over (order by id) as n from public.wiki_nodes where type='page' order by id limit 2)
      update public.wiki_nodes p set tags = p.tags[1:11] || array[case selected.n when 1 then 'Closing' else 'closing' end] from selected where p.id = selected.id;
      insert into public.wiki_page_tags select n.id,t.id from public.wiki_nodes n cross join public.wiki_tags t where n.type='page' and t.name = any(n.tags);
    `)
    before = await snapshot()
    await db.exec(migration)
    await db.exec(migration)
  })
  afterAll(async () => {
    await db?.close()
  })

  it("preserves hundreds of tags, page links and 12-tag arrays through both runs", async () => {
    expect(await snapshot()).toEqual(before)
    const counts = await db.query<{
      tags: number
      links: number
      global: number
    }>(
      `select (select count(*)::int from public.wiki_tags) tags, (select count(*)::int from public.wiki_page_tags) links, (select count(*)::int from public.wiki_tags where scope='global' and section_id is null) global`
    )
    expect(counts.rows[0]).toEqual({ tags: 252, links: 2400, global: 252 })
    const legacy = await db.query<{ name: string; links: number }>(
      "select t.name, count(pt.node_id)::int as links from public.wiki_tags t join public.wiki_page_tags pt on pt.tag_id = t.id where t.name in ('Closing', 'closing') group by t.name order by t.name"
    )
    expect(legacy.rows).toEqual([
      { name: "Closing", links: 1 },
      { name: "closing", links: 1 },
    ])
    await expect(
      db.exec("insert into public.wiki_tags(name) values ('CLOSING')")
    ).rejects.toThrow("wiki_tag_name_conflict")
  })

  it("validates scope, per-section names, ancestry and atomic sync after a move", async () => {
    await expect(
      db.exec(
        "insert into public.wiki_tags(name,scope) values ('Bad', 'section')"
      )
    ).rejects.toThrow()
    await db.exec(`insert into public.wiki_tags(name,scope,section_id) values
      ('Scoped','section','10000000-0000-4000-8000-000000000001'),
      ('SCOPED','section','10000000-0000-4000-8000-000000000002')`)
    await expect(
      db.exec(
        "insert into public.wiki_tags(name,scope,section_id) values ('sCoPeD','section','10000000-0000-4000-8000-000000000001')"
      )
    ).rejects.toThrow()
    await expect(
      db.exec(
        "insert into public.wiki_tags(name,scope,section_id) values ('CLOSING','section','10000000-0000-4000-8000-000000000001')"
      )
    ).rejects.toThrow("wiki_tag_name_conflict")
    const page = (
      await db.query<{ id: string }>(
        "select id from public.wiki_nodes where type='page' order by id limit 1"
      )
    ).rows[0].id
    await db.query("select public.sync_wiki_page_tags($1, $2::jsonb)", [
      page,
      JSON.stringify([
        {
          name: "Scoped",
          scope: "section",
          section_id: "10000000-0000-4000-8000-000000000001",
        },
        { name: "Closing", scope: "global" },
      ]),
    ])
    const saved = await snapshot()
    await expect(
      db.query("select public.sync_wiki_page_tags($1, $2::jsonb)", [
        page,
        JSON.stringify([
          {
            name: "Scoped",
            scope: "section",
            section_id: "10000000-0000-4000-8000-000000000002",
          },
        ]),
      ])
    ).rejects.toThrow("wiki_tag_out_of_scope")
    expect(await snapshot()).toEqual(saved)
    await db.query(
      "update public.wiki_nodes set parent_id='10000000-0000-4000-8000-000000000002' where id=$1",
      [page]
    )
    const out = await db.query<{ name: string }>(
      "select name from public.wiki_page_out_of_scope_tags($1)",
      [page]
    )
    expect(out.rows).toEqual([{ name: "Scoped" }])
  })
})
