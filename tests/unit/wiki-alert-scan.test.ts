import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/wiki-duplicates", () => ({ detectWikiDuplicates: vi.fn() }))
vi.mock("@/lib/ai/provider", () => ({
  createChatResponseWithOpenAI: vi.fn(),
  getChatModel: () => "fake-chat",
}))
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import { createChatResponseWithOpenAI } from "@/lib/ai/provider"
import {
  alertPageHash,
  closedPairUnchanged,
  scanWikiAlerts,
} from "@/lib/wiki-alert-scan"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("OPENAI_API_KEY", "")
})
afterEach(() => vi.unstubAllEnvs())

function scanClient(
  options: {
    watermark?: string | null
    failAlert?: string
    failState?: boolean
  } = {}
) {
  const state =
    options.watermark === undefined
      ? null
      : { last_page_updated_at: options.watermark }
  const stateWrites: Record<string, unknown>[] = []
  const alerts: Record<string, unknown>[] = []
  const pages = [
    { id: "a", title: "Target", current_revision_id: "rev-a" },
    { id: "b", title: "Second", current_revision_id: "rev-b" },
  ]
  const client = {
    from: (table: string) => {
      let operation = "read"
      let values: Record<string, unknown> = {}
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        lte: () => query,
        in: () => query,
        order: () => query,
        range: () => query,
        limit: () => query,
        update: (value: Record<string, unknown>) => {
          operation = "update"
          values = value
          return query
        },
        insert: (value: Record<string, unknown>) => {
          operation = "insert"
          values = value
          return query
        },
        maybeSingle: async () => {
          if (table === "wiki_alert_scan_state" && operation !== "read") {
            stateWrites.push(values)
            if (options.failState)
              return { data: null, error: new Error("private database detail") }
            return { data: { singleton: true }, error: null }
          }
          return {
            data:
              table === "wiki_alert_scan_state"
                ? state
                : table === "wiki_nodes"
                  ? { updated_at: "2026-11-02T00:00:00Z" }
                  : {
                      blocks: [
                        {
                          id: "block",
                          type: "paragraph",
                          content: [],
                          children: [],
                        },
                      ],
                    },
            error: null,
          }
        },
        single: async () => {
          if (table === "wiki_alerts") {
            if (values.other_page_id === options.failAlert)
              return { data: null, error: new Error("write failed") }
            alerts.push(values)
            return { data: { id: "alert" }, error: null }
          }
          return { data: null, error: null }
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === "wiki_alert_scan_state" && operation !== "read")
            stateWrites.push(values)
          return Promise.resolve({
            data: table === "wiki_nodes" ? pages : [],
            error: null,
          }).then(resolve)
        },
      }
      return query
    },
  } as unknown as Parameters<typeof scanWikiAlerts>[0]
  return { client, stateWrites, alerts }
}

function duplicate(revisionId: string, matches = ["c"]) {
  return {
    revisionId,
    passages: [
      {
        blockId: "block",
        passageHash: "hash",
        text: "A source passage for the recommendation.",
        common: false,
        matches: matches.map((pageId) => ({
          pageId,
          revisionId: `rev-${pageId}`,
          title: `Canonical ${pageId}`,
          path: "/wiki/2",
          snippet: "short match",
          text: "A matching canonical passage.",
          score: 1,
          type: "near-exact" as const,
        })),
      },
    ],
  }
}

