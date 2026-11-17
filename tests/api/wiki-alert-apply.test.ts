import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  allowed: true,
  current: "rev-1",
  status: "open",
  recommendation: null as unknown,
  blocks: [] as unknown[],
  calls: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}))
const recommendation = {
  version: 1,
  summary: "Replace duplicate",
  targetPageId: "a",
  baseRevisionId: "rev-1",
  canonicalPageId: "b",
  canonicalTitle: "Canonical",
  canonicalPath: "/wiki/2",
  blockId: "block-1",
  changeNote: "Consolidated duplicate",
}
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/wiki", async (original) => ({
  ...(await original<typeof import("@/lib/wiki")>()),
  fetchWikiNodes: async () => [
    {
      id: "a",
      short_id: 1,
      parent_id: null,
      type: "page",
      status: "published",
      title: "Target",
      current_revision_id: state.current,
    },
    {
      id: "b",
      short_id: 2,
      parent_id: null,
      type: "page",
      status: "published",
      title: "Canonical",
      current_revision_id: "rev-2",
    },
  ],
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        update: (values: Record<string, unknown>) => {
          state.updates.push(values)
          return query
        },
        maybeSingle: async () => ({
          data:
            table === "wiki_page_revisions"
              ? { blocks: state.blocks }
              : state.updates.length
                ? { id: "alert" }
                : {
                    id: "alert",
                    status: state.status,
                    page_id: "a",
                    other_page_id: "b",
                    recommendation: state.recommendation,
                  },
          error: null,
        }),
      }
      return query
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      state.calls.push(args)
      return { data: "new-revision", error: null }
    },
  }),
}))
import { POST } from "@/app/api/wiki/alerts/apply/route"
const request = () =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ id: "alert" }),
  })
beforeEach(() => {
  state.allowed = true
  state.current = "rev-1"
  state.status = "open"
  state.recommendation = { ...recommendation }
  state.blocks = [
    {
      id: "block-1",
      type: "paragraph",
      content: [{ type: "text", text: "Duplicate", styles: {} }],
      children: [],
    },
  ]
  state.calls = []
  state.updates = []
})
describe("apply alert", () => {
  it("creates a reviewed link revision without archiving the canonical page and marks the alert applied", async () => {
    expect((await POST(request())).status).toBe(200)
    expect(state.calls[0]).toMatchObject({
      p_target_id: "a",
      p_base_revision_id: "rev-1",
      p_source_id: null,
      p_change_note: "Consolidated duplicate",
      p_plain_text: "See Canonical",
    })
    expect(state.updates[0]).toMatchObject({
      status: "applied",
      applied_by: "manager",
    })
  })
  it("rejects a stale page", async () => {
    state.current = "newer"
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/page changed/i)
    expect(state.calls).toEqual([])
  })
  it("rejects invalid or closed alerts and nonexistent blocks", async () => {
    state.recommendation = null
    expect((await POST(request())).status).toBe(400)
    state.recommendation = { ...recommendation, blockId: "missing" }
    expect((await POST(request())).status).toBe(400)
    state.recommendation = recommendation
    state.status = "dismissed"
    expect((await POST(request())).status).toBe(400)
    expect(state.calls).toEqual([])
  })
  it("refuses non-managers", async () => {
    state.allowed = false
    expect((await POST(request())).status).toBe(403)
    expect(state.calls).toEqual([])
  })
})
