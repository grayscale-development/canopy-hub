import { readFileSync } from "node:fs"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611090007_wiki_node_short_id.sql",
  "utf8"
)
const databases: PGlite[] = []

async function fixture(withRows = true) {
  const db = new PGlite()
  databases.push(db)
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema app_private;
    create table public.wiki_nodes (
      id uuid primary key default gen_random_uuid(), parent_id uuid references public.wiki_nodes(id),
      type text not null, slug text not null, title text not null, status text not null,
      sort_order integer not null default 0, current_revision_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end $$;
    create trigger trg_wiki_nodes_updated_at before update on public.wiki_nodes
      for each row execute function public.set_updated_at();
    create table public.wiki_page_revisions (id uuid primary key, node_id uuid references public.wiki_nodes(id));
    alter table public.wiki_nodes add foreign key(current_revision_id) references public.wiki_page_revisions(id);
    create table public.wiki_assets (id uuid primary key, node_id uuid references public.wiki_nodes(id));
    create table public.wiki_page_tags (node_id uuid references public.wiki_nodes(id), tag_id uuid, primary key(node_id, tag_id));
    create table public.knowledge_sources (id uuid primary key, source_id text);
  `)
  if (withRows)
    await db.exec(`
    insert into public.wiki_nodes(id,type,slug,title,status,sort_order,created_at,updated_at)
    select md5('root-' || i)::uuid, 'folder', 'root-' || i, 'Root ' || i, 'published', 4-i,
      '2020-01-01'::timestamptz, '2020-01-01'::timestamptz from generate_series(1,3) i;
    insert into public.wiki_nodes(id,parent_id,type,slug,title,status,created_at,updated_at)
    select md5('section-' || i)::uuid, md5('root-' || ((i-1)/3+1))::uuid, 'folder', 'section-' || i, 'Section ' || i, 'published',
      '2021-01-01'::timestamptz, '2020-01-01'::timestamptz from generate_series(1,9) i;
    insert into public.wiki_nodes(id,parent_id,type,slug,title,status,created_at,updated_at)
    select md5('group-' || i)::uuid, md5('section-' || ((i-1)/3+1))::uuid, 'folder', 'group-' || i, 'Group ' || i, 'published',
      '2021-01-01'::timestamptz, '2020-01-01'::timestamptz from generate_series(1,27) i;
    insert into public.wiki_nodes(id,parent_id,type,slug,title,status,created_at,updated_at)
    select md5('page-' || i)::uuid, md5('group-' || ((i-1)/12+1))::uuid, 'page', 'page-' || i, 'Page ' || i, 'draft',
      '2021-01-01'::timestamptz + (i % 7) * interval '1 day', '2020-01-01'::timestamptz from generate_series(1,324) i;
    insert into public.wiki_page_revisions select md5('rev-' || i)::uuid, md5('page-' || i)::uuid from generate_series(1,324) i;
    update public.wiki_nodes n set current_revision_id = r.id from public.wiki_page_revisions r where n.id = r.node_id;
    insert into public.wiki_assets select md5('asset-' || i)::uuid, md5('page-' || i)::uuid from generate_series(1,100) i;
    insert into public.wiki_page_tags select md5('page-' || i)::uuid, md5('tag-' || (i % 10))::uuid from generate_series(1,324) i;
    insert into public.knowledge_sources select md5('source-' || i)::uuid, md5('page-' || i)::uuid::text from generate_series(1,324) i;
  `)
  return db
}

async function snapshot(db: PGlite, after = false) {
  return (
    await db.query(`select
    (select jsonb_agg(${after ? "to_jsonb(n) - 'short_id'" : "to_jsonb(n)"} order by id) from public.wiki_nodes n) nodes,
    (select jsonb_agg(to_jsonb(r) order by id) from public.wiki_page_revisions r) revisions,
    (select jsonb_agg(to_jsonb(a) order by id) from public.wiki_assets a) assets,
    (select jsonb_agg(to_jsonb(t) order by node_id, tag_id) from public.wiki_page_tags t) tags,
    (select jsonb_agg(to_jsonb(s) order by id) from public.knowledge_sources s) sources`)
  ).rows
}

afterAll(async () => {
  await Promise.all(databases.map((db) => db.close()))
})

describe("wiki short ID migration", { timeout: 60_000 }, () => {
  it("preserves all fixture data and assigns the same ordered mapping twice", async () => {
    const first = await fixture()
    const second = await fixture()
    const before = await snapshot(first)
    await first.exec(migration)
    await second.exec(migration)
    expect(await snapshot(first, true)).toEqual(before)
    const mapping = (db: PGlite) =>
      db.query<{ id: string; short_id: number }>(
        "select id, short_id::int from public.wiki_nodes order by id"
      )
    const assigned = (await mapping(first)).rows
    expect(assigned).toHaveLength(363)
    expect(new Set(assigned.map((row) => row.short_id)).size).toBe(363)
    expect(assigned.every((row) => row.short_id > 0)).toBe(true)
    expect((await mapping(second)).rows).toEqual(assigned)
    const roots = (
      await first.query<{ short_id: number }>(
        "select short_id::int from public.wiki_nodes where parent_id is null order by sort_order,created_at,id"
      )
    ).rows
    expect(roots.map((r) => r.short_id)).toEqual([1, 2, 3])
    const order = (
      await first.query<{ actual: number; expected: number }>(
        `select short_id::int actual, row_number() over (order by created_at,id)::int + 3 expected from public.wiki_nodes where parent_id is not null order by created_at,id`
      )
    ).rows
    expect(order.every((row) => row.actual === row.expected)).toBe(true)
    await first.exec(migration)
    expect((await mapping(first)).rows).toEqual(assigned)
    await expect(
      first.exec(
        "update public.wiki_nodes set short_id=999999 where short_id=1"
      )
    ).rejects.toThrow("immutable")
    await first.exec(
      "update public.wiki_nodes set title='Renamed' where short_id=1"
    )
    const inserted = (
      await first.query<{ short_id: number }>(
        "insert into public.wiki_nodes(type,slug,title,status) values ('page','new','New','draft') returning short_id::int"
      )
    ).rows[0].short_id
    expect(inserted).toBe(364)
    await first.exec(`delete from public.wiki_nodes where short_id=${inserted}`)
    await first.exec(migration)
    const next = (
      await first.query<{ short_id: number }>(
        "insert into public.wiki_nodes(type,slug,title,status) values ('page','new2','New','draft') returning short_id::int"
      )
    ).rows[0].short_id
    expect(next).toBeGreaterThan(inserted)
  })

  it("starts at one on an empty database and remains idempotent", async () => {
    const db = await fixture(false)
    await db.exec(migration)
    await db.exec(migration)
    const row = (
      await db.query<{ short_id: number }>(
        "insert into public.wiki_nodes(type,slug,title,status) values ('page','first','First','draft') returning short_id::int"
      )
    ).rows[0]
    expect(row.short_id).toBe(1)
  })
})
