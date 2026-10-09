import "server-only"

import { indexWikiAsset, indexWikiPage } from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchCurrentRevision,
  isPublishedWikiBranch,
  type SupabaseWikiClient,
  type WikiAssetRow,
  type WikiNodeRow,
} from "@/lib/wiki"

async function fetchWikiNodesForIndex(supabase: SupabaseWikiClient) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select(
      "id,parent_id,type,slug,title,status,sort_order,is_pinned,tags,current_revision_id,created_by,updated_by,created_at,updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WikiNodeRow[]
}

export async function indexWikiKnowledge(supabase: SupabaseWikiClient) {
  const nodes = await fetchWikiNodesForIndex(supabase)
  const pageNodes = nodes.filter((node) => node.type === "page")
  let indexedCount = 0

  for (const node of pageNodes) {
    const path = buildWikiPath(nodes, node)
    const revision = await fetchCurrentRevision(supabase, node)
    const isPagePublished = isPublishedWikiBranch(nodes, node)

    await indexWikiPage({
      supabase,
      node,
      revision,
      path,
      isPublished: isPagePublished,
    })
    indexedCount += node.status !== "archived" ? 1 : 0
  }

  if (!pageNodes.length) {
    return indexedCount
  }

  const { data: assets, error } = await supabase
    .from("wiki_assets")
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .in(
      "node_id",
      pageNodes.map((node) => node.id)
    )

  if (error) {
    throw new Error(error.message)
  }

  const pagesById = new Map(pageNodes.map((node) => [node.id, node]))
  for (const asset of (assets ?? []) as WikiAssetRow[]) {
    const pageNode = pagesById.get(asset.node_id)
    if (!pageNode) {
      continue
    }

    const isPagePublished = isPublishedWikiBranch(nodes, pageNode)
    await indexWikiAsset({
      supabase,
      asset,
      pageTitle: pageNode.title,
      pagePath: buildWikiPath(nodes, pageNode),
      isPagePublished,
    })
    indexedCount += asset.status === "active" ? 1 : 0
  }

  return indexedCount
}
