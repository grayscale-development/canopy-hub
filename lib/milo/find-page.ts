import "server-only"

import type { SupabaseWikiClient, WikiNodeRow } from "@/lib/wiki"
import { embedTexts } from "@/lib/wiki-ai"
import { rankPageCandidates, type PageMatch } from "@/lib/milo/page-candidates"

export async function findPageCandidates(
  supabase: SupabaseWikiClient,
  facts: string[]
) {
  const query = facts.join(" ").slice(0, 5000)
  const [embedding] = await embedTexts([query])
  const [keyword, semantic] = await Promise.all([
    supabase.rpc("match_knowledge_chunks_keyword", {
      search_query: query,
      match_count: 50,
      source_types: ["wiki_page"],
    }),
    supabase.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_count: 50,
      source_types: ["wiki_page"],
    }),
  ])
  if (keyword.error || semantic.error)
    throw new Error("Unable to find wiki pages.")
  const keywords = (keyword.data ?? []) as PageMatch[]
  const semantics = (semantic.data ?? []) as PageMatch[]
  const ids = [
    ...new Set([...keywords, ...semantics].map((row) => row.source_id)),
  ]
  if (!ids.length) return []
  const nodes: WikiNodeRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const tree = await supabase
      .from("wiki_nodes")
      .select("*")
      .order("id")
      .range(offset, offset + 999)
    if (tree.error) throw new Error("Unable to find wiki pages.")
    nodes.push(...((tree.data ?? []) as WikiNodeRow[]))
    if ((tree.data ?? []).length < 1000) break
  }
  const sources = await supabase
    .from("knowledge_sources")
    .select("id,source_id")
    .eq("source_type", "wiki_page")
    .in("id", ids)
  if (sources.error) throw new Error("Unable to find wiki pages.")
  if (!sources.data?.length) return []
  const visible = await supabase
    .from("milo_wiki_nodes")
    .select("id")
    .in(
      "id",
      (sources.data ?? []).map((source) => source.source_id)
    )
  if (visible.error) throw new Error("Unable to find wiki pages.")
  const visibleIds = new Set((visible.data ?? []).map((node) => node.id))
  return rankPageCandidates(
    nodes,
    (sources.data ?? []).filter((source) => visibleIds.has(source.source_id)),
    keywords,
    semantics,
    query
  )
}

export async function isEditablePage(
  supabase: SupabaseWikiClient,
  pageId: string
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      pageId
    )
  )
    return false
  const { data, error } = await supabase
    .from("milo_wiki_nodes")
    .select("id,type")
    .eq("id", pageId)
    .eq("type", "page")
    .maybeSingle()
  if (error) throw new Error("Unable to check page access.")
  return Boolean(data)
}
