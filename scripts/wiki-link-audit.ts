import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  buildLinkReport,
  type AuditData,
  type ReportRow,
} from "../lib/wiki-link-rewrite"

export function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment"
    )
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function readData(db: SupabaseClient): Promise<AuditData> {
  async function read(table: string, fields: string) {
    const rows: unknown[] = []
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db
        .from(table)
        .select(fields)
        .order("id")
        .range(start, start + 999)
      if (error) throw new Error(`Reading ${table}: ${error.message}`)
      rows.push(...data)
      if (data.length < 1000) return rows
    }
  }
  const files = await readdir("docs/releases")
  const documents = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map(async (file) => ({
        path: `docs/releases/${file}`,
        content: await readFile(`docs/releases/${file}`, "utf8"),
      }))
  )
  // Separate paginated reads can straddle another transaction. Retry an
  // inconsistent node/revision snapshot instead of rejecting a harmless write.
  for (let attempt = 0; attempt < 4; attempt++) {
    const [nodes, revisions] = (await Promise.all([
      read(
        "wiki_nodes",
        "id,short_id,parent_id,type,slug,title,status,sort_order,current_revision_id,created_by,updated_by,created_at,updated_at"
      ),
      read(
        "wiki_page_revisions",
        "id,node_id,blocks,plain_text,change_note,created_by,created_at"
      ),
    ])) as [AuditData["nodes"], AuditData["revisions"]]
    const nodeIds = new Set(nodes.map((node) => node.id))
    const revisionById = new Map(
      revisions.map((revision) => [revision.id, revision])
    )
    if (
      revisions.every((revision) => nodeIds.has(revision.node_id)) &&
      nodes.every(
        (node) =>
          !node.current_revision_id ||
          revisionById.get(node.current_revision_id)?.node_id === node.id
      )
    )
      return { nodes, revisions, documents }
  }
  throw new Error("Could not read a consistent wiki snapshot; retry the scan")
}

export function createReport(data: AuditData, siteHost: string) {
  const result = buildLinkReport(data, siteHost)
  const linkedRevisions = new Set(
    result.rows
      .filter((row) => row.location === "wiki")
      .map((row) => row.revision)
  )
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        revisions: data.revisions.filter((revision) =>
          linkedRevisions.has(revision.id)
        ),
        documents: data.documents,
      })
    )
    .digest("hex")
  return {
    version: 2,
    siteHost,
    digest,
    pageCount: data.nodes.filter((n) => n.type === "page").length,
    revisionCount: data.revisions.length,
    ...result,
  }
}

// Protect every slug lookup (including the first missing segment) between the
// last scan and the locked transaction, without freezing unrelated tree nodes.
export function resolutionGuards(rows: ReportRow[], nodes: AuditData["nodes"]) {
  const guards: {
    parent_id: string | null
    slug: string
    matches: { id: string; short_id: number }[]
  }[] = []
  for (const row of rows) {
    if (row.status === "already-numeric") continue
    const path = row.old_href.startsWith("/")
      ? row.old_href
      : row.old_href.match(/^https?:\/\/[^/?#]+(\/[^?#]*)([?#].*)?$/i)?.[1]
    if (!path) continue
    let segments: string[]
    try {
      segments = path
        .slice(6)
        .split(/[?#]/, 1)[0]
        .replace(/\/$/, "")
        .split("/")
        .map(decodeURIComponent)
    } catch {
      continue
    }
    let parentId: string | null = null
    for (const slug of segments) {
      const matches = nodes.filter(
        (node) =>
          node.parent_id === parentId &&
          node.slug.toLowerCase() === slug.toLowerCase()
      )
      guards.push({
        parent_id: parentId,
        slug,
        matches: matches.map(({ id, short_id }) => ({ id, short_id })),
      })
      if (!matches.length) break
      parentId = matches[0].id
    }
  }
  return guards
}

export function csv(rows: ReportRow[]) {
  const columns: (keyof ReportRow)[] = [
    "page",
    "page_id",
    "revision",
    "current",
    "location",
    "old_href",
    "proposed_href",
    "status",
  ]
  const escape = (value: unknown) => {
    let text = String(value)
    if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return (
    [
      columns.join(","),
      ...rows.map((row) => columns.map((col) => escape(row[col])).join(",")),
    ].join("\n") + "\n"
  )
}

async function main(args: string[]) {
  if (args.length !== 4 || args[0] !== "--site-url" || args[2] !== "--output")
    throw new Error(
      "Usage: wiki-link-audit.ts --site-url https://production-host --output report-prefix"
    )
  const url = new URL(args[1])
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "--site-url must be the application origin (no path, credentials, query or fragment)"
    )
  const report = createReport(await readData(client()), url.hostname)
  await writeFile(`${args[3]}.json`, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  })
  try {
    await writeFile(`${args[3]}.csv`, csv(report.rows), { flag: "wx" })
  } catch (error) {
    throw new Error(
      `CSV not written; remove or rename ${args[3]}.json before retrying: ${error}`
    )
  }
  console.log(
    `Wrote ${args[3]}.csv and ${args[3]}.json; ${report.pageCount} pages, ${report.revisionCount} revisions, ${report.changes.length} current pages to update`
  )
  for (const status of ["resolvable", "unresolvable", "already-numeric"])
    console.log(
      `${status}: ${report.rows.filter((row) => row.status === status).length}`
    )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
