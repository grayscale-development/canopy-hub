import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const revision = {
    id: "revision",
    node_id: "draft",
    plain_text: "Draft instructions",
  }
  const node = {
    id: "draft",
    parent_id: null,
    type: "page",
    slug: "draft",
    title: "Draft SOP",
    status: "draft",
  }
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(async () => ({ error: null })),
    single: vi.fn(async () => ({ data: revision, error: null })),
  }
  const userClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "manager" } } })),
    },
    from: vi.fn(() => query),
  }
  const indexClient = { role: "service-indexer" }
  return {
    node,
    revision,
    userClient,
    indexClient,
    permission: vi.fn(async () => true),
    admin: vi.fn(() => indexClient),
    index: vi.fn(async () => "source"),
    archive: vi.fn(),
  }
})
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mocks.userClient),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.admin,
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: mocks.permission,
}))
vi.mock("@/lib/wiki-ai", () => ({
  indexWikiPage: mocks.index,
  archiveKnowledgeSource: mocks.archive,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/wiki", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wiki")>()),
  fetchWikiNodes: vi.fn(async () => [mocks.node]),
  fetchCurrentRevision: vi.fn(async () => mocks.revision),
}))

import {
  saveWikiPageAction,
  updateWikiNodeStatusAction,
} from "@/app/wiki/actions"

describe("authorized Wiki knowledge writes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permission.mockResolvedValue(true)
  })

  it("indexes a saved draft with a server index client after permission checks", async () => {
    const form = new FormData()
    form.set("node_id", "draft")
    form.set("blocks", "[]")
    expect((await saveWikiPageAction(form)).ok).toBe(true)
    expect(mocks.index).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mocks.indexClient,
        node: mocks.node,
        revision: mocks.revision,
        isPublished: false,
      })
    )
    expect(mocks.archive).not.toHaveBeenCalled()
  })

  it("keeps unpublished status changes indexed behind live read checks", async () => {
    const form = new FormData()
    form.set("node_id", "draft")
    form.set("status", "draft")
    expect((await updateWikiNodeStatusAction(form)).ok).toBe(true)
    expect(mocks.index).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mocks.indexClient,
        isPublished: false,
      })
    )
  })

  it("does not create an index client or write when Wiki permission is denied", async () => {
    mocks.permission.mockResolvedValue(false)
    const form = new FormData()
    form.set("node_id", "draft")
    expect((await saveWikiPageAction(form)).ok).toBe(false)
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.userClient.from).not.toHaveBeenCalled()
    expect(mocks.index).not.toHaveBeenCalled()
  })
})
