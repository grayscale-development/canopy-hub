import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  canAccess: true,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  knowledge: [] as Array<Record<string, unknown>>,
}))
vi.mock("@/lib/wiki", async (original) => ({
  ...(await original<typeof import("@/lib/wiki")>()),
  fetchWikiNodes: async () => [
    { id: "root", parent_id: null, short_id: 1, type: "folder" },
    { id: "new-parent", parent_id: "root", short_id: 9, type: "folder" },
    { id: "page", parent_id: "new-parent", short_id: 22, type: "page" },
  ],
}))
vi.mock("@/lib/wiki-ai", async () => {
  const provider = await import("@/lib/ai/provider")
  return { embedTexts: provider.createEmbeddingsWithOpenAI }
})
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.canAccess,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args })
      return {
        data:
          name === "match_wiki_tags"
            ? [{ id: "semantic" }, { id: "h" }]
            : state.knowledge,
        error: null,
      }
    },
    from: (table: string) => ({
      select: () =>
        table === "wiki_tags"
          ? {
              order: () => ({
                range: async () => ({
                  data: [
                    {
                      id: "semantic",
                      name: "Settlement",
                      scope: "global",
                      section_id: null,
                    },
                    { id: "mi", name: "MI", scope: "global", section_id: null },
                    {
                      id: "g",
                      name: "Closing",
                      scope: "global",
                      section_id: null,
                    },
                    {
                      id: "s",
                      name: "Closing",
                      scope: "section",
                      section_id: "visible",
                    },
                    {
                      id: "h",
                      name: "Closing hidden",
                      scope: "section",
                      section_id: "hidden",
                    },
                  ],
                  error: null,
                }),
              }),
            }
          : {
              in: async () => ({
                data:
                  table === "knowledge_sources"
                    ? [
                        {
                          id: "source",
                          source_type: "wiki_page",
                          source_id: "page",
                        },
                      ]
                    : [{ id: "visible", title: "Operations" }],
                error: null,
              }),
            },
    }),
  }),
}))
import { GET } from "@/app/api/wiki/search/route"

beforeEach(() => {
  state.calls = []
  state.knowledge = []
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "fake-embedding")
})
afterEach(() => vi.unstubAllEnvs())

describe("wiki tag search", () => {
  it("labels levels, links to the correct section, and hides inaccessible sections", async () => {
    state.canAccess = true
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=closing")
    )
    expect((await response.json()).results).toEqual([
      expect.objectContaining({
        title: "Closing",
        snippet: "Global",
        url: "/wiki/tags?tag=Closing#tag-closing",
      }),
      expect.objectContaining({
        title: "Closing",
        snippet: "Operations",
        url: "/wiki/tags?tag=Closing&section=visible#tag-closing-visible",
      }),
      expect.objectContaining({
        title: "Settlement",
        snippet: "Global · similar meaning",
      }),
    ])
  })
  it("matches abbreviations through the fake embedding path and falls back when unavailable", async () => {
    const search = async (q: string) =>
      (
        await (
          await GET(
            new NextRequest(
              `http://localhost/api/wiki/search?q=${encodeURIComponent(q)}`
            )
          )
        ).json()
      ).results
    expect(await search("mortgage insurance")).toEqual([
      expect.objectContaining({
        title: "MI",
        snippet: "Global · abbreviation",
      }),
      expect.objectContaining({
        title: "Settlement",
        snippet: "Global · similar meaning",
      }),
    ])
    expect(
      state.calls.find((call) => call.name === "match_wiki_tags")?.args
        .query_embedding
    ).toHaveLength(1536)
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "")
    expect(await search("closng")).toEqual([
      expect.objectContaining({
        title: "Closing",
        snippet: "Global · close spelling",
      }),
      expect.objectContaining({
        title: "Closing",
        snippet: "Operations · close spelling",
      }),
    ])
  })
  it("uses the current numeric page path for an old indexed URL", async () => {
    state.canAccess = true
    state.knowledge = [
      {
        source_id: "source",
        source_type: "wiki_page",
        source_title: "Page",
        source_url: "/wiki/old-slug",
        content: "Text",
        similarity: 1,
      },
    ]
    state.knowledge.push({
      source_id: "missing",
      source_type: "wiki_page",
      source_title: "Missing",
      source_url: "/wiki/old/missing",
      content: "Text",
      similarity: 0.5,
    })
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=page")
    )
    const results = (await response.json()).results
    expect(results).toContainEqual(
      expect.objectContaining({ title: "Page", url: "/wiki/1/9/22" })
    )
    expect(results).not.toContainEqual(
      expect.objectContaining({ title: "Missing" })
    )
  })
  it("does not expose wiki tags without wiki access", async () => {
    state.canAccess = false
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=closing")
    )
    expect((await response.json()).results).toEqual([])
  })
  it("prioritizes wiki pages ahead of other indexed types for beta users", async () => {
    state.canAccess = true
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "")
    state.knowledge = [
      {
        source_id: "person",
        source_type: "employee",
        source_title: "Person",
        source_url: "/people",
        content: "Team",
        similarity: 1,
      },
      {
        source_id: "source",
        source_type: "wiki_page",
        source_title: "Page",
        source_url: "/wiki/old",
        content: "Team",
        similarity: 0.5,
      },
    ]
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=team")
    )
    const results = (await response.json()).results
    expect(results.map((item: { type: string }) => item.type)).toEqual([
      "wiki_page",
      "employee",
    ])
  })
  it("returns non-wiki sources without beta access and excludes wiki rows", async () => {
    state.canAccess = false
    state.knowledge = [
      {
        source_id: "employee",
        source_type: "employee",
        source_title: "A person",
        source_url: "/employee/1",
        content: "Team",
        similarity: 1,
      },
      {
        source_id: "branch",
        source_type: "branch",
        source_title: "A branch",
        source_url: "/branch/1",
        content: "Branch",
        similarity: 0.9,
      },
      {
        source_id: "newsletter",
        source_type: "newsletter",
        source_title: "Newsletter",
        source_url: "/newsletters/open?file=one",
        content: "News",
        similarity: 0.8,
      },
      {
        source_id: "document",
        source_type: "document",
        source_title: "Document",
        source_url: "/documents/1",
        content: "Document",
        similarity: 0.75,
      },
      {
        source_id: "wiki-hidden",
        source_type: "wiki_page",
        source_title: "Hidden",
        source_url: "/home",
        content: "Private",
        similarity: 0.7,
      },
      {
        source_id: "wiki-link",
        source_type: "site",
        source_title: "Wiki",
        source_url: "/wiki",
        content: "Wiki",
        similarity: 0.6,
      },
    ]
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=team")
    )
    const results = (await response.json()).results
    expect(results.map((item: { type: string }) => item.type)).toEqual([
      "employee",
      "branch",
      "newsletter",
      "document",
    ])
    const types = state.calls.find(
      (call) => call.name === "match_knowledge_chunks_keyword"
    )?.args.source_types as string[]
    expect(types).toEqual(
      expect.arrayContaining(["employee", "branch", "newsletter", "document"])
    )
    expect(types).not.toContain("wiki_page")
    expect(types).not.toContain("wiki_asset")
  })
})
