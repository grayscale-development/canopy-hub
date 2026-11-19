import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migration = readFileSync(
  "supabase/migrations/202611180003_service_role_table_grants.sql",
  "utf8"
)
const tables = [
  "ai_chat_citations",
  "ai_chat_message_flags",
  "ai_chat_message_ratings",
  "ai_chat_messages",
  "ai_chat_threads",
  "permission_requests",
  "permissions",
  "support_directory_entries",
  "support_directory_entry_contacts",
  "support_directory_sections",
  "user_permissions",
  "wiki_assets",
  "wiki_page_tags",
  "wiki_tag_audit",
]

describe("service role table grants migration", { timeout: 60_000 }, () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    // Staging-like privileges: service_role kept only references, trigger and truncate.
    // wiki_tags is left out to prove missing tables are skipped.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      ${tables
        .map(
          (table) =>
            `create table public.${table} (id uuid);
             grant references, trigger, truncate on public.${table} to service_role;`
        )
        .join("\n")}
    `)
  })

  afterAll(async () => {
    await db?.close()
  })

  it("restores service-role DML only, skips missing tables, and is idempotent", async () => {
    await db.exec(migration)
    await db.exec(migration)

    for (const table of tables) {
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
        can_insert: true,
        can_update: true,
        can_delete: true,
        anon_select: false,
        authenticated_select: false,
      })
    }
  })
})
