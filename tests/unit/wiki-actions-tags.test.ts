import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ rpc: vi.fn(), updates: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(async () => true),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "page", type: "page" },
            error: null,
          }),
        }),
      }),
      update: state.updates,
    }),
    rpc: state.rpc,
  }),
}))
vi.mock("@/lib/wiki-ai", () => ({
  archiveKnowledgeSource: vi.fn(),
  indexWikiAsset: vi.fn(),
  indexWikiPage: vi.fn(),
}))

import { updateWikiNodeTagsAction } from "@/app/wiki/actions"

describe("wiki tag action validation", () => {
  beforeEach(() => {
    state.rpc.mockReset()
    state.updates.mockReset()
  })
  it("returns a friendly scope error without separately changing the legacy array", async () => {
    state.rpc.mockResolvedValue({ error: { message: "wiki_tag_out_of_scope" } })
    const form = new FormData()
    form.set("node_id", "page")
    form.set(
      "tags_scoped",
      JSON.stringify([
        {
          name: "Closing",
          scope: "section",
          section_id: "10000000-0000-4000-8000-000000000001",
        },
      ])
    )
    expect(await updateWikiNodeTagsAction(form)).toEqual({
      ok: false,
      message:
        "This tag belongs to a different section and cannot be added to this page.",
    })
    expect(state.updates).not.toHaveBeenCalled()
  })
  it("returns a friendly message for invalid scoped input", async () => {
    const form = new FormData()
    form.set("node_id", "page")
    form.set("tags_scoped", "not json")
    expect(await updateWikiNodeTagsAction(form)).toEqual({
      ok: false,
      message: "Choose a valid tag and section.",
    })
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it("returns a friendly message for a name conflict", async () => {
    state.rpc.mockResolvedValue({
      error: { message: "wiki_tag_name_conflict" },
    })
    const form = new FormData()
    form.set("node_id", "page")
    form.set(
      "tags_scoped",
      JSON.stringify([{ name: "Closing", scope: "global", section_id: null }])
    )
    expect(await updateWikiNodeTagsAction(form)).toEqual({
      ok: false,
      message:
        "A tag with this name already exists. Choose another name.",
    })
  })
})
