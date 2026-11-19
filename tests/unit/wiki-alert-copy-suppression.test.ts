import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/wiki-duplicates", async (original) => ({
  ...(await original<typeof import("@/lib/wiki-duplicates")>()),
  detectWikiDuplicates: vi.fn(),
}))
vi.mock("@/lib/ai/provider", () => ({
  createChatResponseWithOpenAI: vi.fn(),
  getChatModel: () => "fake-chat",
}))

import { detectWikiDuplicates, type DuplicatePage } from "@/lib/wiki-duplicates"
import { scanWikiAlerts } from "@/lib/wiki-alert-scan"

type Alert = {
  id: string
  status: string
  page_id: string
  other_page_id: string
  recommendation: unknown
  page_hash?: string | null
  other_page_hash?: string | null
  dismissed_by?: string | null
  dismissed_at?: string | null
}

const pages: DuplicatePage[] = [
  {
    id: "a",
    title: "Canonical",
    path: "/wiki/1",
    status: "published",
    createdAt: "2025-01-01",
    inboundLinks: 0,
  },
  {
    id: "b",
    title: "Copy",
    path: "/wiki/2",
    status: "draft",
    createdAt: "2025-02-01",
    inboundLinks: 0,
  },
  {
    id: "c",
    title: "Related",
    path: "/wiki/3",
    status: "published",
    createdAt: "2025-03-01",
    inboundLinks: 0,
  },
]
const block = { id: "block", type: "paragraph", content: [], children: [] }

function recommendation(
  kind: "identical" | "overlap",
  target: DuplicatePage,
  canonical: DuplicatePage
) {
  return {
    version: 2,
    kind,
    summary: "Review these pages",
    excerpt: "Shared text",
    targetPageId: target.id,
    baseRevisionId: `rev-${target.id}`,
    canonicalPageId: canonical.id,
    canonicalRevisionId: `rev-${canonical.id}`,
    canonicalTitle: canonical.title,
    canonicalPath: canonical.path,
    blockId: "block",
    changeNote: "Consolidated",
  }
}

function match(page: DuplicatePage, classification: "identical" | "overlap") {
  return {
    pageId: page.id,
    revisionId: `rev-${page.id}`,
    title: page.title,
    path: page.path,
    snippet: "Shared text",
    text: "Shared text",
    score: 1,
    type: "near-exact" as const,
    classification,
    page,
    blockId: "block",
    exact: true,
  }
}

function detected(page: DuplicatePage, matches: ReturnType<typeof match>[]) {
  return {
    revisionId: `rev-${page.id}`,
    page,
    passages: [
      {
        blockId: "block",
        passageHash: "hash",
        text: "Shared text",
        common: false,
        matches,
      },
    ],
  }
}

function fakeClient(
  initial: Alert[],
  scanPages = pages,
  watermark: string | null = null
) {
  const alerts = initial.map((row) => ({ ...row }))
  const updates: { id: string; values: Partial<Alert> }[] = []
  const stateWrites: Record<string, unknown>[] = []
  let failDismiss = false
  const client = {
    from(table: string) {
      let operation = "read"
      let values: Record<string, unknown> = {}
      const filters: ((row: Record<string, unknown>) => boolean)[] = []
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value)
          return query
        },
        in: (key: string, value: unknown[]) => {
          filters.push((row) => value.includes(row[key]))
          return query
        },
        neq: () => query,
        gt: () => query,
        lte: () => query,
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
        execute: () => {
          if (table === "wiki_alert_scan_state") {
            if (operation !== "read") stateWrites.push(values)
            return {
              data:
                operation === "read"
                  ? { last_page_updated_at: watermark }
                  : { singleton: true },
              error: null,
            }
          }
          if (table === "wiki_nodes")
            return {
              data: scanPages.map((page) => ({
                id: page.id,
                title: page.title,
                current_revision_id: `rev-${page.id}`,
              })),
              error: null,
            }
          if (table === "wiki_page_revisions")
            return { data: { blocks: [block] }, error: null }
          if (table === "ai_action_log") return { data: null, error: null }
          if (table === "wiki_alerts") {
            const selected = alerts.filter((row) =>
              filters.every((filter) => filter(row))
            )
            if (operation === "insert") {
              const row = {
                id: `new-${alerts.length}`,
                status: "open",
                ...values,
              } as Alert
              alerts.push(row)
              return { data: row, error: null }
            }
            if (operation === "update") {
              if (failDismiss && values.status === "dismissed")
                return { data: null, error: new Error("dismiss failed") }
              for (const row of selected) {
                updates.push({ id: row.id, values })
                Object.assign(row, values)
              }
              return { data: selected, error: null }
            }
            return { data: selected, error: null }
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === "wiki_nodes")
            return { data: { updated_at: "2026-11-01T00:00:00Z" }, error: null }
          const result = query.execute()
          return {
            ...result,
            data: Array.isArray(result.data)
              ? (result.data[0] ?? null)
              : result.data,
          }
        },
        single: async () => query.execute(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(query.execute()).then(resolve),
      }
      return query
    },
  } as unknown as Parameters<typeof scanWikiAlerts>[0]
  return {
    client,
    alerts,
    updates,
    stateWrites,
    failDismiss: () => {
      failDismiss = true
    },
  }
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "")
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllEnvs())

