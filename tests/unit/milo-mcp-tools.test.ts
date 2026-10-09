import { beforeEach, describe, expect, it, vi } from "vitest"

const sessions = vi.hoisted(() => {
  const state = {
    tables: [] as string[],
    rows: [] as unknown[],
    signedUrl: null as string | null,
    user: { id: "viewer" } as { id: string } | null,
  }
  function query() {
    const chain = {
      select: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      limit: vi.fn(async () => ({ data: state.rows, error: null })),
    }
    return chain
  }
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    },
    from: vi.fn((table: string) => {
      state.tables.push(table)
      return query()
    }),
    rpc: vi.fn(async () => ({ data: state.rows, error: null })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: state.signedUrl ? { signedUrl: state.signedUrl } : null,
          error: state.signedUrl ? null : { message: "Object not found" },
        })),
        download: vi.fn(async () => ({
          data: null,
          error: { message: "Object not found" },
        })),
      })),
    },
  }
  return { client, state }
})
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => sessions.client),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("Admin access must never be used for retrieval")
  },
}))

import { callMiloMcpTool } from "@/lib/milo/mcp/tools"

describe("Milo effective knowledge access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessions.state.tables = []
    sessions.state.rows = []
    sessions.state.signedUrl = null
    sessions.state.user = { id: "viewer" }
  })

  it("uses user-visible Wiki views for selects, searches and aggregates", async () => {
    for (const tool of ["db_select", "db_search", "db_aggregate"]) {
      const result = await callMiloMcpTool(tool, {
        relation: "public.wiki_nodes",
        query: "SOP",
        operation: "count",
      })
      expect(result.ok).toBe(true)
    }
    expect(sessions.state.tables).toEqual([
      "milo_wiki_nodes",
      "milo_wiki_nodes",
      "milo_wiki_nodes",
    ])
    await callMiloMcpTool("db_select", { relation: "public.wiki_assets" })
    expect(sessions.state.tables.at(-1)).toBe("milo_wiki_assets")
  })

  it("returns permitted draft content and citation snippets from the user RPC", async () => {
    sessions.state.rows = [
      {
        source_title: "Draft SOP",
        source_url: "/wiki/draft",
        content: "Draft-only procedure",
        source_type: "wiki_page",
      },
    ]
    const result = await callMiloMcpTool("knowledge_search", {
      query: "SOP",
      userId: "spoofed-user",
    })
    expect(result.content).toMatchObject({ rows: sessions.state.rows })
    expect(result.sources).toEqual([
      {
        title: "Draft SOP",
        url: "/wiki/draft",
        snippet: "Draft-only procedure",
        sourceType: "wiki_page",
      },
    ])
    expect(sessions.client.rpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_keyword",
      { search_query: "SOP", match_count: 8, source_types: null }
    )
  })

  it("cannot create snippets or citations for denied RPC results", async () => {
    const result = await callMiloMcpTool("knowledge_search", {
      query: "Draft SOP",
    })
    expect(result.content).toMatchObject({ rows: [] })
    expect(result.sources).toEqual([])
  })

  it("fails closed without an authenticated session", async () => {
    sessions.state.user = null
    const result = await callMiloMcpTool("knowledge_search", {
      query: "SOP",
      userId: "manager",
    })
    expect(result.ok).toBe(false)
    expect(sessions.client.rpc).not.toHaveBeenCalled()
  })

  it("uses user storage RLS for signed URLs and text instead of bypassing denied objects", async () => {
    for (const tool of ["storage_signed_url", "storage_read_text"]) {
      const result = await callMiloMcpTool(tool, {
        bucket: "Wiki",
        path: "draft/secret.md",
      })
      expect(result.ok).toBe(false)
      expect(result.sources).toBeUndefined()
    }
    sessions.state.signedUrl = "https://local.test/permitted"
    const permitted = await callMiloMcpTool("storage_signed_url", {
      bucket: "Wiki",
      path: "draft/secret.md",
    })
    expect(permitted.ok).toBe(true)
    expect(permitted.sources?.[0].url).toBe(sessions.state.signedUrl)
  })
})
