import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const tables = [
  "wiki_nodes",
  "wiki_page_revisions",
  "wiki_assets",
  "wiki_page_tags",
  "knowledge_sources",
] as const

/** Read-only snapshot; use a quiet database for comparable before/after results. */
export async function verifyWikiIntegrity(client: SupabaseClient) {
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
    if (error || count === null) throw new Error(`Could not count ${table}`)
    counts[table] = count
  }

  const hash = createHash("sha256")
  let lastId: string | undefined
  let seen = 0
  for (;;) {
    let query = client
      .from("wiki_nodes")
      .select("id,parent_id,title,status,current_revision_id")
      .order("id")
      .limit(1000)
    if (lastId) query = query.gt("id", lastId)
    const { data, error } = await query
    if (error) throw new Error("Could not read wiki_nodes")
    for (const row of data ?? []) {
      hash.update(
        JSON.stringify([
          row.id,
          row.parent_id,
          row.title,
          row.status,
          row.current_revision_id,
        ]) + "\n"
      )
      lastId = row.id
      seen++
    }
    if (!data || data.length < 1000) break
  }
  if (seen !== counts.wiki_nodes) {
    throw new Error("wiki_nodes changed during verification; run again")
  }
  return { counts, checksum: hash.digest("hex") }
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error("Supabase URL and service role key are required")
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await verifyWikiIntegrity(client)
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`${table}: ${count}`)
  }
  console.log(`wiki_nodes_sha256: ${result.checksum}`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
