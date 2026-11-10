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
    operation: null as "insert" | "update" | null,
    savedRevisionId: "revision",
    updatedStatus: "published",
    insert: vi.fn(() => {
      query.operation = "insert"
      return query
    }),
    select: vi.fn(() => query),
    update: vi.fn((value: { status?: string }) => {
      query.updatedStatus = value.status ?? "published"
      query.operation = "update"
      return query
    }),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({
      data:
        query.operation === "update"
          ? { current_revision_id: query.savedRevisionId }
          : revision,
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data:
        query.operation === "update"
          ? { status: query.updatedStatus }
          : { type: "page" },
      error: null,
    })),
    then: (resolve: (value: { error: null }) => unknown) =>
      resolve({ error: null }),
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
    query,
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
  fetchArchivedWikiNodes: vi.fn(async () => [
    { ...mocks.node, status: "archived", current_revision_id: "revision" },
  ]),
  fetchCurrentRevision: vi.fn(async () => mocks.revision),
}))

import {
  saveWikiPageAction,
  restoreArchivedWikiNodeAction,
  updateWikiNodeStatusAction,
} from "@/app/wiki/actions"

describe("authorized Wiki knowledge writes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permission.mockResolvedValue(true)
    mocks.query.operation = null
    mocks.query.savedRevisionId = mocks.revision.id
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

  it("restores a revised archived page and synchronizes its knowledge source", async () => {
    const form = new FormData()
    form.set("id", "draft")
    expect((await restoreArchivedWikiNodeAction(form)).ok).toBe(true)
    expect(mocks.query.update).toHaveBeenCalledWith({
      status: "published",
      updated_by: "manager",
    })
    expect(mocks.index).toHaveBeenCalledWith(
      expect.objectContaining({ node: mocks.node, revision: mocks.revision })
    )
  })

  it("denies restore before querying when the user cannot manage the Wiki", async () => {
    mocks.permission.mockResolvedValue(false)
    const form = new FormData()
    form.set("id", "draft")
    expect((await restoreArchivedWikiNodeAction(form)).ok).toBe(false)
    expect(mocks.userClient.from).not.toHaveBeenCalled()
    expect(mocks.index).not.toHaveBeenCalled()
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

  it("persists repeated short saves as the current revision", async () => {
    for (const text of ["First short update", "Second short update"]) {
      const form = new FormData()
      form.set("node_id", "draft")
      form.set("blocks", JSON.stringify([{ type: "paragraph", content: text }]))
      expect((await saveWikiPageAction(form)).ok).toBe(true)
    }

    expect(mocks.query.insert).toHaveBeenCalledTimes(2)
    expect(mocks.query.update).toHaveBeenCalledTimes(2)
    expect(mocks.query.select).toHaveBeenCalledWith("current_revision_id")
  })

  it("accepts a complete document above the former 1MB action limit", async () => {
    const blocks = JSON.stringify([
      { type: "paragraph", content: "x".repeat(1024 * 1024 + 1) },
    ])
    expect(new TextEncoder().encode(blocks).byteLength).toBeGreaterThan(
      1024 * 1024
    )

    const form = new FormData()
    form.set("node_id", "draft")
    form.set("blocks", blocks)

    expect((await saveWikiPageAction(form)).ok).toBe(true)
    expect(mocks.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ blocks: expect.any(Array) })
    )
  })

  it("does not report success when the current revision was not persisted", async () => {
    mocks.query.savedRevisionId = "another-revision"
    const form = new FormData()
    form.set("node_id", "draft")
    form.set("blocks", "[]")

    await expect(saveWikiPageAction(form)).resolves.toEqual({
      ok: false,
      message: "Wiki page content could not be confirmed as saved.",
    })
    expect(mocks.index).not.toHaveBeenCalled()
  })
})
