import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/wiki-duplicates", () => ({ detectWikiDuplicates: vi.fn() }))
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import {
  alertPageHash,
  closedPairUnchanged,
  scanWikiAlerts,
} from "@/lib/wiki-alert-scan"

describe("alerts scan", () => {
  it("skips unchanged pages without detecting or writing alerts, but records success", async () => {
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
        upsert: async (value: unknown) => {
          writes.push(value)
          return { error: null }
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
    expect(client.from).not.toHaveBeenCalledWith("wiki_alerts")
    expect(writes).toEqual([
      { singleton: true, last_success_at: expect.any(String) },
    ])
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
