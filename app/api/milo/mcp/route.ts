import { NextResponse } from "next/server"

import { callMiloMcpTool, MILO_MCP_TOOLS } from "@/lib/milo/mcp/tools"

export const runtime = "nodejs"

interface JsonRpcBody {
  id?: unknown
  method?: unknown
  params?: unknown
}

function jsonRpcResult(id: unknown, result: unknown) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  })
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    },
    { status: code === -32601 ? 404 : 400 }
  )
}

function assertMcpBearer(request: Request) {
  const expectedToken = process.env.MILO_MCP_SERVER_TOKEN?.trim()

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Missing MILO_MCP_SERVER_TOKEN." },
      { status: 503 }
    )
  }

  const authorization = request.headers.get("authorization") ?? ""
  if (authorization !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function POST(request: Request) {
  const authError = assertMcpBearer(request)
  if (authError) {
    return authError
  }

  const body = (await request.json().catch(() => null)) as JsonRpcBody | null
  const id = body?.id ?? null
  const method = typeof body?.method === "string" ? body.method : ""
  const params = getObject(body?.params)

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "canopy-hub-milo",
        version: "1.0.0",
      },
      capabilities: {
        tools: {},
      },
    })
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, {
      tools: MILO_MCP_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: true,
        },
      })),
    })
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : ""
    const args = "arguments" in params ? params.arguments : {}
    const result = await callMiloMcpTool(name, args)

    return jsonRpcResult(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      isError: !result.ok,
    })
  }

  return jsonRpcError(id, -32601, `Unknown MCP method: ${method}`)
}
