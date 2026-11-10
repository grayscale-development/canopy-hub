import "server-only"

import { createEmbeddingsWithOpenAI } from "@/lib/ai/provider"
import { resolveWikiKnowledgeRows } from "@/lib/wiki-knowledge-urls"
import type { SupabaseWikiClient } from "@/lib/wiki"
import type { KnowledgeSourceType } from "@/lib/wiki-ai"
import abbreviations from "@/lib/milo/abbreviations.json"

export interface RetrievedChunk {
  chunk_id: string
  source_id: string
  source_type: KnowledgeSourceType
  source_title: string
  source_url: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export function rewriteKnowledgeQuery(question: string) {
  const terms = Object.keys(abbreviations).map((key) =>
    key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  )
  const expanded = question.replace(
    new RegExp(`\\b(?:${terms.join("|")})\\b`, "gi"),
    (term) =>
      Object.entries(abbreviations).find(
        ([key]) => key.toLowerCase() === term.toLowerCase()
      )?.[1] ?? term
  )
  return expanded === question ? question : `${question} ${expanded}`
}

export function citationSnippet(
  content: string,
  metadata?: Record<string, unknown> | null
) {
  const date = typeof metadata?.updatedAt === "string" ? metadata.updatedAt : ""
  const prefix = !Number.isNaN(Date.parse(date))
    ? `Last updated: ${date.slice(0, 10)}. `
    : ""
  return `${prefix}${content}`.slice(0, 360)
}

export async function searchKnowledge(
  supabase: SupabaseWikiClient,
  question: string,
  matchCount = 12,
  sourceTypes: string[] | null = null
) {
  const query = rewriteKnowledgeQuery(question)
  const keyword = await supabase.rpc("match_knowledge_chunks_keyword", {
    search_query: query,
    match_count: matchCount,
    source_types: sourceTypes,
  })
  if (keyword.error) throw new Error(keyword.error.message)

  let vectors: RetrievedChunk[] = []
  try {
    const [embedding] = await createEmbeddingsWithOpenAI([query])
    if (embedding?.length) {
      const result = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: embedding,
        match_count: matchCount,
        source_types: sourceTypes,
      })
      if (!result.error) vectors = (result.data ?? []) as RetrievedChunk[]
    }
  } catch {
    // Keyword search remains available without an embedding provider.
  }

  const fused = new Map<string, { row: RetrievedChunk; score: number }>()
  for (const list of [(keyword.data ?? []) as RetrievedChunk[], vectors]) {
    let rank = 0
    let previousSimilarity: number | undefined
    list.forEach((row, index) => {
      if (index === 0 || row.similarity !== previousSimilarity) rank = index + 1
      previousSimilarity = row.similarity
      const existing = fused.get(row.chunk_id)
      if (existing) existing.score += 1 / (60 + rank)
      else fused.set(row.chunk_id, { row, score: 1 / (60 + rank) })
    })
  }
  const rows = await resolveWikiKnowledgeRows(
    supabase,
    [...fused.values()].map(({ row }) => row)
  )
  return rows
    .sort((a, b) => {
      const relevance =
        fused.get(b.chunk_id)!.score - fused.get(a.chunk_id)!.score
      if (Math.abs(relevance) > 1e-12) return relevance
      const authority =
        Number(b.metadata?.isPublished === true) -
        Number(a.metadata?.isPublished === true)
      if (authority) return authority
      return String(b.metadata?.updatedAt ?? "").localeCompare(
        String(a.metadata?.updatedAt ?? "")
      )
    })
    .slice(0, matchCount)
}
