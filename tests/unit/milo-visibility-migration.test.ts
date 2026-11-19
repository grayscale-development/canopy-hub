import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611190005_milo_visibility_initplan.sql",
  "utf8"
)

describe("Milo visibility migration", { timeout: 60_000 }, () => {
  it("is idempotent and plans the non-storage helper once per statement", async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema app_private; create schema auth;
        create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
        create function app_private.user_has_permission_code(uuid,text) returns boolean language sql as $$select true$$;
        create table public.wiki_nodes (id uuid, parent_id uuid, status text, type text);
        create table public.wiki_assets (id uuid, node_id uuid, status text);
        create table public.support_directory_sections (id uuid);
        create table public.knowledge_sources (id uuid, status text, source_type text, source_id text, url text, metadata jsonb);
        create table public.knowledge_chunks (source_id uuid);
        create function public.milo_can_access_knowledge_source(text,text,text,jsonb) returns boolean language sql as $$select false$$;
        alter table public.knowledge_sources enable row level security;
        alter table public.knowledge_chunks enable row level security;
        grant usage on schema app_private to authenticated;
        grant select on public.knowledge_sources, public.knowledge_chunks to authenticated;
      `)
      await db.exec(migration)
      await db.exec(migration)
      await db.exec("set role authenticated")
      for (const table of ["knowledge_sources", "knowledge_chunks"]) {
        const plan = await db.query<{ "QUERY PLAN": string }>(
          `explain select * from public.${table}`
        )
        expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
          "InitPlan"
        )
      }
    } finally {
      await db.close()
    }
  })
})
