import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: "manager" as string | null,
  allowed: true,
  nodes: [] as Record<string, unknown>[],
  revisions: [] as Record<string, unknown>[],
  vectors: [] as Record<string, unknown>[],
  calls: 0,
  embeddingFails: false,
}))
vi.mock("@/lib/wiki-ai", async () => {
  const provider = await import("@/lib/ai/provider")
  return {
    embedTexts: async (texts: string[]) => {
      if (state.embeddingFails) throw new Error("provider unavailable")
      return provider.createEmbeddingsWithOpenAI(texts)
    },
  }
})
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user } : null },
      }),
    },
    from: (table: string) => ({
      select: () =>
        table === "milo_wiki_nodes"
          ? {
              order: () => ({
                range: async () => ({ data: state.nodes, error: null }),
              }),
            }
          : {
              in: async (_column: string, ids: string[]) => ({
                data: (table === "wiki_nodes"
                  ? state.nodes
                  : state.revisions
                ).filter((r) => ids.includes(r.id as string)),
                error: null,
              }),
            },
    }),
    rpc: async (_name: string, args: { query_embedding: number[] }) => {
      expect(args.query_embedding).toHaveLength(1536)
      state.calls++
      return { data: state.vectors, error: null }
    },
  }),
}))
import { POST } from "@/app/api/wiki/duplicates/route"

const source = "10000000-0000-4000-8000-000000000001"
const other = "10000000-0000-4000-8000-000000000002"
const text =
  "Before publishing a procedure, verify that every required approval has been recorded in the review log."
const block = (value: string, id = "block") => [
  { id, type: "paragraph", content: [{ type: "text", text: value }] },
]
const request = (body: unknown) =>
  new Request("http://localhost/api/wiki/duplicates", {
    method: "POST",
    body: JSON.stringify(body),
  })
const node = (id: string, revision: string, short: number) => ({
  id,
  short_id: short,
  parent_id: null,
  type: "page",
  title: `Page ${short}`,
  status: "published",
  current_revision_id: revision,
})

beforeEach(() => {
  state.user = `manager-${crypto.randomUUID()}`
  state.allowed = true
  state.calls = 0
  state.embeddingFails = false
  state.nodes = [node(source, "rev1", 1), node(other, "rev2", 2)]
  state.revisions = [
    { id: "rev1", node_id: source, blocks: block(text) },
    { id: "rev2", node_id: other, blocks: block(text.toUpperCase(), "other") },
  ]
  state.vectors = []
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "fake-embedding")
})
afterEach(() => vi.unstubAllEnvs())

describe("duplicate route", () => {
  it("requires an editor and validates input", async () => {
    state.user = null
    expect((await POST(request({ nodeId: source }))).status).toBe(401)
    state.user = "reader"
    state.allowed = false
    expect((await POST(request({ nodeId: source }))).status).toBe(403)
    state.allowed = true
    expect((await POST(request({ nodeId: "bad" }))).status).toBe(400)
    expect(
      (
        await POST(
          request({
            nodeId: source,
            text: "not a current selection with sufficient characters to qualify",
          })
        )
      ).status
    ).toBe(400)
  })
  it("checks current blocks, supports selections and caches by user and visible revisions", async () => {
    const result = await (await POST(request({ nodeId: source }))).json()
    expect(result).toEqual({
      revisionId: "rev1",
      passages: [
        {
          blockId: "block",
          common: false,
          matches: [
            expect.objectContaining({
              pageId: other,
              title: "Page 2",
              path: "/wiki/2",
              type: "near-exact",
              score: 1,
            }),
          ],
        },
      ],
    })
    await POST(request({ nodeId: source }))
    expect(state.calls).toBe(1)
    state.nodes[1] = node(other, "rev3", 2)
    state.revisions.push({
      id: "rev3",
      node_id: other,
      blocks: block(
        "A completely different paragraph about team scheduling and calendar management."
      ),
    })
    const revised = await (await POST(request({ nodeId: source }))).json()
    expect(revised.passages[0].matches).toEqual([])
    expect(state.calls).toBe(2)
    const selected = await (
      await POST(request({ nodeId: source, text: text.slice(0, 70) }))
    ).json()
    expect(selected.passages[0].blockId).toBe("block")
  })
  it("uses caller-scoped semantic hits, rejects stale index rows and falls back without embeddings", async () => {
    state.revisions[1].blocks = block(
      "A different passage concerning the approval workflow and publishing decisions."
    )
    state.vectors = [
      {
        content: "A matching chunk",
        similarity: 0.95,
        metadata: { nodeId: other, revisionId: "old" },
      },
    ]
    expect(
      (await (await POST(request({ nodeId: source }))).json()).passages[0]
        .matches
    ).toEqual([])
    state.user = "another-manager"
    state.vectors[0].metadata = { nodeId: other, revisionId: "rev2" }
    expect(
      (await (await POST(request({ nodeId: source }))).json()).passages[0]
        .matches
    ).toEqual([
      expect.objectContaining({
        pageId: other,
        type: "paraphrase",
        score: 0.95,
      }),
    ])
    state.user = "third-manager"
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    expect(
      (await (await POST(request({ nodeId: source }))).json()).passages[0]
        .matches
    ).toEqual([])
    expect(state.calls).toBe(2)
  })
  it("retains lexical matches if the embedding provider fails", async () => {
    state.embeddingFails = true
    const response = await POST(request({ nodeId: source }))
    expect(response.status).toBe(200)
    expect((await response.json()).passages[0].matches).toContainEqual(
      expect.objectContaining({ pageId: other, type: "near-exact" })
    )
  })
  it("maps a selection spanning multiple blocks back to both block IDs", async () => {
    const second =
      "The coordinator records the completed review in the shared tracking system."
    state.revisions[0].blocks = [
      ...block(text, "first"),
      ...block(second, "second"),
    ]
    state.revisions[1].blocks = [
      ...block(text, "other-first"),
      ...block(second, "other-second"),
    ]
    const response = await POST(
      request({ nodeId: source, text: `${text}\n\n${second}` })
    )
    expect(response.status).toBe(200)
    expect((await response.json()).passages).toEqual([
      expect.objectContaining({
        blockId: "first",
        matches: [expect.objectContaining({ pageId: other })],
      }),
      expect.objectContaining({
        blockId: "second",
        matches: [expect.objectContaining({ pageId: other })],
      }),
    ])
  })
  it("bounds page checks and allows a shorter selection", async () => {
    state.revisions[0].blocks = Array.from(
      { length: 81 },
      (_, i) => block(`${text} Item ${i}`, `block-${i}`)[0]
    )
    expect((await POST(request({ nodeId: source }))).status).toBe(400)
    const response = await POST(
      request({ nodeId: source, text: `${text} Item 2` })
    )
    expect(response.status).toBe(200)
  })
  it("marks text found on more than three pages common and excludes archived ancestry", async () => {
    for (let i = 3; i <= 5; i++) {
      const id = `page-${i}`
      state.nodes.push(node(id, `rev${i}`, i))
      state.revisions.push({ id: `rev${i}`, node_id: id, blocks: block(text) })
    }
    const result = await (await POST(request({ nodeId: source }))).json()
    expect(result.passages[0]).toEqual({
      blockId: "block",
      common: true,
      matches: [],
    })
    state.user = "another"
    state.nodes[4].status = "archived"
    const lessCommon = await (await POST(request({ nodeId: source }))).json()
    expect(lessCommon.passages[0].common).toBe(false)
    expect(lessCommon.passages[0].matches).toHaveLength(3)
  })
})
