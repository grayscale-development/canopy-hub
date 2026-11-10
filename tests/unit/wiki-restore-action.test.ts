import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: { id: "manager" } as { id: string } | null,
  canManage: true,
  node: {
    id: "page-1",
    short_id: 17,
    type: "page",
    current_revision_id: "old-revision",
    parent_id: null,
    slug: "escrow",
    title: "Escrow policy",
    status: "published",
    sort_order: 0,
    tags: [],
    created_by: "manager",
    updated_by: "manager",
    created_at: "2026-11-04T15:15:00.000Z",
    updated_at: "2026-11-05T15:00:00.000Z",
  },
  revision: {
    id: "old-revision",
    node_id: "page-1",
    blocks: [{ type: "paragraph", content: "Send the file today." }],
    plain_text: "Send the file today.",
    created_at: "2026-11-04T15:15:00.000Z",
  },
  inserted: [] as Array<{ table: string; value: Record<string, unknown> }>,
  updates: [] as Array<{
    table: string
    value: Record<string, unknown>
    filters: Record<string, unknown>
  }>,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect")
  },
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ role: "admin" }),
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(async () => state.canManage),
}))
vi.mock("@/lib/wiki-ai", () => ({
  indexWikiPage: vi.fn(),
  indexWikiAsset: vi.fn(),
  archiveKnowledgeSource: vi.fn(),
}))

function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let pendingUpdate: Record<string, unknown> | null = null
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters[column] = value
          return builder
        },
        or: () => builder,
        order: () => builder,
        insert(value: Record<string, unknown>) {
          state.inserted.push({ table, value })
          return builder
        },
        update(value: Record<string, unknown>) {
          pendingUpdate = value
          return builder
        },
        maybeSingle: async () => {
          if (table === "wiki_nodes" && filters.id === state.node.id) {
            return { data: state.node, error: null }
          }
          if (
            table === "wiki_page_revisions" &&
            filters.id === state.revision.id &&
            (!filters.node_id || filters.node_id === state.revision.node_id)
          ) {
            return { data: state.revision, error: null }
          }
          return { data: null, error: null }
        },
        single: async () => ({ data: { id: "new-revision-id" }, error: null }),
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          if (pendingUpdate) {
            state.updates.push({
              table,
              value: pendingUpdate,
              filters: { ...filters },
            })
            pendingUpdate = null
          }
          return Promise.resolve({
            data: table === "wiki_nodes" ? [state.node] : [],
            error: null,
          }).then(resolve)
        },
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => createClient(),
}))

import {
  getWikiRevisionComparisonAction,
  restoreWikiRevisionAction,
} from "@/app/wiki/actions"

describe("restoreWikiRevisionAction", () => {
  beforeEach(() => {
    state.user = { id: "manager" }
    state.canManage = true
    state.node.current_revision_id = "current-revision"
    state.revision.node_id = "page-1"
    state.inserted = []
    state.updates = []
  })

  it("appends a new revision instead of pointing at the old one", async () => {
    const form = new FormData()
    form.set("node_id", "page-1")
    form.set("revision_id", "old-revision")

    const result = await restoreWikiRevisionAction(form)

    expect(result.ok).toBe(true)
    expect(state.inserted).toEqual([
      {
        table: "wiki_page_revisions",
        value: {
          node_id: "page-1",
          blocks: state.revision.blocks,
          plain_text: "Send the file today.",
          change_note: "Restored from Nov 4, 2026, 3:15 PM UTC",
          created_by: "manager",
        },
      },
    ])
    expect(state.updates).toContainEqual({
      table: "wiki_nodes",
      value: {
        current_revision_id: "new-revision-id",
        updated_by: "manager",
      },
      filters: { id: "page-1" },
    })
    expect(
      state.updates.some(
        (update) => update.value.current_revision_id === "old-revision"
      )
    ).toBe(false)
  })

  it("does not write when the version is missing or already current", async () => {
    const missing = new FormData()
    missing.set("node_id", "page-1")
    missing.set("revision_id", "missing-revision")
    expect((await restoreWikiRevisionAction(missing)).ok).toBe(false)
    expect(state.inserted).toEqual([])

    state.node.current_revision_id = "old-revision"
    const current = new FormData()
    current.set("node_id", "page-1")
    current.set("revision_id", "old-revision")
    expect(await restoreWikiRevisionAction(current)).toMatchObject({
      ok: false,
      message: "That version is already the current page.",
    })
    expect(state.inserted).toEqual([])
  })

  it("rejects a revision that belongs to a different page", async () => {
    state.revision.node_id = "other-page"
    const form = new FormData()
    form.set("node_id", "page-1")
    form.set("revision_id", "old-revision")

    expect(await restoreWikiRevisionAction(form)).toMatchObject({
      ok: false,
      message: "That version could not be found on this page.",
    })
    expect(state.inserted).toEqual([])
    expect(state.updates).toEqual([])
  })

  it("rejects people who cannot manage the wiki", async () => {
    state.canManage = false
    const form = new FormData()
    form.set("node_id", "page-1")
    form.set("revision_id", "old-revision")

    expect(await restoreWikiRevisionAction(form)).toMatchObject({
      ok: false,
      message: "You do not have permission to manage the Wiki.",
    })
    expect(state.inserted).toEqual([])
    expect(state.updates).toEqual([])
  })
})

describe("getWikiRevisionComparisonAction", () => {
  beforeEach(() => {
    state.user = { id: "manager" }
    state.canManage = true
    state.node.current_revision_id = "old-revision"
    state.revision.node_id = "page-1"
  })
  it("returns the selected and current content for a manager", async () => {
    const result = await getWikiRevisionComparisonAction({
      node_id: "page-1",
      revision_id: "old-revision",
    })
    expect(result).toMatchObject({
      ok: true,
      current: {
        id: "old-revision",
        plain_text: state.revision.plain_text,
        blocks: state.revision.blocks,
      },
      selected: { id: "old-revision", created_at: state.revision.created_at },
    })
  })
  it("rejects unauthorized users and versions on other pages", async () => {
    state.canManage = false
    expect(
      await getWikiRevisionComparisonAction({
        node_id: "page-1",
        revision_id: "old-revision",
      })
    ).toMatchObject({
      ok: false,
      message: "You do not have permission to manage the Wiki.",
    })
    state.canManage = true
    state.revision.node_id = "other-page"
    expect(
      (
        await getWikiRevisionComparisonAction({
          node_id: "page-1",
          revision_id: "old-revision",
        })
      ).ok
    ).toBe(false)
  })
})