describe("alerts scan", () => {
  it("continues after a page detection error and retains the previous watermark for retry", async () => {
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) => {
        if (id === "a") throw new Error("Page is too large to check at once.")
        return duplicate("rev-b")
      }
    )
    const { client, alerts, stateWrites } = scanClient({
      watermark: "2026-11-01T00:00:00Z",
    })
    const result = await scanWikiAlerts(client)
    expect(result).toMatchObject({
      skipped: false,
      written: 1,
      skippedCount: 1,
    })
    expect(alerts).toHaveLength(1)
    expect(stateWrites).toEqual([
      {
        last_success_at: expect.any(String),
        last_page_updated_at: "2026-11-01T00:00:00Z",
      },
    ])
  })

  it("advances past an ineligible page while scanning other pages", async () => {
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) => (id === "a" ? null : duplicate("rev-b"))
    )
    const { client, alerts, stateWrites } = scanClient({
      watermark: "2026-11-01T00:00:00Z",
    })
    expect(await scanWikiAlerts(client)).toMatchObject({
      written: 1,
      skippedCount: 1,
    })
    expect(alerts).toHaveLength(1)
    expect(stateWrites[0].last_page_updated_at).toBe("2026-11-02T00:00:00Z")
  })

  it("returns the work done if the state write fails without logging database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a" ? duplicate("rev-a") : duplicate("rev-b", [])
    )
    const { client, alerts } = scanClient({ failState: true })
    expect(await scanWikiAlerts(client)).toMatchObject({
      written: 1,
      stateSaved: false,
    })
    expect(alerts).toHaveLength(1)
    expect(log).toHaveBeenCalledWith(
      "Wiki alerts scan state could not be saved"
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private database detail"
    )
  })

  it("continues after a pair write fails and does not advance the watermark", async () => {
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a" ? duplicate("rev-a", ["c", "d"]) : duplicate("rev-b", [])
    )
    const { client, alerts, stateWrites } = scanClient({
      watermark: "2026-11-01T00:00:00Z",
      failAlert: "c",
    })
    const result = await scanWikiAlerts(client)
    expect(result).toMatchObject({ written: 1, skippedCount: 1 })
    expect(alerts[0].other_page_id).toBe("d")
    expect(stateWrites[0].last_page_updated_at).toBe("2026-11-01T00:00:00Z")
  })

  it("inserts the first watermark and uses model text without changing the edit", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-test-key")
    vi.stubEnv("OPENAI_CHAT_MODEL", "fake-chat")
    vi.mocked(createChatResponseWithOpenAI).mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: "Link to the canonical page.",
        changeNote: "Removed duplicated guidance.",
      }),
    } as Awaited<ReturnType<typeof createChatResponseWithOpenAI>>)
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a" ? duplicate("rev-a") : duplicate("rev-b", [])
    )
    const { client, alerts, stateWrites } = scanClient()
    await scanWikiAlerts(client)
    expect(stateWrites).toEqual([
      {
        singleton: true,
        last_success_at: expect.any(String),
        last_page_updated_at: "2026-11-02T00:00:00Z",
      },
    ])
    expect(alerts[0].recommendation).toMatchObject({
      summary: "Link to the canonical page.",
      changeNote: "Removed duplicated guidance.",
      blockId: "block",
      baseRevisionId: "rev-a",
      canonicalPath: "/wiki/2",
    })
    expect(createChatResponseWithOpenAI).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(createChatResponseWithOpenAI).mock.calls[0][0].input
    ).toContain("A matching canonical passage.")
  })

  it("writes the deterministic recommendation if the model fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-test-key")
    vi.stubEnv("OPENAI_CHAT_MODEL", "fake-chat")
    vi.mocked(createChatResponseWithOpenAI).mockRejectedValueOnce(
      new Error("unavailable")
    )
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a" ? duplicate("rev-a") : duplicate("rev-b", [])
    )
    const { client, alerts } = scanClient()
    const result = await scanWikiAlerts(client)
    expect(result).toMatchObject({ written: 1, skippedCount: 1 })
    expect(alerts[0].recommendation).toMatchObject({
      summary:
        "Replace the duplicated passage on Target with a link to Canonical c.",
      changeNote: "Consolidated duplicate with Canonical c",
      blockId: "block",
    })
  })
  it("skips unchanged pages without detecting or writing alerts, but records success", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-test-key")
    vi.stubEnv("OPENAI_CHAT_MODEL", "fake-chat")
    const writes: unknown[] = []
    const chain = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "wiki_alert_scan_state"
              ? { last_page_updated_at: "2026-11-01T00:00:00Z" }
              : { updated_at: "2026-11-01T00:00:00Z" },
          error: null,
        }),
        update: (value: unknown) => {
          writes.push(value)
          return query
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      }
      return query
    }
    const client = { from: vi.fn(chain) } as unknown as Parameters<
      typeof scanWikiAlerts
    >[0]
    expect(await scanWikiAlerts(client)).toEqual({
      skipped: true,
      reason: "unchanged",
    })
    expect(detectWikiDuplicates).not.toHaveBeenCalled()
    expect(createChatResponseWithOpenAI).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalledWith("wiki_alerts")
    expect(writes).toEqual([{ last_success_at: expect.any(String) }])
  })
  it("keeps dismissed or applied pairs closed until either revision changes, in either order", () => {
    const a = alertPageHash("revision-a"),
      b = alertPageHash("revision-b")
    const rows = [
      { status: "dismissed", page_id: "a", page_hash: a, other_page_hash: b },
    ]
    expect(closedPairUnchanged(rows, "a", a, b)).toBe(true)
    expect(closedPairUnchanged(rows, "b", b, a)).toBe(true)
    expect(closedPairUnchanged(rows, "a", alertPageHash("changed"), b)).toBe(
      false
    )
    expect(
      closedPairUnchanged([{ ...rows[0], status: "applied" }], "a", a, b)
    ).toBe(true)
  })
  it("writes an applicable alert, leaves a dismissed pair closed, then reopens after a revision changes", async () => {
    type Row = {
      id: string
      status: string
      page_id: string
      other_page_id: string
      page_hash: string
      other_page_hash: string
      recommendation: unknown
    }
    const rows: Row[] = []
    let revisionId = "rev-a"
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a"
          ? {
              revisionId,
              passages: [
                {
                  blockId: "block",
                  passageHash: "passage",
                  text: "duplicate",
                  common: false,
                  matches: [
                    {
                      pageId: "b",
                      revisionId: "rev-b",
                      title: "Canonical",
                      path: "/wiki/2",
                      snippet: "duplicate",
                      text: "duplicate",
                      score: 1,
                      type: "near-exact",
                    },
                  ],
                },
              ],
            }
          : null
    )
    const client = {
      from: (table: string) => {
        let operation = "read"
        let values: Partial<Row> = {}
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          order: () => query,
          range: () => query,
          limit: () => query,
          lte: () => query,
          update: (value: Partial<Row>) => {
            operation = "update"
            values = value
            return query
          },
          insert: (value: Partial<Row>) => {
            operation = "insert"
            values = value
            return query
          },
          upsert: async () => ({ error: null }),
          maybeSingle: async () =>
            table === "wiki_alert_scan_state"
              ? { data: { last_page_updated_at: null }, error: null }
              : table === "wiki_nodes"
                ? { data: { updated_at: "2026-11-01T00:00:00Z" }, error: null }
                : table === "wiki_page_revisions"
                  ? {
                      data: {
                        blocks: [
                          {
                            id: "block",
                            type: "paragraph",
                            content: [],
                            children: [],
                          },
                        ],
                      },
                      error: null,
                    }
                  : { data: null, error: null },
          single: async () => {
            if (operation === "insert")
              rows.push({
                id: `alert-${rows.length}`,
                status: "open",
                ...values,
              } as Row)
            return { data: { id: rows.at(-1)?.id }, error: null }
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === "wiki_nodes"
                  ? [
                      {
                        id: "a",
                        title: "Target",
                        current_revision_id: revisionId,
                      },
                    ]
                  : table === "wiki_alerts"
                    ? rows
                    : [],
              error: null,
            }).then(resolve),
        }
        return query
      },
    } as unknown as Parameters<typeof scanWikiAlerts>[0]
    await scanWikiAlerts(client)
    expect(rows).toHaveLength(1)
    expect(rows[0].recommendation).toMatchObject({
      version: 1,
      targetPageId: "a",
      baseRevisionId: "rev-a",
      blockId: "block",
      canonicalPath: "/wiki/2",
    })
    rows[0].status = "dismissed"
    await scanWikiAlerts(client)
    expect(rows).toHaveLength(1)
    revisionId = "rev-a-changed"
    await scanWikiAlerts(client)
    expect(rows).toHaveLength(2)
    expect(rows[1].recommendation).toMatchObject({
      baseRevisionId: "rev-a-changed",
    })
  })
})
