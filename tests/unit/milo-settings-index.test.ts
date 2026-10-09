import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  user: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin" } } })) },
  },
  admin: {
    storage: {
      from: vi.fn(() => ({ list: vi.fn(async () => ({ data: [] })) })),
    },
  },
  permission: vi.fn(async () => true),
  curated: vi.fn(async () => 10),
  wiki: vi.fn(async () => 4),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mocks.user),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mocks.admin),
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: mocks.permission,
}))
vi.mock("@/lib/wiki-extract", () => ({ extractWikiDocumentText: vi.fn() }))
vi.mock("@/lib/wiki-ai", () => ({
  indexCuratedSiteKnowledge: mocks.curated,
  indexKnowledgeSource: vi.fn(),
}))
vi.mock("@/lib/wiki-index", () => ({ indexWikiKnowledge: mocks.wiki }))

import { runMiloKnowledgeIndexAction } from "@/app/settings/actions"

describe("Settings Milo full index", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permission.mockResolvedValue(true)
    mocks.wiki.mockResolvedValue(4)
  })
  it("includes Wiki sources in the actual Settings action and its receipt", async () => {
    const result = await runMiloKnowledgeIndexAction()
    expect(mocks.wiki).toHaveBeenCalledWith(mocks.admin)
    expect(result).toMatchObject({
      ok: true,
      indexedCount: 14,
      wikiIndexedCount: 4,
      curatedIndexedCount: 10,
      fileIndexedCount: 0,
    })
  })
  it("reports failure instead of a successful partial index when Wiki indexing fails", async () => {
    mocks.wiki.mockRejectedValueOnce(new Error("Wiki index failed"))
    expect(await runMiloKnowledgeIndexAction()).toEqual({
      ok: false,
      message: "Wiki index failed",
    })
    expect(mocks.admin.storage.from).not.toHaveBeenCalled()
  })
  it("does not index when Settings authorization is denied", async () => {
    mocks.permission.mockResolvedValue(false)
    await expect(runMiloKnowledgeIndexAction()).rejects.toThrow("Unauthorized")
    expect(mocks.curated).not.toHaveBeenCalled()
    expect(mocks.wiki).not.toHaveBeenCalled()
  })
})
