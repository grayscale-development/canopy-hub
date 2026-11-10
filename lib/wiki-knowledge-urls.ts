import "server-only"

import { fetchWikiNodes, type SupabaseWikiClient } from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

export function isWikiKnowledgeSource(type: string) {
  return type === "wiki_page" || type === "wiki_asset"
}

// Resolve through user-visible sources and the current tree, including old
// index rows which predate nodeId metadata.
export async function resolveWikiKnowledgeUrls(
  supabase: SupabaseWikiClient,
  sourceIds: string[]
) {
  const urls = new Map<string, string>()
  if (!sourceIds.length) return urls

  const [nodes, sourcesResult] = await Promise.all([
    fetchWikiNodes(supabase),
    supabase
      .from("knowledge_sources")
      .select("id,source_type,source_id")
      .in("id", [...new Set(sourceIds)]),
  ])
  if (sourcesResult.error) throw new Error(sourcesResult.error.message)
  const sources = sourcesResult.data ?? []
  const assetIds = sources
    .filter((source) => source.source_type === "wiki_asset")
    .map((source) => source.source_id)
  const assetsResult = assetIds.length
    ? await supabase.from("wiki_assets").select("id,node_id").in("id", assetIds)
    : { data: [], error: null }
  if (assetsResult.error) throw new Error(assetsResult.error.message)

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const assetsById = new Map(
    (assetsResult.data ?? []).map((asset) => [asset.id, asset.node_id])
  )
  for (const source of sources) {
    if (!isWikiKnowledgeSource(source.source_type)) continue
    const nodeId =
      source.source_type === "wiki_asset"
        ? assetsById.get(source.source_id)
        : source.source_id
    const node = nodeId ? nodesById.get(nodeId) : undefined
    if (!node || node.type !== "page") continue

    // Do not construct a partial path when an ancestor is absent or malformed.
    const seen = new Set<string>()
    let current = node
    let complete = true
    while (true) {
      if (
        seen.has(current.id) ||
        !Number.isSafeInteger(current.short_id) ||
        current.short_id <= 0
      ) {
        complete = false
        break
      }
      seen.add(current.id)
      if (!current.parent_id) break
      const parent = nodesById.get(current.parent_id)
      if (!parent) {
        complete = false
        break
      }
      current = parent
    }
    if (complete)
      urls.set(source.id, `/wiki/${buildNumericWikiPath(nodes, node)}`)
  }
  return urls
}

export async function resolveWikiKnowledgeRows<
  T extends {
    source_id: string
    source_type: string
    source_url: string | null
    metadata?: Record<string, unknown> | null
  },
>(supabase: SupabaseWikiClient, rows: T[]) {
  const wikiRows = rows.filter((row) => isWikiKnowledgeSource(row.source_type))
  const urls = await resolveWikiKnowledgeUrls(
    supabase,
    wikiRows.map((row) => row.source_id)
  )
  return rows.flatMap((row) => {
    if (!isWikiKnowledgeSource(row.source_type)) return [row]
    const url = urls.get(row.source_id)
    if (!url) return []
    const metadata = row.metadata ? { ...row.metadata } : row.metadata
    if (metadata && "path" in metadata) metadata.path = url.slice(6)
    if (metadata && "pagePath" in metadata) metadata.pagePath = url.slice(6)
    return [{ ...row, source_url: url, metadata }]
  })
}
