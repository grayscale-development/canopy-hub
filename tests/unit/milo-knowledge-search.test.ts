import { beforeEach, describe, expect, it, vi } from "vitest"

const provider = vi.hoisted(() => ({
  createEmbeddingsWithOpenAI: vi.fn(async () => [[1, 0]]),
}))
vi.mock("@/lib/ai/provider", () => provider)
vi.mock("@/lib/wiki-knowledge-urls", () => ({
  resolveWikiKnowledgeRows: async (_client: unknown, rows: unknown[]) => rows,
}))

import {
  citationSnippet,
  rewriteKnowledgeQuery,
  searchKnowledge,
} from "@/lib/milo/knowledge-search"

function row(
  id: string,
  similarity: number,
  metadata: Record<string, unknown> = {}
) {
  return {
    chunk_id: id,
    source_id: id,
    source_type: "wiki_page",
    source_title: id,
    source_url: null,
    content: id,
    metadata,
    similarity,
  }
}

describe("Milo hybrid retrieval", () => {
  beforeEach(() => vi.clearAllMocks())

  it("expands whole abbreviations without losing the original query", () => {
    expect(rewriteKnowledgeQuery("LO LOA DPA MI auth")).toBe(
      "LO LOA DPA MI auth loan officer loan officer assistant down payment assistance mortgage insurance authorization"
    )
    expect(rewriteKnowledgeQuery("file allocation")).toBe("file allocation")
  })

  it("fuses both rankings by chunk and retains keyword content", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === "match_knowledge_chunks_keyword"
          ? [row("keyword", 1), row("shared", 0.5)]
          : [row("vector", 1), row("shared", 0.5)],
      error: null,
    }))
    const result = await searchKnowledge({ rpc } as never, "LO help", 3, [
      "wiki_page",
    ])
    expect(result.map((item) => item.chunk_id)).toEqual([
      "shared",
      "keyword",
      "vector",
    ])
    expect(rpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_keyword",
      expect.objectContaining({
        search_query: expect.stringContaining("loan officer"),
        source_types: ["wiki_page"],
      })
    )
    expect(rpc).toHaveBeenCalledWith(
      "match_knowledge_chunks",
      expect.objectContaining({ source_types: ["wiki_page"] })
    )
  })

  it("falls back to keyword and breaks ties by publication then date", async () => {
    provider.createEmbeddingsWithOpenAI.mockRejectedValueOnce(
      new Error("offline")
    )
    const rpc = vi.fn(async () => ({
      data: [
        row("draft", 1, { isPublished: false, updatedAt: "2026-01-01" }),
        row("old", 1, { isPublished: true, updatedAt: "2024-01-01" }),
        row("new", 1, { isPublished: true, updatedAt: "2025-01-01" }),
      ],
      error: null,
    }))
    const result = await searchKnowledge({ rpc } as never, "query")
    expect(result.map((item) => item.chunk_id)).toEqual(["new", "old", "draft"])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(citationSnippet("Text", { updatedAt: "2025-01-01T00:00:00Z" })).toBe(
      "Last updated: 2025-01-01. Text"
    )
    expect(citationSnippet("Text", { updatedAt: "invalid" })).toBe("Text")
  })
})
