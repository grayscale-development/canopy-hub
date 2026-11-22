import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/wiki-ai", () => ({
  embedTexts: async (texts: string[]) => texts.map(() => [1]),
}))

import {
  chooseCanonicalPage,
  classifyDuplicatePages,
  detectWikiDuplicates,
} from "@/lib/wiki-duplicates"

const paragraph = (text: string, id: string) => ({
  id,
  type: "paragraph",
  content: [{ type: "text", text }],
  children: [],
})
const text =
  "Before closing, check the approvals and record the signed documents in the shared tracking system."
const info = (
  id: string,
  status = "published",
  createdAt = "2026-01-01",
  inboundLinks = 0
) => ({
  id,
  title: id,
  path: `/wiki/${id === "a" ? 1 : 2}`,
  status,
  createdAt,
  inboundLinks,
})

beforeEach(() => {
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "")
  vi.stubEnv("OPENAI_API_KEY", "")
})
afterEach(() => vi.unstubAllEnvs())

describe("alert classification and canonical selection", () => {
  it("classifies full text and 90 percent near-exact passages as identical, but partial matches as overlap", () => {
    expect(
      classifyDuplicatePages(
        ["Closing!", text],
        ["closing", text.toUpperCase()]
      )
    ).toBe("identical")
    const parts = Array.from({ length: 10 }, (_, i) => `${text} Step ${i}`)
    expect(
      classifyDuplicatePages(parts, [
        ...parts.slice(0, 9),
        "A different instruction about vacation schedules.",
      ])
    ).toBe("identical")
    expect(
      classifyDuplicatePages(
        [text, "Unrelated material"],
        [text, "Different material"]
      )
    ).toBe("overlap")
    expect(
      classifyDuplicatePages(
        [text],
        [
          "A completely different paragraph about managing appointments and time off.",
        ]
      )
    ).toBeNull()
  })
  it("prefers published, then older, then more inbound links, and breaks final ties by id", () => {
    expect(
      chooseCanonicalPage(
        info("a", "draft", "2020", 99),
        info("b", "published", "2026")
      ).id
    ).toBe("b")
    expect(
      chooseCanonicalPage(
        info("a", "published", "2020"),
        info("b", "published", "2021", 99)
      ).id
    ).toBe("a")
    expect(
      chooseCanonicalPage(
        info("a", "published", "2020", 1),
        info("b", "published", "2020", 2)
      ).id
    ).toBe("b")
    expect(chooseCanonicalPage(info("b"), info("a")).id).toBe("a")
  })
  it("includes drafts in both directions, excludes archived pages and ignores common boilerplate", async () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      short_id: i + 1,
      parent_id: null,
      type: "page",
      title: id,
      status: i === 0 ? "draft" : "published",
      current_revision_id: `r-${id}`,
      created_at: `2026-01-0${i + 1}`,
    }))
    const revisions = nodes.map((node) => ({
      id: node.current_revision_id,
      node_id: node.id,
      blocks: [paragraph(text, `block-${node.id}`)],
    }))
    const client = {
      from: (table: string) => ({
        select: (columns: string) =>
          columns === "id"
            ? {
                order: () => ({
                  range: async () => ({
                    data: nodes.map(({ id }) => ({ id })),
                    error: null,
                  }),
                }),
              }
            : {
                in: async (_: string, ids: string[]) => ({
                  data: (table === "wiki_nodes" ? nodes : revisions).filter(
                    (row) => ids.includes(row.id)
                  ),
                  error: null,
                }),
              },
      }),
    } as unknown as Parameters<typeof detectWikiDuplicates>[0]
    let result = await detectWikiDuplicates(
      client,
      "job",
      "a",
      undefined,
      false,
      true
    )
    expect(result?.passages[0]).toMatchObject({ common: true, matches: [] })
    nodes[2].status = "archived"
    nodes[3].status = "archived"
    nodes[4].status = "archived"
    result = await detectWikiDuplicates(
      client,
      "job",
      "a",
      undefined,
      false,
      true
    )
    expect(result?.passages[0].matches[0]).toMatchObject({
      pageId: "b",
      classification: "identical",
      exact: true,
      page: { status: "published" },
    })
    result = await detectWikiDuplicates(
      client,
      "job",
      "b",
      undefined,
      false,
      true
    )
    expect(result?.passages[0].matches[0]).toMatchObject({
      pageId: "a",
      page: { status: "draft" },
    })
    expect(
      await detectWikiDuplicates(client, "job", "c", undefined, false, true)
    ).toBeNull()
  })
  it("finds short identical pages and ignores the same text when it appears on four pages", async () => {
    const nodes = ["a", "b", "c", "d"].map((id, i) => ({
      id,
      short_id: i + 1,
      parent_id: null,
      type: "page",
      title: id,
      status: "draft",
      current_revision_id: `r-${id}`,
      created_at: "2026-01-01",
    }))
    const revisions = nodes.map((node) => ({
      id: node.current_revision_id,
      node_id: node.id,
      blocks: [paragraph("Short page", `block-${node.id}`)],
    }))
    const client = {
      from: (table: string) => ({
        select: (columns: string) =>
          columns === "id"
            ? {
                order: () => ({
                  range: async () => ({
                    data: nodes.map(({ id }) => ({ id })),
                    error: null,
                  }),
                }),
              }
            : {
                in: async (_: string, ids: string[]) => ({
                  data: (table === "wiki_nodes" ? nodes : revisions).filter(
                    (row) => ids.includes(row.id)
                  ),
                  error: null,
                }),
              },
      }),
    } as unknown as Parameters<typeof detectWikiDuplicates>[0]
    expect(
      (await detectWikiDuplicates(client, "job", "a", undefined, false, true))
        ?.passages
    ).toEqual([])
    nodes[2].status = "archived"
    nodes[3].status = "archived"
    expect(
      (await detectWikiDuplicates(client, "job", "a", undefined, false, true))
        ?.passages[0].matches[0]
    ).toMatchObject({ pageId: "b", classification: "identical", exact: true })
  })
  it("does not surface paraphrases below the embedding threshold", async () => {
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "fake-embedding")
    const nodes = ["a", "b"].map((id, i) => ({
      id,
      short_id: i + 1,
      parent_id: null,
      type: "page",
      title: id,
      status: "draft",
      current_revision_id: `r-${id}`,
      created_at: "2026-01-01",
    }))
    const revisions = [
      { id: "r-a", node_id: "a", blocks: [paragraph(text, "a-block")] },
      {
        id: "r-b",
        node_id: "b",
        blocks: [
          paragraph(
            "A different paragraph about how teams should schedule their vacations and share the calendar.",
            "b-block"
          ),
        ],
      },
    ]
    const client = {
      from: (table: string) => ({
        select: (columns: string) =>
          columns === "id"
            ? {
                order: () => ({
                  range: async () => ({
                    data: nodes.map(({ id }) => ({ id })),
                    error: null,
                  }),
                }),
              }
            : {
                in: async (_: string, ids: string[]) => ({
                  data: (table === "wiki_nodes" ? nodes : revisions).filter(
                    (row) => ids.includes(row.id)
                  ),
                  error: null,
                }),
              },
      }),
      rpc: async () => ({
        data: [
          {
            content: "Similar indexed text",
            similarity: 0.85,
            metadata: { nodeId: "b", revisionId: "r-b" },
          },
        ],
        error: null,
      }),
    } as unknown as Parameters<typeof detectWikiDuplicates>[0]
    expect(
      (await detectWikiDuplicates(client, "job", "a", undefined, false, true))
        ?.passages[0].matches
    ).toEqual([])
  })
})
