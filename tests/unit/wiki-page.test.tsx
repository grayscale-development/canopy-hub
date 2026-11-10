// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import type * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  canManage: true,
  editMode: true,
  redirect: vi.fn(),
  pageData: null as unknown,
  revisions: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
  limit: vi.fn(),
}))

vi.mock("next/navigation", () => ({ redirect: state.redirect }))
vi.mock("@/components/wiki/wiki-edit-mode", () => ({
  WikiEditModeGate: ({ children }: { children: React.ReactNode }) =>
    state.editMode ? children : null,
  WikiVisibleNodeGate: ({ children }: { children: React.ReactNode }) =>
    children,
  WikiViewModeTitleSpacing: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("@/components/wiki/wiki-editor", () => ({
  WikiEditor: ({
    createAction,
    revision,
    versionHistory,
  }: {
    createAction?: React.ReactNode
    revision?: { plain_text?: string } | null
    versionHistory?: React.ReactNode
  }) => (
    <div>
      Wiki editor
      <span>{revision?.plain_text}</span>
      {versionHistory}
      {createAction}
    </div>
  ),
}))
vi.mock("@/components/wiki/wiki-folder-contents", () => ({
  WikiFolderContents: ({ items }: { items: unknown[] }) => (
    <div>{items.length ? "Folder items" : "Nothing here yet."}</div>
  ),
}))
vi.mock("@/components/wiki/wiki-management-controls", () => ({
  WikiCreateWizardDialog: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel ?? "Create"}</button>
  ),
  WikiNodeActionsMenu: () => null,
}))
vi.mock("@/components/wiki/wiki-import-wizard", () => ({
  WikiImportWizardDialog: ({
    triggerLabel = "AI Create",
  }: {
    triggerLabel?: string
  }) => <button type="button">{triggerLabel}</button>,
}))
vi.mock("@/components/wiki/wiki-revisions", () => ({
  WikiRevisionSelector: ({
    canRestore,
    revisions,
    hasMore,
  }: {
    canRestore: boolean
    revisions: Array<{ author: string }>
    hasMore: boolean
  }) => (
    <div>
      Revision history
      {canRestore ? <span>Can restore</span> : null}
      {revisions.map((revision, index) => (
        <span key={index}>{revision.author}</span>
      ))}
      {hasMore ? <span>More versions</span> : null}
    </div>
  ),
}))
vi.mock("@/components/wiki/wiki-tags-directory", () => ({
  WikiTagsDirectory: () => <div>Tags</div>,
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(
    async ({ code }: { code: string }) => code === "beta.1" || state.canManage
  ),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "wiki-manager", email: "manager@canopy.test" } },
      }),
    },
    rpc: async () => ({
      data: [{ user_id: "other", full_name: "Another Author", email: null }],
      error: null,
    }),
    from: () => ({
      select: (...args: unknown[]) => {
        state.select(...args)
        return {
          eq: () => ({
            order: () => ({
              limit: async (value: number) => {
                state.limit(value)
                return { data: state.revisions, count: 31, error: null }
              },
            }),
          }),
        }
      },
    }),
  }),
}))
vi.mock("@/lib/wiki", () => ({
  WIKI_MANAGE_PERMISSION: "wiki.manage",
  buildWikiPath: vi.fn(() => "canopy-wiki/welcome"),
  compareWikiNodes: () => 0,
  fetchWikiNodes: vi.fn(async () => []),
  fetchArchivedWikiNodes: vi.fn(async () => []),
  resolveWikiPath: vi.fn(() => null),
  buildWikiBreadcrumbs: vi.fn(() => []),
  fetchWikiPageData: vi.fn(async () => state.pageData),
  fetchWikiTags: vi.fn(async () => []),
  findFirstPublishedWikiPagePath: vi.fn(),
  isMissingWikiSchemaError: vi.fn(() => false),
  isPublishedWikiBranch: vi.fn(() => false),
}))
vi.mock("@/lib/wiki-repositories", () => ({
  getDefaultWikiRepository: vi.fn(() => ({ slug: "canopy-wiki" })),
  getWikiRepositoryBySlug: vi.fn(() => null),
}))

afterEach(() => {
  cleanup()
  state.canManage = true
  state.editMode = true
  state.pageData = null
  state.revisions = []
  vi.clearAllMocks()
})

