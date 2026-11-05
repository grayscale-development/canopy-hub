// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import type * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  canManage: true,
  redirect: vi.fn(),
  pageData: null as unknown,
  revisions: [] as Array<Record<string, unknown>>,
}))

vi.mock("next/navigation", () => ({ redirect: state.redirect }))
vi.mock("@/components/wiki/wiki-edit-mode", () => ({
  WikiEditModeGate: ({ children }: { children: React.ReactNode }) => children,
  WikiVisibleNodeGate: ({ children }: { children: React.ReactNode }) =>
    children,
  WikiViewModeTitleSpacing: () => null,
}))
vi.mock("@/components/wiki/wiki-editor", () => ({
  WikiEditor: ({
    createAction,
    isHistorical,
    versionHistory,
  }: {
    createAction?: React.ReactNode
    isHistorical?: boolean
    versionHistory?: React.ReactNode
  }) => (
    <div>
      Wiki editor
      {isHistorical ? <span>Historical page</span> : null}
      {versionHistory}
      {createAction}
    </div>
  ),
}))
vi.mock("@/components/wiki/wiki-folder-contents", () => ({
  WikiFolderContents: ({ emptyLabel }: { emptyLabel?: string }) => (
    <div>{emptyLabel}</div>
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
  WikiRevisionSelector: ({ canRestore }: { canRestore: boolean }) => (
    <div>
      Revision history
      {canRestore ? <span>Can restore</span> : null}
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
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: state.revisions, error: null }),
          }),
        }),
      }),
    }),
  }),
}))
vi.mock("@/lib/wiki", () => ({
  WIKI_MANAGE_PERMISSION: "wiki.manage",
  buildWikiPath: vi.fn(() => "canopy-wiki/welcome"),
  compareWikiNodes: () => 0,
  fetchWikiNodes: vi.fn(async () => []),
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
    expect(screen.getByText("No wikis yet.")).toBeVisible()
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
        plain_text: "Current words",
        created_at: "2026-11-04T00:00:00.000Z",
      },
    ]

    const { default: WikiPage } = await import("@/app/wiki/[[...path]]/page")
    render(
      await WikiPage({
        params: Promise.resolve({ path: ["canopy-wiki", "welcome"] }),
        searchParams: Promise.resolve({}),
      })
    )

    expect(screen.getByText("Revision history")).toBeVisible()
    expect(screen.getByText("Can restore")).toBeVisible()
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
