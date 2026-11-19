import "server-only"

import type { SupabaseWikiClient, WikiNodeRow } from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

export function isWikiKnowledgeSource(type: string) {
  return type === "wiki_page" || type === "wiki_asset"
}

// Resolve through user-visible sources and the current tree, including old
// index rows which predate nodeId metadata.
async function resolveWikiKnowledgeDetails(
  supabase: SupabaseWikiClient,
  sourceIds: string[]
) {
  const details = new Map<
    string,
    { url: string; updatedAt: string; updatedBy?: string; isPublished: boolean }
  >()
  if (!sourceIds.length) return details

  const sourcesResult = await supabase
    .from("knowledge_sources")
    .select("id,source_type,source_id")
    .in("id", [...new Set(sourceIds)])
  if (sourcesResult.error) throw new Error(sourcesResult.error.message)
  const sources = sourcesResult.data ?? []
  const assetIds = sources
    .filter((source) => source.source_type === "wiki_asset")
    .map((source) => source.source_id)
  const assetsResult = assetIds.length
    ? await supabase.from("wiki_assets").select("id,node_id").in("id", assetIds)
    : { data: [], error: null }
  if (assetsResult.error) throw new Error(assetsResult.error.message)

  const assetsById = new Map(
    (assetsResult.data ?? []).map((asset) => [asset.id, asset.node_id])
  )
  const nodesById = new Map<string, WikiNodeRow>()
  const visited = new Set<string>()
  let pending = sources.flatMap((source) => {
    const id =
      source.source_type === "wiki_page"
        ? source.source_id
        : source.source_type === "wiki_asset"
          ? assetsById.get(source.source_id)
          : undefined
    return id ? [id] : []
  })
  while (pending.length) {
    const ids = [...new Set(pending)].filter((id) => !visited.has(id))
    if (!ids.length) break
    ids.forEach((id) => visited.add(id))
    const result = await supabase
      .from("wiki_nodes")
      .select("id,short_id,parent_id,type,status,updated_at")
      .in("id", ids)
    if (result.error) throw new Error(result.error.message)
    const nodes = (result.data ?? []) as WikiNodeRow[]
    nodes.forEach((node) => nodesById.set(node.id, node))
    pending = nodes.flatMap((node) => (node.parent_id ? [node.parent_id] : []))
  }
  const nodes = [...nodesById.values()]
  for (const source of sources) {
    if (!isWikiKnowledgeSource(source.source_type)) continue
    const nodeId =
      source.source_type === "wiki_asset"
        ? assetsById.get(source.source_id)
        : source.source_id
    const node = nodeId ? nodesById.get(nodeId) : undefined
    if (!node || node.type !== "page" || node.status === "archived") continue

    // Do not construct a partial path when an ancestor is absent or malformed.
    const seen = new Set<string>()
    let current = node
    let complete = true
    let isPublished = true
    while (true) {
      if (
        seen.has(current.id) ||
        !Number.isSafeInteger(current.short_id) ||
        current.short_id <= 0
      ) {
        complete = false
        break
      }
      if (current.status !== "published") isPublished = false
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
      details.set(source.id, {
        url: `/wiki/${buildNumericWikiPath(nodes, node)}`,
        updatedAt: node.updated_at,
        isPublished,
      })
  }
  return details
}

export async function resolveWikiKnowledgeUrls(
  supabase: SupabaseWikiClient,
  sourceIds: string[]
) {
  const details = await resolveWikiKnowledgeDetails(supabase, sourceIds)
  return new Map([...details].map(([id, detail]) => [id, detail.url]))
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
  const details = await resolveWikiKnowledgeDetails(
    supabase,
    wikiRows.map((row) => row.source_id)
  )
  return rows.flatMap((row) => {
    if (!isWikiKnowledgeSource(row.source_type)) return [row]
    const detail = details.get(row.source_id)
    if (!detail) return []
    const { url } = detail
    const metadata = {
      ...row.metadata,
      updatedAt: detail.updatedAt,
      updatedBy: detail.updatedBy,
      isPublished: detail.isPublished,
    }
    if (metadata && "path" in metadata) metadata.path = url.slice(6)
    if (metadata && "pagePath" in metadata) metadata.pagePath = url.slice(6)
    return [{ ...row, source_url: url, metadata }]
  })
}
