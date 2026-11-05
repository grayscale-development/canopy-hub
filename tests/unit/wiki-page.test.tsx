// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import type * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  canManage: true,
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({ redirect: state.redirect }))
vi.mock("@/components/wiki/wiki-edit-mode", () => ({
  WikiEditModeGate: ({ children }: { children: React.ReactNode }) => children,
  WikiVisibleNodeGate: ({ children }: { children: React.ReactNode }) =>
    children,
  WikiViewModeTitleSpacing: () => null,
}))
vi.mock("@/components/wiki/wiki-editor", () => ({
  WikiEditor: () => <div>Wiki editor</div>,
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
  WikiImportWizardDialog: () => <button type="button">AI Create</button>,
}))
vi.mock("@/components/wiki/wiki-tags-directory", () => ({
  WikiTagsDirectory: () => <div>Tags</div>,
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(async () => state.canManage),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "wiki-manager", email: "manager@canopy.test" } },
      }),
    },
  }),
}))
vi.mock("@/lib/wiki", () => ({
  WIKI_MANAGE_PERMISSION: "wiki.manage",
  buildWikiPath: vi.fn(),
  compareWikiNodes: () => 0,
  fetchWikiNodes: vi.fn(async () => []),
  fetchWikiPageData: vi.fn(async () => null),
  fetchWikiTags: vi.fn(async () => []),
  findFirstPublishedWikiPagePath: vi.fn(),
  isMissingWikiSchemaError: vi.fn(() => false),
  isPublishedWikiBranch: vi.fn(() => false),
}))
vi.mock("@/lib/wiki-repositories", () => ({
  getDefaultWikiRepository: vi.fn(() => ({ slug: "canopy-wiki" })),
  getWikiRepositoryBySlug: vi.fn(() => null),
}))

afterEach(() => vi.clearAllMocks())

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
})
