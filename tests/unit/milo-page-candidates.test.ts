import { describe, expect, it } from "vitest"
import { rankPageCandidates } from "@/lib/milo/page-candidates"
import type { WikiNodeRow } from "@/lib/wiki"

function node(
  id: string,
  parent: string | null,
  title: string,
  type: "page" | "folder",
  status: "published" | "archived" = "published"
): WikiNodeRow {
  return {
    id,
    parent_id: parent,
    title,
    type,
    status,
    short_id: Number(id),
    slug: title,
    sort_order: 0,
    current_revision_id: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-02-01",
  }
}

describe("page candidate ranking", () => {
  it("combines keyword and semantic scores, deduplicates, excludes archived and missing branches, and returns three numeric paths", () => {
    const nodes = [
      node("1", null, "Area", "folder"),
      node("2", "1", "Section", "folder"),
      node("3", "2", "Group", "folder"),
      node("4", "3", "Policy", "page"),
      node("5", "2", "Other", "page"),
      node("6", "2", "Third", "page"),
      node("7", "2", "Fourth", "page"),
      node("8", "2", "Old", "page", "archived"),
      node("9", "999", "Orphan", "page"),
    ]
    const sources = ["4", "5", "6", "7", "8", "9"].map((id) => ({
      id: `s${id}`,
      source_id: id,
    }))
    const match = (id: string, similarity: number) => ({
      source_id: `s${id}`,
      similarity,
      content: `Matching text for ${id}`,
    })
    const results = rankPageCandidates(
      nodes,
      sources,
      [
        match("4", 0.9),
        match("4", 0.8),
        match("5", 0.8),
        match("6", 0.7),
        match("7", 0.1),
        match("8", 1),
        match("9", 1),
      ],
      [
        match("4", 0.8),
        match("5", 0.2),
        match("6", 0.1),
        match("8", 1),
        match("9", 1),
      ]
    )
    expect(results.map((item) => item.id)).toEqual(["4", "5", "6"])
    expect(results[0]).toMatchObject({
      title: "Policy",
      breadcrumb: "Area > Section > Group",
      url: "/wiki/1/2/3/4",
      confidence: "High",
      snippet: "Matching text for 4",
      updatedAt: "2026-02-01",
    })
    expect(results[1].confidence).toBe("Possible")
  })
})
