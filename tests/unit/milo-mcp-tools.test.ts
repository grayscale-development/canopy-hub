import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMock = vi.hoisted(() => {
  const state = {
    filters: [] as Array<{ table: string; column: string; value: unknown }>,
  }

  function createQuery(table: string) {
    return {
      select: vi.fn(() => createQuery(table)),
      or: vi.fn(() => createQuery(table)),
      order: vi.fn(() => createQuery(table)),
      eq: vi.fn((column: string, value: unknown) => {
        state.filters.push({ table, column, value })
        return createQuery(table)
      }),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }
  }

  return {
    state,
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => createQuery(table)),
      schema: vi.fn(() => ({
        from: vi.fn((table: string) => createQuery(table)),
      })),
    })),
  }
})

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: supabaseMock.createSupabaseAdminClient,
}))

describe("Milo MCP tools", () => {
  beforeEach(() => {
    supabaseMock.state.filters = []
    vi.clearAllMocks()
  })

  it("filters wiki database tools to viewer-visible knowledge", async () => {
    const { callMiloMcpTool } = await import("@/lib/milo/mcp/tools")

    await callMiloMcpTool("db_select", {
      relation: "public.wiki_nodes",
    })
    await callMiloMcpTool("db_search", {
      relation: "public.knowledge_sources",
      query: "borrower auth",
    })
    await callMiloMcpTool("db_aggregate", {
      relation: "public.wiki_assets",
      operation: "count",
    })

    expect(supabaseMock.state.filters).toEqual([
      { table: "wiki_nodes", column: "status", value: "published" },
      { table: "knowledge_sources", column: "status", value: "active" },
      { table: "wiki_assets", column: "status", value: "active" },
    ])
  })
})
