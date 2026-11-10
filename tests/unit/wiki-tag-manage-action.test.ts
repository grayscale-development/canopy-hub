import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  permission: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: state.permission,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) },
    rpc: state.rpc,
  }),
}))

import { manageWikiTagAction } from "@/app/wiki/tags/manage/actions"

describe("manage tag action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permission.mockResolvedValue(true)
  })
  it("checks authorization and sends the confirmed preview to the database", async () => {
    state.rpc.mockResolvedValue({ error: null })
    expect(
      await manageWikiTagAction({
        action: "merge",
        sourceId: "a",
        targetId: "b",
        expectedNodeIds: ["p"],
      })
    ).toEqual({ ok: true, message: "Tag updated." })
    expect(state.rpc).toHaveBeenCalledWith(
      "manage_wiki_tag",
      expect.objectContaining({
        p_source_id: "a",
        p_target_id: "b",
        p_expected_node_ids: ["p"],
      })
    )
    expect(state.revalidate).toHaveBeenCalledWith("/wiki", "layout")
  })
  it("rejects viewers and translates database conflicts", async () => {
    state.permission.mockResolvedValue(false)
    expect(
      (await manageWikiTagAction({ action: "delete", deleteIds: ["a"] })).ok
    ).toBe(false)
    expect(state.rpc).not.toHaveBeenCalled()
    state.permission.mockResolvedValue(true)
    state.rpc.mockResolvedValue({
      error: { message: "wiki_tag_name_conflict" },
    })
    expect(
      (
        await manageWikiTagAction({
          action: "rename",
          sourceId: "a",
          name: "Name",
        })
      ).message
    ).toMatch(/already exists/)
  })
})
