import { beforeEach, describe, expect, it, vi } from "vitest"

const testState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  answer: {
    answer: "Open /wiki/canopy-wiki for the Wiki.",
    model: "fake-chat",
    citations: [
      {
        knowledgeSourceId: "source-1",
        knowledgeChunkId: "chunk-1",
        title: "Wiki",
        url: "/wiki/canopy-wiki",
        snippet: "Wiki documentation lives here.",
      },
    ],
  },
  answerError: null as Error | null,
  tables: {
    permissions: [] as Array<Record<string, unknown>>,
    user_permissions: [] as Array<Record<string, unknown>>,
    ai_chat_threads: [] as Array<Record<string, unknown>>,
    ai_chat_messages: [] as Array<Record<string, unknown>>,
    ai_chat_citations: [] as Array<Record<string, unknown>>,
    ai_chat_message_flags: [] as Array<Record<string, unknown>>,
  },
  nextId: 1,
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: testState.user } }),
    },
    from: (table: keyof typeof testState.tables) =>
      new FakeSupabaseQuery(table),
  }),
}))

vi.mock("@/lib/wiki-ai", () => ({
  answerKnowledgeQuestion: vi.fn(async () => {
    if (testState.answerError) {
      throw testState.answerError
    }

    return testState.answer
  }),
}))

class FakeSupabaseQuery {
  private action: "select" | "insert" | "update" = "select"
  private filters: Array<{ key: string; value: unknown }> = []
  private inFilters: Array<{ key: string; values: unknown[] }> = []
  private payload: unknown

  constructor(private readonly table: keyof typeof testState.tables) {}

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  in(key: string, values: unknown[]) {
    this.inFilters.push({ key, values })
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  insert(payload: unknown) {
    this.action = "insert"
    this.payload = payload
    return this
  }

  update(payload: unknown) {
    this.action = "update"
    this.payload = payload
    return this
  }

  async single() {
    const result = await this.resolve()
    return {
      ...result,
      data: Array.isArray(result.data) ? result.data[0] : result.data,
    }
  }

  async maybeSingle() {
    const result = await this.resolve()
    return {
      ...result,
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
    }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown
          error: null
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.resolve().then(onfulfilled, onrejected)
  }

  private async resolve() {
    if (this.action === "insert") {
      const rows = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ).map((row) => ({
        id: `${this.table}-${testState.nextId++}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(row as Record<string, unknown>),
      }))
      testState.tables[this.table].push(...rows)
      return { data: rows, error: null }
    }

    if (this.action === "update") {
      const rows = this.getFilteredRows()
      rows.forEach((row) => Object.assign(row, this.payload))
      return { data: rows, error: null }
    }

    const rows = this.getFilteredRows()
    return { data: rows, error: null, count: rows.length }
  }

  private getFilteredRows() {
    return testState.tables[this.table].filter((row) => {
      return (
        this.filters.every((filter) => row[filter.key] === filter.value) &&
        this.inFilters.every((filter) =>
          filter.values.includes(row[filter.key])
        )
      )
    })
  }
}

async function readSseEvents(response: Response) {
  const text = await response.text()
  return text
    .trim()
    .split("\n\n")
    .map(
      (line) =>
        JSON.parse(line.replace(/^data: /, "")) as Record<string, unknown>
    )
}

describe("/api/wiki/chat route", () => {
  beforeEach(() => {
    testState.user = null
    testState.nextId = 1
    testState.tables.permissions = [
      {
        id: "permission-beta-1",
        code: "beta.1",
      },
    ]
    testState.tables.user_permissions = [
      {
        id: "user-permission-beta-1",
        user_id: "user-1",
        permission_id: "permission-beta-1",
      },
    ]
    testState.tables.ai_chat_threads = []
    testState.tables.ai_chat_messages = []
    testState.tables.ai_chat_citations = []
    testState.tables.ai_chat_message_flags = []
    testState.answerError = null
  })

  it("rejects unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/wiki/chat/route")

    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("validates message input before creating a thread", async () => {
    testState.user = { id: "user-1", email: "user@canopy.test" }
    const { POST } = await import("@/app/api/wiki/chat/route")

    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({ message: "   " }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Message is required.",
    })
    expect(testState.tables.ai_chat_threads).toHaveLength(0)
  })

  it("creates a thread, persists messages and citations, and streams events", async () => {
    testState.user = { id: "user-1", email: "user@canopy.test" }
    const { POST } = await import("@/app/api/wiki/chat/route")

    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Where is the Wiki?" }),
      })
    )
    const events = await readSseEvents(response)

    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(events[0]).toMatchObject({
      type: "meta",
      threadId: "ai_chat_threads-1",
    })
    expect(events.at(-1)).toMatchObject({
      type: "done",
      threadId: "ai_chat_threads-1",
      citations: [
        {
          title: "Wiki",
          url: "/wiki/canopy-wiki",
          snippet: "Wiki documentation lives here.",
        },
      ],
    })
    expect(testState.tables.ai_chat_threads).toHaveLength(1)
    expect(testState.tables.ai_chat_messages).toHaveLength(2)
    expect(testState.tables.ai_chat_citations).toHaveLength(1)
  })

  it("returns a sanitized runtime configuration error when OpenAI is not configured", async () => {
    testState.user = { id: "user-1", email: "user@canopy.test" }
    testState.answerError = new Error("Missing OPENAI_API_KEY.")
    const { POST } = await import("@/app/api/wiki/chat/route")

    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed today?" }),
      })
    )
    const events = await readSseEvents(response)

    expect(events).toContainEqual({
      type: "token",
      token:
        "Milo is missing its OpenAI configuration in this runtime. Please check the production environment variables and restart/redeploy the app.",
    })
    expect(testState.tables.ai_chat_messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "Milo is missing its OpenAI configuration in this runtime. Please check the production environment variables and restart/redeploy the app.",
      metadata: { error: true },
    })
  })
})