describe("Wiki landing page", () => {
  it("keeps an empty Wiki landing in place and gives managers an Add Section action", async () => {
    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")

    render(
      await WikiPage({
        params: Promise.resolve({ path: [] }),
        searchParams: Promise.resolve({}),
      })
    )

    expect(
      screen.getByRole("heading", { name: "Welcome to the Wiki" })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Add Section" })).toBeVisible()
    expect(screen.getByText("Nothing here yet.")).toBeVisible()
    expect(state.redirect).not.toHaveBeenCalled()
  })

  it("hides creation on an empty landing when Editor Mode is off", async () => {
    state.editMode = false
    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")
    render(
      await WikiPage({
        params: Promise.resolve({ path: [] }),
        searchParams: Promise.resolve({}),
      })
    )
    expect(
      screen.queryByRole("button", { name: /Add Section|Create|Import/ })
    ).not.toBeInTheDocument()
  })

  it("renders a folder landing instead of redirecting to a page", async () => {
    state.pageData = {
      node: {
        id: "folder",
        type: "folder",
        title: "Operations",
        updated_at: "2026-11-04T00:00:00Z",
        updated_by: null,
      },
      breadcrumbs: [],
      children: [],
      revision: null,
    }
    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")
    render(
      await WikiPage({
        params: Promise.resolve({ path: ["canopy-wiki", "operations"] }),
        searchParams: Promise.resolve({}),
      })
    )
    expect(screen.getByRole("heading", { name: "Operations" })).toBeVisible()
    expect(screen.getByText("Nothing here yet.")).toBeVisible()
    expect(state.redirect).not.toHaveBeenCalled()
  })

  it("shows revision history and AI Update for a page a manager can edit", async () => {
    state.pageData = {
      node: {
        id: "page-1",
        parent_id: null,
        type: "page",
        slug: "welcome",
        title: "Welcome",
        status: "published",
        sort_order: 0,
        current_revision_id: "rev-current",
        created_by: "wiki-manager",
        updated_by: "wiki-manager",
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-04T00:00:00.000Z",
        tags: [],
      },
      revision: {
        id: "rev-current",
        plain_text: "Current words",
      },
      assets: [],
      breadcrumbs: [],
      children: [],
      path: "canopy-wiki/welcome",
    }
    state.revisions = [
      {
        id: "rev-current",
        created_by: "other",
        change_note: null,
        created_at: "2026-11-04T00:00:00.000Z",
      },
    ]

    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")
    render(
      await WikiPage({
        params: Promise.resolve({ path: ["canopy-wiki", "welcome"] }),
        searchParams: Promise.resolve({ revision: "rev-old" }),
      })
    )

    expect(screen.getByText("Current words")).toBeVisible()
    expect(
      screen.queryByText(/You are looking at an older version/)
    ).not.toBeInTheDocument()
    expect(screen.getByText("Revision history")).toBeVisible()
    expect(screen.getByText("Can restore")).toBeVisible()
    expect(screen.getByText("Another Author")).toBeVisible()
    expect(screen.getByText("More versions")).toBeVisible()
    expect(state.select).toHaveBeenCalledWith(
      "id,created_at,change_note,created_by",
      { count: "exact" }
    )
    expect(state.limit).toHaveBeenCalledWith(30)
    expect(screen.getByRole("button", { name: "AI Update" })).toBeVisible()
  })

  it("keeps the version menu and old revisions hidden from readers", async () => {
    state.canManage = false
    state.pageData = {
      node: {
        id: "page-1",
        parent_id: null,
        type: "page",
        slug: "welcome",
        title: "Welcome",
        status: "published",
        sort_order: 0,
        current_revision_id: "rev-current",
        created_by: "reader",
        updated_by: "wiki-manager",
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-04T00:00:00.000Z",
        tags: [],
      },
      revision: {
        id: "rev-current",
        plain_text: "Current words",
      },
      assets: [],
      breadcrumbs: [],
      children: [],
      path: "canopy-wiki/welcome",
    }
    state.revisions = [
      {
        id: "rev-old",
        plain_text: "Older words",
        created_at: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "rev-current",
        plain_text: "Current words",
        created_at: "2026-11-04T00:00:00.000Z",
      },
    ]

    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")
    render(
      await WikiPage({
        params: Promise.resolve({ path: ["canopy-wiki", "welcome"] }),
        searchParams: Promise.resolve({ revision: "rev-old" }),
      })
    )

    expect(screen.queryByText("Revision history")).not.toBeInTheDocument()
    expect(screen.queryByText("Can restore")).not.toBeInTheDocument()
    expect(screen.queryByText("Historical page")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "AI Update" })
    ).not.toBeInTheDocument()
  })
})
