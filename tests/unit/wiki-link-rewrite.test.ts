import { describe, expect, it } from "vitest"
import { rewriteWikiLinks, buildLinkReport } from "@/lib/wiki-link-rewrite"
import type { WikiNodeRow, WikiRevisionRow } from "@/lib/wiki"
import {
  createReport,
  readData,
  resolutionGuards,
} from "../../scripts/wiki-link-audit"

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
  it("fingerprints link-bearing revisions and guards each lookup, ignoring unrelated records", () => {
    const revision = {
      id: "revision",
      node_id: "page",
      blocks: [link("/wiki/wiki/closing/guide")],
      plain_text: "Link text",
      change_note: null,
      created_by: null,
      created_at: "",
    } as WikiRevisionRow
    const data = { nodes, revisions: [revision], documents: [] }
    const original = createReport(data, "hub.example")
    const other = {
      ...nodes[2],
      id: "other",
      slug: "other",
      current_revision_id: "other-revision",
    }
    const withUnrelated = createReport(
      {
        ...data,
        nodes: [...nodes, other],
        revisions: [
          ...data.revisions,
          { ...revision, id: "other-revision", node_id: "other", blocks: [] },
        ],
      },
      "hub.example"
    )
    expect(withUnrelated.digest).toBe(original.digest)
    expect(withUnrelated.rows).toEqual(original.rows)
    expect(withUnrelated.changes).toEqual(original.changes)
    expect(
      createReport(
        {
          ...data,
          revisions: [
            { ...revision, blocks: [link("/wiki/wiki/closing/guide#edited")] },
          ],
        },
        "hub.example"
      ).digest
    ).not.toBe(original.digest)
    const changedTarget = createReport(
      {
        ...data,
        nodes: nodes.map((node) =>
          node.id === "page" ? { ...node, short_id: 99 } : node
        ),
      },
      "hub.example"
    )
    expect(changedTarget.changes).not.toEqual(original.changes)
    expect(resolutionGuards(original.rows, nodes)).toEqual([
      { parent_id: null, slug: "wiki", matches: [{ id: "root", short_id: 1 }] },
      {
        parent_id: "root",
        slug: "closing",
        matches: [{ id: "section", short_id: 2 }],
      },
      {
        parent_id: "section",
        slug: "guide",
        matches: [{ id: "page", short_id: 3 }],
      },
    ])
    const missing = createReport(
      {
        ...data,
        revisions: [
          { ...revision, blocks: [link("/wiki/wiki/closing/missing")] },
        ],
      },
      "hub.example"
    )
    expect(resolutionGuards(missing.rows, nodes).at(-1)).toEqual({
      parent_id: "section",
      slug: "missing",
      matches: [],
    })
  })
  it("retries when a concurrent write splits the node and revision reads", async () => {
    let revisionReads = 0
    const db = {
      from: (table: string) => ({
        select: () => ({
          order: () => ({
            range: async () => ({
              data:
                table === "wiki_nodes"
                  ? nodes
                  : ++revisionReads === 1
                    ? []
                    : [{ id: "revision", node_id: "page", blocks: [] }],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof readData>[0]
    const result = await readData(db)
    expect(revisionReads).toBe(2)
    expect(result.revisions).toHaveLength(1)
  })
})
