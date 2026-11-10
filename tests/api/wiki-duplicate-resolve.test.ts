import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  allowed: true,
  staleRpc: false,
  calls: [] as Array<Record<string, unknown>>,
  current: "rev-1",
  targetCurrent: "rev-2",
  targetTitle: "Checklist",
}))
const page = {
  id: "page-1",
  short_id: 1,
  parent_id: null,
  type: "page",
  status: "published",
  title: "Source",
  current_revision_id: "rev-1",
}
const target = {
  id: "page-2",
  short_id: 2,
  parent_id: null,
  type: "page",
  status: "published",
  title: "Checklist",
  current_revision_id: "rev-2",
}
const blocks = [
  {
    id: "one",
    type: "paragraph",
    content: [{ type: "text", text: "Duplicate", styles: {} }],
    children: [],
  },
  {
    id: "two",
    type: "paragraph",
    content: [{ type: "text", text: "Keep me", styles: {} }],
    children: [],
  },
]
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/wiki", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wiki")>()),
  fetchWikiNodes: async () => [
    { ...page, current_revision_id: state.current },
    {
      ...target,
      current_revision_id: state.targetCurrent,
      title: state.targetTitle,
    },
  ],
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { blocks }, error: null }),
          }),
        }),
      }),
    }),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      state.calls.push(args)
      return state.staleRpc
        ? { data: null, error: { message: "stale_revision" } }
        : { data: "new-revision", error: null }
    },
  }),
}))
import { POST } from "@/app/api/wiki/duplicates/resolve/route"
const request = (targetTitle = "Checklist") =>
  new Request("http://localhost/api/wiki/duplicates/resolve", {
    method: "POST",
    body: JSON.stringify({
      nodeId: "page-1",
      revisionId: "rev-1",
      blockId: "one",
      targetId: "page-2",
      targetRevisionId: "rev-2",
      targetTitle,
      targetPath: "/wiki/2",
    }),
  })
beforeEach(() => {
  state.allowed = true
  state.current = "rev-1"
  state.targetCurrent = "rev-2"
  state.targetTitle = "Checklist"
  state.staleRpc = false
  state.calls = []
})
describe("duplicate replacement API", () => {
  it("saves the exact replacement as a reviewed revision with a change note", async () => {
    expect((await POST(request())).status).toBe(200)
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]).toMatchObject({
      p_target_id: "page-1",
      p_base_revision_id: "rev-1",
      p_change_note: "Consolidated duplicate with Checklist",
      p_source_id: null,
      p_plain_text: "See Checklist\n\nKeep me",
    })
    const saved = state.calls[0].p_blocks as typeof blocks
    expect(saved[1]).toEqual(blocks[1])
    expect(saved[0].content[0]).toMatchObject({ type: "link", href: "/wiki/2" })
  })
  it("refuses users without permission without writing", async () => {
    state.allowed = false
    expect((await POST(request())).status).toBe(403)
    expect(state.calls).toEqual([])
    expect(state.current).toBe("rev-1")
  })
  it("rejects a stale base both before and during the atomic save", async () => {
    state.current = "newer"
    expect((await POST(request())).status).toBe(409)
    expect(state.calls).toEqual([])
    state.current = "rev-1"
    state.staleRpc = true
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/page changed/i)
  })
  it("does not remove the passage if the other page changed after the check", async () => {
    state.targetCurrent = "newer-target"
    expect((await POST(request())).status).toBe(409)
    expect(state.calls).toEqual([])
  })
  it("supports long existing page titles", async () => {
    state.targetTitle = "Checklist ".repeat(250).trim()
    expect((await POST(request(state.targetTitle))).status).toBe(200)
    expect(state.calls[0].p_change_note).toBe(
      `Consolidated duplicate with ${state.targetTitle}`
    )
  })
})
