import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mcpTools = vi.hoisted(() => ({
  MILO_MCP_TOOLS: [
    {
      name: "db_schema",
      description: "List schema",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  callMiloMcpTool: vi.fn(async () => ({
    ok: true,
    toolName: "db_schema",
    content: { relations: [] },
  })),
}))

vi.mock("@/lib/milo/mcp/tools", () => mcpTools)

describe("/api/milo/mcp route", () => {
  const originalToken = process.env.MILO_MCP_SERVER_TOKEN

  beforeEach(() => {
    process.env.MILO_MCP_SERVER_TOKEN = "test-token"
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.MILO_MCP_SERVER_TOKEN
    } else {
      process.env.MILO_MCP_SERVER_TOKEN = originalToken
    }
  })

  it("rejects requests without the internal bearer token", async () => {
    const { POST } = await import("@/app/api/milo/mcp/route")

    const response = await POST(
      new Request("http://test.local/api/milo/mcp", {
        method: "POST",
        body: JSON.stringify({ id: 1, method: "tools/list" }),
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("lists read-only tools", async () => {
    const { POST } = await import("@/app/api/milo/mcp/route")

    const response = await POST(
      new Request("http://test.local/api/milo/mcp", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
        body: JSON.stringify({ id: 1, method: "tools/list" }),
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "db_schema",
            annotations: {
              readOnlyHint: true,
            },
          },
        ],
      },
    })
  })

  it("calls an internal Milo MCP tool", async () => {
    const { POST } = await import("@/app/api/milo/mcp/route")

    const response = await POST(
      new Request("http://test.local/api/milo/mcp", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
        body: JSON.stringify({
          id: 2,
          method: "tools/call",
          params: {
            name: "db_schema",
            arguments: {},
          },
        }),
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        isError: false,
      },
    })
    expect(mcpTools.callMiloMcpTool).toHaveBeenCalledWith("db_schema", {})
  })
})
