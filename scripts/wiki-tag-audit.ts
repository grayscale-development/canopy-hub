import { writeFile, readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { buildTagAuditReport, type AuditData } from "../lib/wiki-tag-audit"
import { writeAuditCsv } from "../lib/wiki-tag-audit-csv"

// This reader has no mutation path. Pagination avoids silently truncating exports.
export async function readAuditData(
  client: SupabaseClient
): Promise<AuditData> {
  const read = async (table: string, fields: string) => {
    const rows: unknown[] = []
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client
        .from(table)
        .select(fields)
        .order(table === "wiki_page_tags" ? "node_id" : "id")
        .order(table === "wiki_page_tags" ? "tag_id" : "id")
        .range(start, start + 999)
      if (error) throw new Error(`Reading ${table}: ${error.message}`)
      rows.push(...data)
      if (data.length < 1000) return rows
    }
  }
  const [tags, pageTags, nodes] = await Promise.all([
    read("wiki_tags", "id,name,created_at,scope,section_id"),
    read("wiki_page_tags", "node_id,tag_id"),
    read("wiki_nodes", "id,parent_id,type,title,slug"),
  ])
  return { tags, pageTags, nodes } as AuditData
}

export async function loadAuditData(file?: string): Promise<AuditData> {
  if (file) return JSON.parse(await readFile(file, "utf8")) as AuditData
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error(
      "Set the Supabase URL and service role key, or use --from-json"
    )
  return readAuditData(
    createClient(url, key, { auth: { persistSession: false } })
  )
}

async function main(args: string[]) {
  if (args.length && (args.length !== 2 || args[0] !== "--from-json"))
    throw new Error("Usage: wiki-tag-audit.ts [--from-json export.json]")
  const rows = buildTagAuditReport(await loadAuditData(args[1]))
  const output = `wiki-tag-audit-${new Date().toISOString().slice(0, 10)}.csv`
  await writeFile(output, writeAuditCsv(rows), { flag: "wx" })
  console.log(`Wrote ${output} (${rows.length} tags)`)
  for (const action of [
    "global",
    "section",
    "delete-candidate",
    "merge-candidate",
  ])
    console.log(
      `${action}: ${rows.filter((row) => row.proposed_action === action).length}`
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
