import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { loadAuditData } from "./wiki-tag-audit"
import { parseAuditCsv, validateDecisions } from "../lib/wiki-tag-audit-csv"

async function main(args: string[]) {
  const file = args.shift()
  if (!file || file.startsWith("--"))
    throw new Error(
      "Usage: wiki-tag-apply.ts decisions.csv [--from-json export.json] [--apply --i-have-approval]"
    )
  let input: string | undefined,
    apply = false,
    approval = false
  while (args.length) {
    const arg = args.shift()
    if (arg === "--from-json" && args[0] && !input) input = args.shift()
    else if (arg === "--apply" && !apply) apply = true
    else if (arg === "--i-have-approval" && !approval) approval = true
    else throw new Error(`Invalid argument: ${arg}`)
  }
  if (apply !== approval)
    throw new Error("Applying requires both --apply and --i-have-approval")
  if (!apply && !input) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    let host = ""
    try {
      host = url ? new URL(url).hostname : ""
    } catch {
      // The error below also covers a malformed URL.
    }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
      throw new Error(
        "Dry validation requires a local Supabase URL or --from-json"
      )
  }
  const decisions = validateDecisions(
    parseAuditCsv(await readFile(file, "utf8")),
    await loadAuditData(input),
    apply
  )
  console.log(
    `${apply ? "Applying" : "Would apply"} ${decisions.length} reviewed decisions`
  )
  for (const action of ["keep", "global", "section", "merge", "delete"])
    console.log(
      `${action}: ${decisions.filter((d) => d.action === action).length}`
    )
  if (!apply) return
  if (input)
    throw new Error("Apply requires live validation, not a JSON export")
  if (!decisions.length) throw new Error("No reviewed decisions")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error("Supabase URL and service role key are required")
  const { data, error } = await createClient(url, key, {
    auth: { persistSession: false },
  }).rpc("apply_wiki_tag_decisions", { p_decisions: decisions })
  if (error) throw new Error(error.message)
  console.log(JSON.stringify(data, null, 2))
}
main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
