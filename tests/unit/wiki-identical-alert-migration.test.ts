import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611190004_wiki_identical_alert_apply.sql",
  "utf8"
)
const target = "00000000-0000-4000-8000-000000000001"
const canonical = "00000000-0000-4000-8000-000000000002"
const targetRevision = "00000000-0000-4000-8000-000000000003"
const canonicalRevision = "00000000-0000-4000-8000-000000000004"
const alert = "00000000-0000-4000-8000-000000000005"
const other = "00000000-0000-4000-8000-000000000007"
const otherAlert = "00000000-0000-4000-8000-000000000008"
const user = "00000000-0000-4000-8000-000000000006"

describe("identical alert archive migration", { timeout: 60_000 }, () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      grant usage on schema app_private to authenticated, service_role;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
      create function public.user_has_permission_code(uuid, text) returns boolean language sql as $$ select current_setting('test.allowed', true) = 'yes' $$;
      create table public.wiki_nodes (id uuid primary key, parent_id uuid, type text, status text, current_revision_id uuid, updated_by uuid);
      create table public.wiki_alerts (id uuid primary key, status text, page_id uuid, other_page_id uuid, recommendation jsonb, applied_by uuid, applied_at timestamptz, dismissed_by uuid, dismissed_at timestamptz);
      create table public.knowledge_sources (source_type text, source_id text, status text, last_indexed_at timestamptz);
    `)
    await db.exec(migration)
    await db.exec(migration)
    await db.query(
      "insert into public.wiki_nodes (id,type,status,current_revision_id) values ($1,'page','draft',$2),($3,'page','published',$4)",
      [target, targetRevision, canonical, canonicalRevision]
    )
    await db.query(
      "insert into public.wiki_alerts (id,status,page_id,other_page_id,recommendation) values ($1,'open',$2,$3,$4)",
      [
        alert,
        target,
        canonical,
        JSON.stringify({
          version: 2,
          kind: "identical",
          targetPageId: target,
          canonicalPageId: canonical,
          baseRevisionId: targetRevision,
          canonicalRevisionId: canonicalRevision,
        }),
      ]
    )
    await db.query(
      "insert into public.wiki_nodes (id,type,status,current_revision_id) values ($1,'page','published',$2)",
      [other, canonicalRevision]
    )
    await db.query(
      "insert into public.wiki_alerts (id,status,page_id,other_page_id) values ($1,'open',$2,$3)",
      [otherAlert, target, other]
    )
    await db.query(
      "insert into public.knowledge_sources (source_type,source_id,status) values ('wiki_page',$1,'active')",
      [target]
    )
    await db.query("select set_config('test.user',$1,false)", [user])
  })
  afterAll(async () => {
    await db?.close()
  })
  it("denies non-managers and leaves both records untouched when a revision is stale", async () => {
    expect(
      (
        await db.query(
          "select has_function_privilege('anon', 'public.apply_identical_wiki_alert(uuid)', 'execute') as allowed"
        )
      ).rows[0]
    ).toEqual({ allowed: false })
    await db.exec(
      "select set_config('test.allowed','no',false); set role authenticated"
    )
    await expect(
      db.query("select public.apply_identical_wiki_alert($1)", [alert])
    ).rejects.toThrow("forbidden")
    await db.exec("reset role; select set_config('test.allowed','yes',false)")
    await db.query(
      "update public.wiki_nodes set current_revision_id=$1 where id=$2",
      [targetRevision, canonical]
    )
    await db.exec("set role authenticated")
    await expect(
      db.query("select public.apply_identical_wiki_alert($1)", [alert])
    ).rejects.toThrow("stale_revision")
    await db.exec("reset role")
    expect(
      (
        await db.query("select status from public.wiki_nodes where id=$1", [
          target,
        ])
      ).rows[0]
    ).toEqual({ status: "draft" })
    expect(
      (
        await db.query("select status from public.wiki_alerts where id=$1", [
          alert,
        ])
      ).rows[0]
    ).toEqual({ status: "open" })
  })
  it("archives only the copy and its knowledge source and marks the alert applied", async () => {
    await db.query(
      "update public.wiki_nodes set current_revision_id=$1 where id=$2",
      [canonicalRevision, canonical]
    )
    await db.exec("set role authenticated")
    await db.query("select public.apply_identical_wiki_alert($1)", [alert])
    await db.exec("reset role")
    expect(
      (
        await db.query("select status from public.wiki_nodes where id=$1", [
          target,
        ])
      ).rows[0]
    ).toEqual({ status: "archived" })
    expect(
      (
        await db.query("select status from public.wiki_nodes where id=$1", [
          canonical,
        ])
      ).rows[0]
    ).toEqual({ status: "published" })
    expect(
      (
        await db.query(
          "select status, applied_by from public.wiki_alerts where id=$1",
          [alert]
        )
      ).rows[0]
    ).toEqual({ status: "applied", applied_by: user })
    expect(
      (
        await db.query(
          "select status from public.knowledge_sources where source_id=$1",
          [target]
        )
      ).rows[0]
    ).toEqual({ status: "archived" })
    expect(
      (
        await db.query(
          "select status, dismissed_by from public.wiki_alerts where id=$1",
          [otherAlert]
        )
      ).rows[0]
    ).toEqual({ status: "dismissed", dismissed_by: user })
    await expect(
      db.query("select public.apply_identical_wiki_alert($1)", [alert])
    ).rejects.toThrow("stale_alert")
  })
})
