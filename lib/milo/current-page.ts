import "server-only"

import type { SupabaseWikiClient } from "@/lib/wiki"
import type { MiloSourceCard } from "@/lib/milo/mcp/tools"

export type MiloCurrentPage = {
  pageId?: string
  title: string
  url: string
  updatedAt?: string
  kind?: "wiki_page" | "app_page"
  section?: string
  area?: string
}

export function describeCurrentPage(page: MiloCurrentPage) {
  const kind =
    page.kind ??
    (page.pageId || /^\/wiki\//.test(page.url) ? "wiki_page" : "app_page")
  return {
    ...page,
    kind,
    description:
      kind === "wiki_page"
        ? `The user is reading the wiki page "${page.title}"${page.section ? ` in the ${page.section} section` : ""}${page.area ? ` of ${/^the\b/i.test(page.area) ? "" : "the "}${page.area}` : ""}.`
        : `The user is on the Canopy Hub app page "${page.title}".`,
  }
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

// Fetch a bounded set of chunks from a page already returned by permission-aware search.
export async function topPageEvidence(
  supabase: SupabaseWikiClient,
  sources: MiloSourceCard[]
): Promise<MiloSourceCard[]> {
  const top = sources.find(
    (source) =>
      source.sourceType === "wiki_page" &&
      source.knowledgeSourceId &&
      source.knowledgeChunkId
  )
  if (!top || typeof supabase.from !== "function") return []
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("id,content,metadata")
    .eq("source_id", top.knowledgeSourceId!)
    .order("chunk_index")
    .limit(8)
  return (data ?? []).map((chunk) => ({
    ...top,
    knowledgeChunkId: chunk.id,
    snippet: chunk.content,
    headingPath: Array.isArray(chunk.metadata?.headingPath)
      ? chunk.metadata.headingPath.filter(
          (part: unknown): part is string => typeof part === "string"
        )
      : [],
    vectorSimilarity: undefined,
  }))
}
