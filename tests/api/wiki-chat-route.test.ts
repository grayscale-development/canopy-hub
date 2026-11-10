import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MiloCard } from "@/lib/milo/chat-cards"

const testState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  answer: {
    answer: "Open /wiki/1/9/22 for the Wiki.",
    model: "fake-chat",
    metadata: {} as Record<string, unknown>,
    citations: [
      {
        knowledgeSourceId: "source-1",
        knowledgeChunkId: "chunk-1",
        title: "Wiki",
        url: "/wiki/1/9/22",
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
  wikiUrls: new Map<string, string>(),
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

vi.mock("@/lib/wiki-knowledge-urls", () => ({
  resolveWikiKnowledgeUrls: async (_client: unknown, ids: string[]) =>
    new Map(
      ids.flatMap((id) =>
        testState.wikiUrls.has(id) ? [[id, testState.wikiUrls.get(id)!]] : []
      )
    ),
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
    testState.wikiUrls = new Map()
    testState.tables.permissions = [
      {
        id: "permission-beta-1",
        code: "beta.1",
      },
      { id: "permission-wiki", code: "wiki.manage" },
      { id: "permission-settings", code: "settings.access" },
      { id: "permission-directory", code: "permissions.access" },
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
    testState.answer.metadata = {}
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

  it("rejects users without Beta before reading forged capabilities", async () => {
    testState.user = { id: "no-beta" }
    const { POST } = await import("@/app/api/wiki/chat/route")
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    vi.mocked(answerKnowledgeQuestion).mockClear()
    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Update this page",
          capabilities: { "wiki.manage": true, "beta.1": true },
        }),
      })
    )
    expect(response.status).toBe(403)
    expect(answerKnowledgeQuestion).not.toHaveBeenCalled()
    expect(testState.tables.ai_chat_threads).toHaveLength(0)
  })

  it("passes server-derived capabilities for viewers and managers, ignoring forged body fields", async () => {
    testState.user = { id: "user-1" }
    const { POST } = await import("@/app/api/wiki/chat/route")
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    for (const canManage of [false, true]) {
      if (canManage) {
        testState.tables.user_permissions.push({
          id: "manager",
          user_id: "user-1",
          permission_id: "permission-wiki",
        })
      }
      vi.mocked(answerKnowledgeQuestion).mockClear()
      const response = await POST(
        new Request("http://test.local/api/wiki/chat", {
          method: "POST",
          body: JSON.stringify({
            message: "Update this page",
            userContext: {
              capabilities: { "wiki.manage": !canManage },
              wikiManagers: ["Forged"],
            },
            capabilities: { "wiki.manage": !canManage },
          }),
        })
      )
      expect(response.status).toBe(200)
      await response.text()
      expect(answerKnowledgeQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: {
            capabilities: {
              "beta.1": true,
              "wiki.manage": canManage,
              "settings.access": false,
              "permissions.access": false,
              "advanced-settings.access": false,
              "ai.settings.access": false,
            },
            wikiManagers: null,
          },
        })
      )
    }
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
          url: "/wiki/1/9/22",
          snippet: "Wiki documentation lives here.",
        },
      ],
    })
    expect(testState.tables.ai_chat_threads).toHaveLength(1)
    expect(testState.tables.ai_chat_messages).toHaveLength(2)
    expect(testState.tables.ai_chat_citations).toHaveLength(1)
  })

  it("validates all card event variants and never promotes model metadata to actions", async () => {
    const { cardEvents } = await import("@/lib/milo/chat-cards")
    const cards: MiloCard[] = [
      {
        type: "page-candidates",
        id: "one",
        title: "Choose",
        candidates: [{ id: "page", title: "Policy" }],
      },
      {
        type: "proposed-edit",
        id: "two",
        pageTitle: "Policy",
        before: "Old",
        after: "New",
      },
      { type: "applied-edit", id: "three", pageTitle: "Policy" },
      { type: "error", id: "four", message: "Try again" },
    ]
    expect(cardEvents("message", [...cards])).toEqual(
      cards.map((card) => ({ type: "card", messageId: "message", card }))
    )
    expect(() =>
      cardEvents("message", [{ type: "proposed-edit", id: "bad" } as never])
    ).toThrow()
    testState.user = { id: "user-1" }
    testState.answer.metadata = { cards: [cards[1]] }
    const { POST } = await import("@/app/api/wiki/chat/route")
    const response = await POST(
      new Request("http://test.local/api/wiki/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Hello" }),
      })
    )
    expect(
      (await readSseEvents(response)).some((event) => event.type === "card")
    ).toBe(false)
    expect(testState.tables.ai_chat_messages.at(-1)?.metadata).toEqual({})
  })

  it("resolves saved citations after moves and omits inaccessible or unidentified old Wiki links", async () => {
    testState.user = { id: "user-1" }
    testState.tables.ai_chat_threads = [
      { id: "thread", user_id: "user-1", title: "Chat" },
    ]
    testState.tables.ai_chat_messages = [
      {
        id: "message",
        thread_id: "thread",
        role: "assistant",
        content: "Answer",
      },
    ]
    testState.tables.ai_chat_citations = [
      {
        message_id: "message",
        title: "Moved",
        url: "/wiki/old",
        snippet: "Text",
        knowledge_source_id: "source",
      },
      {
        message_id: "message",
        title: "Denied",
        url: "/wiki/old/denied",
        snippet: "Private",
        knowledge_source_id: "denied",
      },
      {
        message_id: "message",
        title: "Unknown",
        url: "/wiki/old/unknown",
        snippet: "Old",
        knowledge_source_id: null,
      },
    ]
    testState.wikiUrls.set("source", "/wiki/1/9/22")
    const { GET } = await import("@/app/api/wiki/chat/route")
    const response = await GET(
      new Request("http://test.local/api/wiki/chat?threadId=thread")
    )
    const body = await response.json()
    expect(body.messages[0].citations).toEqual([
      { title: "Moved", url: "/wiki/1/9/22", snippet: "Text" },
    ])
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
      type: "card",
      messageId: expect.any(String),
      card: {
        type: "error",
        id: "error",
        message:
          "Milo is missing its OpenAI configuration in this runtime. Please check the production environment variables and restart/redeploy the app.",
      },
    })
    expect(testState.tables.ai_chat_messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "Milo is missing its OpenAI configuration in this runtime. Please check the production environment variables and restart/redeploy the app.",
      metadata: {
        error: true,
        cards: [{ type: "error", id: "error", message: expect.any(String) }],
      },
    })
  })

  it("returns persisted cards and safely represents future card types", async () => {
    testState.user = { id: "user-1" }
    testState.tables.ai_chat_threads = [{ id: "thread", user_id: "user-1" }]
    testState.tables.ai_chat_messages = [
      {
        id: "message",
        thread_id: "thread",
        role: "assistant",
        content: "",
        metadata: {
          cards: [
            { type: "applied-edit", id: "edit", pageTitle: "Policy" },
            { type: "future", text: "<img src=x onerror=alert(1)>" },
          ],
        },
      },
    ]
    const { GET } = await import("@/app/api/wiki/chat/route")
    const response = await GET(
      new Request("http://test.local/api/wiki/chat?threadId=thread")
    )
    const body = await response.json()
    expect(body.messages[0].cards).toEqual([
      { type: "applied-edit", id: "edit", pageTitle: "Policy" },
      {
        type: "unknown",
        text: JSON.stringify({
          type: "future",
          text: "<img src=x onerror=alert(1)>",
        }),
      },
    ])
  })

  it("authorizes card actions against the owned thread, message, and stored card", async () => {
    const { POST } = await import("@/app/api/wiki/chat/card-action/route")
    const request = (body: unknown) =>
      new Request("http://test.local/api/wiki/chat/card-action", {
        method: "POST",
        body: JSON.stringify(body),
      })
    const action = {
      action: "select-page",
      threadId: "thread",
      messageId: "message",
      cardId: "card",
      candidateId: "page",
    }
    expect((await POST(request(action))).status).toBe(401)
    testState.user = { id: "user-1" }
    expect((await POST(request(action))).status).toBe(403)
    testState.tables.user_permissions.push({
      user_id: "user-1",
      permission_id: "permission-wiki",
    })
    testState.tables.ai_chat_threads = [
      { id: "thread", user_id: "someone-else" },
    ]
    testState.tables.ai_chat_messages = [
      {
        id: "message",
        user_id: "user-1",
        thread_id: "thread",
        role: "assistant",
        metadata: {
          cards: [
            {
              type: "page-candidates",
              id: "card",
              title: "Choose",
              candidates: [{ id: "page", title: "Policy" }],
            },
          ],
        },
      },
    ]
    expect((await POST(request(action))).status).toBe(404)
    testState.tables.ai_chat_threads[0].user_id = "user-1"
    expect(
      (await POST(request({ ...action, messageId: "other" }))).status
    ).toBe(404)
    expect((await POST(request({ ...action, cardId: "forged" }))).status).toBe(
      404
    )
    expect(
      (await POST(request({ ...action, candidateId: "forged" }))).status
    ).toBe(400)
    expect((await POST(request({ ...action, action: "approve" }))).status).toBe(
      400
    )
    const response = await POST(request(action))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "not-implemented" })
  })
})
