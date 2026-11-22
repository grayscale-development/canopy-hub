import type { WikiNodeRow } from "@/lib/wiki"
import { buildWikiBreadcrumbs } from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

// Adjust this one threshold as ranking quality is evaluated with real content.
export const HIGH_CONFIDENCE_THRESHOLD = 0.7

export type PageMatch = {
  source_id: string
  content: string
  similarity: number
}

export function rankPageCandidates(
  nodes: WikiNodeRow[],
  sources: { id: string; source_id: string }[],
  keyword: PageMatch[],
  semantic: PageMatch[],
  query = ""
) {
  const bySource = new Map(
    sources.map((source) => [source.id, source.source_id])
  )
  const byNode = new Map(nodes.map((node) => [node.id, node]))
  const scores = new Map<
    string,
    { keyword: number; semantic: number; snippet: string }
  >()
  for (const [kind, rows] of [
    ["keyword", keyword],
    ["semantic", semantic],
  ] as const) {
    for (const row of rows) {
      const nodeId = bySource.get(row.source_id)
      const node = nodeId && byNode.get(nodeId)
      if (!node || node.type !== "page") continue
      const entry = scores.get(node.id) ?? {
        keyword: 0,
        semantic: 0,
        snippet: "",
      }
      const score = Math.max(0, Math.min(1, row.similarity || 0))
      if (score > entry[kind]) {
        entry[kind] = score
        if (kind === "keyword" || !entry.snippet) entry.snippet = row.content
      }
      scores.set(node.id, entry)
    }
  }
  return [...scores]
    .flatMap(([id, value]) => {
      const node = byNode.get(id)!
      // Reject missing, archived, or cyclic ancestry rather than constructing a partial URL.
      const visited = new Set<string>()
      let current: WikiNodeRow | undefined = node
      while (current) {
        if (
          visited.has(current.id) ||
          current.status === "archived" ||
          !Number.isSafeInteger(current.short_id) ||
          current.short_id < 1
        )
          return []
        visited.add(current.id)
        if (!current.parent_id) break
        current = byNode.get(current.parent_id)
        if (!current) return []
      }
      const score = (value.keyword + value.semantic) / 2
      const content = value.snippet.replace(/\s+/g, " ").trim()
      const terms = query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
      const position =
        terms
          .map((term) => content.toLowerCase().indexOf(term))
          .find((index) => index >= 0) ?? 0
      const start = Math.max(0, position - 50)
      const snippet = `${start ? "…" : ""}${content.slice(start, start + 180)}${content.length > start + 180 ? "…" : ""}`
      return [
        {
          id,
          title: node.title,
          breadcrumb: buildWikiBreadcrumbs(nodes, node)
            .slice(0, -1)
            .map((item) => item.title)
            .join(" > "),
          updatedAt: node.updated_at,
          snippet,
          confidence:
            score >= HIGH_CONFIDENCE_THRESHOLD
              ? ("High" as const)
              : ("Possible" as const),
          url: `/wiki/${buildNumericWikiPath(nodes, node)}`,
          score,
        },
      ]
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      breadcrumb: candidate.breadcrumb,
      updatedAt: candidate.updatedAt,
      snippet: candidate.snippet,
      confidence: candidate.confidence,
      url: candidate.url,
    }))
}
