import { describe, expect, it } from "vitest"
import { rewriteWikiLinks, buildLinkReport } from "@/lib/wiki-link-rewrite"
import type { WikiNodeRow } from "@/lib/wiki"

const nodes = [
  {
    id: "root",
    parent_id: null,
    slug: "wiki",
    short_id: 1,
    type: "folder",
    title: "Wiki",
  },
  {
    id: "section",
    parent_id: "root",
    slug: "closing",
    short_id: 2,
    type: "folder",
    title: "Closing",
  },
  {
    id: "page",
    parent_id: "section",
    slug: "guide",
    short_id: 3,
    type: "page",
    title: "Guide",
    current_revision_id: "revision",
  },
] as WikiNodeRow[]
const link = (href: string) => ({
  type: "link",
  href,
  content: [{ type: "text", text: "Link text", styles: { bold: true } }],
})

describe("wiki link rewrite", () => {
  it("rewrites nested links, preserving text, query and anchor, and leaves other links alone", () => {
    const blocks = [
      {
        type: "paragraph",
        content: [
          link("/wiki/wiki/closing/guide?view=full#part"),
          link("https://hub.example/wiki/wiki/closing/guide#section?x=1"),
          link("https://elsewhere.example/wiki/wiki/closing/guide"),
          link("/api/wiki/assets/123"),
          link("#local"),
          link("/wiki/1/2/3"),
          link("/wiki/wiki/closing/missing"),
          link("/wiki/wiki/%ZZ"),
        ],
        children: [
          {
            type: "table",
            content: {
              rows: [{ cells: [[link("/wiki/WIKI/closing/guide")]] }],
            },
          },
        ],
      },
    ]
    const result = rewriteWikiLinks(blocks, nodes, "hub.example")
    const content = (result.blocks as typeof blocks)[0].content
    expect(content.map((item) => item.href)).toEqual([
      "/wiki/1/2/3?view=full#part",
      "/wiki/1/2/3#section?x=1",
      "https://elsewhere.example/wiki/wiki/closing/guide",
      "/api/wiki/assets/123",
      "#local",
      "/wiki/1/2/3",
      "/wiki/wiki/closing/missing",
      "/wiki/wiki/%ZZ",
    ])
    expect(content[0].content).toEqual(blocks[0].content[0].content)
    expect(result.findings.map((f) => f.status)).toEqual([
      "resolvable",
      "resolvable",
      "already-numeric",
      "unresolvable",
      "unresolvable",
      "resolvable",
    ])
    expect(result.changed).toBe(true)
    const second = rewriteWikiLinks(result.blocks, nodes, "hub.example")
    expect(second.changed).toBe(false)
    expect(second.blocks).toEqual(result.blocks)
    expect(blocks[0].content[0].href).toBe(
      "/wiki/wiki/closing/guide?view=full#part"
    )
  })
  it("reports history and release notes, but creates changes only for current revisions", () => {
    const revisions = ["old", "revision"].map((id) => ({
      id,
      node_id: "page",
      blocks: [link("/wiki/wiki/closing/guide")],
      plain_text: "Link text",
      change_note: null,
      created_by: null,
      created_at: "",
    }))
    const report = buildLinkReport(
      {
        nodes,
        revisions,
        documents: [
          {
            path: "docs/releases/2.1.md",
            content: "[Guide](/wiki/wiki/closing/guide#part)",
          },
        ],
      },
      "hub.example"
    )
    expect(report.rows.map((r) => [r.location, r.current, r.status])).toEqual([
      ["wiki", false, "resolvable"],
      ["wiki", true, "resolvable"],
      ["release-note", true, "resolvable"],
    ])
    expect(report.changes).toHaveLength(1)
    expect(report.changes[0].plain_text).toBe("Link text")
  })
})
