import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611170003_wiki_alerts_scan_service_role_grants.sql",
  "utf8"
)
const tables = [
  ["wiki_nodes", "id"],
  ["wiki_page_revisions", "node_id"],
  ["wiki_duplicate_dismissals", "node_id"],
] as const

describe("alerts scan grants migration", { timeout: 60_000 }, () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.wiki_nodes (id uuid);
      create table public.wiki_page_revisions (id uuid);
      create table public.wiki_duplicate_dismissals (id uuid);
      grant references, trigger, truncate on public.wiki_nodes, public.wiki_page_revisions, public.wiki_duplicate_dismissals to service_role;
    `)
  })

  afterAll(async () => {
    await db?.close()
  })

  it("adds only service-role reads to the staging-like privileges, idempotently", async () => {
    for (const [table] of tables) {
      const before = await db.query<{ allowed: boolean }>(
        "select has_table_privilege('service_role', $1, 'select') as allowed",
        [`public.${table}`]
      )
      expect(before.rows[0].allowed).toBe(false)
    }

    await db.exec(migration)
    await db.exec(migration)

    for (const [table] of tables) {
      const privileges = await db.query(
        `select
          has_table_privilege('service_role', $1, 'select') as can_select,
          has_table_privilege('service_role', $1, 'insert') as can_insert,
          has_table_privilege('service_role', $1, 'update') as can_update,
          has_table_privilege('service_role', $1, 'delete') as can_delete,
          has_table_privilege('anon', $1, 'select') as anon_select,
          has_table_privilege('authenticated', $1, 'select') as authenticated_select`,
        [`public.${table}`]
      )
      expect(privileges.rows[0]).toEqual({
        can_select: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
        anon_select: false,
        authenticated_select: false,
      })
    }
  })
})

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("alerts scan service-role reads", { timeout: 60_000 }, () => {
  let service: SupabaseClient
  const fixture = randomUUID()

  beforeAll(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) {
      throw new Error("Local Supabase required")
    }
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
  })

  it.each(tables)("can select from %s", async (table, column) => {
    const result = await service.from(table).select(column).eq(column, fixture)
    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })
})
