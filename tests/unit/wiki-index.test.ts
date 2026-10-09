import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  page: vi.fn(async () => "source"),
  asset: vi.fn(async () => "source"),
  revision: vi.fn(async () => ({
    id: "revision",
    plain_text: "Saved instructions",
  })),
}))
vi.mock("@/lib/wiki-ai", () => ({
  indexWikiPage: mocks.page,
  indexWikiAsset: mocks.asset,
}))
vi.mock("@/lib/wiki", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wiki")>()),
  fetchCurrentRevision: mocks.revision,
}))

import { indexWikiKnowledge } from "@/lib/wiki-index"

describe("shared Wiki indexing", () => {
  beforeEach(() => vi.clearAllMocks())
  it("indexes published, draft and archived pages and assets with their live visibility metadata", async () => {
    const nodes = ["published", "draft", "archived"].map((status) => ({
      id: status,
      parent_id: null,
      type: "page",
      slug: status,
      title: status,
      status,
    }))
    const assets = [{ id: "asset", node_id: "draft", status: "active" }]
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: nodes, error: null }).then(resolve),
      in: vi.fn(async () => ({ data: assets, error: null })),
    }
    const client = { from: vi.fn(() => query) }
    expect(await indexWikiKnowledge(client as never)).toBe(3)
    expect(mocks.page).toHaveBeenCalledTimes(3)
    expect(mocks.page).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({ status: "draft" }),
        isPublished: false,
        revision: expect.objectContaining({ plain_text: "Saved instructions" }),
      })
    )
    expect(mocks.asset).toHaveBeenCalledWith(
      expect.objectContaining({ asset: assets[0], isPagePublished: false })
    )
  })
})