describe("copy overlap suppression", () => {
  it("discovers identical pairs first, dismisses old overlaps on either side and keeps other overlaps", async () => {
    // The overlap is encountered before the identical pair in page order.
    vi.mocked(detectWikiDuplicates).mockImplementation(
      async (_client, _user, id) =>
        id === "a"
          ? detected(pages[0], [match(pages[2], "overlap")])
          : id === "b"
            ? detected(pages[1], [match(pages[0], "identical")])
            : detected(pages[2], [match(pages[1], "overlap")])
    )
    const db = fakeClient([
      {
        id: "redundant",
        status: "open",
        page_id: "c",
        other_page_id: "b",
        recommendation: recommendation("overlap", pages[2], pages[1]),
      },
      {
        id: "useful",
        status: "open",
        page_id: "a",
        other_page_id: "c",
        recommendation: recommendation("overlap", pages[0], pages[2]),
      },
    ])
    const result = await scanWikiAlerts(db.client, { full: true })
    expect(result).toMatchObject({ opened: 1, updated: 1 })
    const identical = db.alerts.find((row) => row.id.startsWith("new-"))!
    expect(identical.recommendation).toMatchObject({
      kind: "identical",
      targetPageId: "b",
    })
    expect(db.alerts.find((row) => row.id === "redundant")).toMatchObject({
      status: "dismissed",
      dismissed_by: null,
      dismissed_at: expect.any(String),
    })
    expect(db.updates.filter((update) => update.id === "redundant")).toEqual([
      {
        id: "redundant",
        values: {
          status: "dismissed",
          dismissed_by: null,
          dismissed_at: expect.any(String),
        },
      },
    ])
    expect(db.alerts.find((row) => row.id === "useful")?.status).toBe("open")

    // A manager can dismiss the identical alert; unchanged overlaps can return.
    identical.status = "dismissed"
    identical.dismissed_by = "manager"
    identical.dismissed_at = "2026-11-01T00:00:00Z"
    await scanWikiAlerts(db.client, { full: true })
    expect(
      db.alerts.filter(
        (row) =>
          row.status === "open" &&
          [row.page_id, row.other_page_id].includes("b")
      )
    ).toHaveLength(1)
  })

  it("protects a copy from a previously open identical alert during an incremental scan", async () => {
    vi.mocked(detectWikiDuplicates).mockResolvedValue(
      detected(pages[2], [match(pages[1], "overlap")])
    )
    const db = fakeClient(
      [
        {
          id: "identical",
          status: "open",
          page_id: "a",
          other_page_id: "b",
          recommendation: recommendation("identical", pages[1], pages[0]),
        },
      ],
      [pages[2]]
    )
    expect(await scanWikiAlerts(db.client)).toMatchObject({
      opened: 0,
      updated: 0,
    })
    expect(db.alerts).toHaveLength(1)
  })

  it("reclassifies an edited identical pair before suppressing overlaps", async () => {
    vi.mocked(detectWikiDuplicates).mockResolvedValue(
      detected(pages[2], [match(pages[1], "overlap")])
    )
    const db = fakeClient(
      [
        {
          id: "changed",
          status: "open",
          page_id: "b",
          other_page_id: "c",
          recommendation: recommendation("identical", pages[1], pages[2]),
        },
        {
          id: "other",
          status: "open",
          page_id: "a",
          other_page_id: "b",
          recommendation: recommendation("overlap", pages[1], pages[0]),
        },
      ],
      [pages[2]]
    )
    expect(await scanWikiAlerts(db.client)).toMatchObject({
      opened: 0,
      updated: 1,
    })
    expect(db.alerts[0]).toMatchObject({
      status: "open",
      recommendation: { kind: "overlap" },
    })
    expect(db.alerts[1].status).toBe("open")
  })

  it("does not write overlaps or advance the watermark when cleanup fails", async () => {
    vi.mocked(detectWikiDuplicates).mockResolvedValue(
      detected(pages[2], [match(pages[0], "overlap")])
    )
    const db = fakeClient(
      [
        {
          id: "identical",
          status: "open",
          page_id: "a",
          other_page_id: "b",
          recommendation: recommendation("identical", pages[1], pages[0]),
        },
        {
          id: "redundant",
          status: "open",
          page_id: "b",
          other_page_id: "c",
          recommendation: recommendation("overlap", pages[1], pages[2]),
        },
      ],
      [pages[2]]
    )
    db.failDismiss()
    expect(await scanWikiAlerts(db.client)).toMatchObject({
      partial: true,
      written: 0,
    })
    expect(db.stateWrites).toEqual([{ last_page_updated_at: null }])
    expect(db.alerts).toHaveLength(2)
  })

  it("cleans up existing redundant overlaps even on an unchanged scan", async () => {
    const db = fakeClient(
      [
        {
          id: "identical",
          status: "open",
          page_id: "a",
          other_page_id: "b",
          recommendation: recommendation("identical", pages[1], pages[0]),
        },
        {
          id: "redundant",
          status: "open",
          page_id: "b",
          other_page_id: "c",
          recommendation: recommendation("overlap", pages[1], pages[2]),
        },
      ],
      [],
      "2026-11-01T00:00:00Z"
    )
    expect(await scanWikiAlerts(db.client)).toMatchObject({
      skipped: true,
      reason: "unchanged",
    })
    expect(db.alerts[1]).toMatchObject({
      status: "dismissed",
      dismissed_by: null,
    })
    expect(detectWikiDuplicates).not.toHaveBeenCalled()
    await scanWikiAlerts(db.client)
    expect(db.updates).toHaveLength(1)
  })
})
