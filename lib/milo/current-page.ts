import "server-only"

import type { SupabaseWikiClient } from "@/lib/wiki"
import type { MiloSourceCard } from "@/lib/milo/mcp/tools"

export type MiloCurrentPage = {
  pageId?: string
  title: string
  url: string
  updatedAt?: string
}

export async function currentPageEvidence(
  supabase: SupabaseWikiClient,
  page: MiloCurrentPage
): Promise<MiloSourceCard[]> {
  if (!page.pageId) return []
  const { data: source } = await supabase
    .from("knowledge_sources")
    .select("id")
    .eq("source_type", "wiki_page")
    .eq("source_id", page.pageId)
    .eq("status", "active")
    .maybeSingle()
  if (!source) return []
  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("id,content")
    .eq("source_id", source.id)
    .order("chunk_index")
    .limit(3)
  return (chunks ?? []).map((chunk) => ({
    title: page.title,
    url: page.url,
    snippet: chunk.content,
    sourceType: "wiki_page",
    knowledgeSourceId: source.id,
    knowledgeChunkId: chunk.id,
    updatedAt: page.updatedAt,
  }))
}
