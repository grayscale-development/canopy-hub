import { describe, expect, it } from "vitest"

import {
  filterWikiSidebar,
  sidebarHighlightRanges,
} from "@/lib/wiki-sidebar-filter"
import type { WikiNodeRow } from "@/lib/wiki"

const nodes = [
  { id: "section", parent_id: "root", title: "Operations", type: "folder" },
  { id: "group", parent_id: "section", title: "Closing", type: "folder" },
  {
    id: "page",
    parent_id: "group",
    title: "Loan Éstimate Checklist",
    type: "page",
  },
  { id: "other", parent_id: "group", title: "Final Review", type: "page" },
  { id: "another", parent_id: "root", title: "Hub", type: "folder" },
] as WikiNodeRow[]

describe("filterWikiSidebar", () => {
  it("matches accents, case and words in any order and keeps ancestors", () => {
    const result = filterWikiSidebar(nodes, "EST loan")
    expect([...result.matchIds]).toEqual(["page"])
    expect(result.visibleIds).toEqual(new Set(["section", "group", "page"]))
    expect(sidebarHighlightRanges(nodes[2].title, "EST loan")).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 8 },
    ])
    expect(sidebarHighlightRanges("Cafe\u0301", "cafe")).toEqual([
      { start: 0, end: 5 },
    ])
  })

  it("keeps descendants of matching sections and groups", () => {
    expect(filterWikiSidebar(nodes, "closing").visibleIds).toEqual(
      new Set(["section", "group", "page", "other"])
    )
    expect(filterWikiSidebar(nodes, "operations").visibleIds).toEqual(
      new Set(["section", "group", "page", "other"])
    )
  })

  it("handles empty queries and no results", () => {
    expect(filterWikiSidebar(nodes, "  ").visibleIds).toEqual(
      new Set(nodes.map((node) => node.id))
    )
    expect(filterWikiSidebar(nodes, "xyz").visibleIds.size).toBe(0)
    expect(filterWikiSidebar(nodes, "xyz").matchIds.size).toBe(0)
  })
})
