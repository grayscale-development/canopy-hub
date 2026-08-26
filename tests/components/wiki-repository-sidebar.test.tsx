// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WikiRepositorySidebar } from "@/components/wiki/wiki-repository-sidebar"
import type { WikiNodeRow } from "@/lib/wiki"

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

const wikiActions = vi.hoisted(() => ({
  toggleWikiSectionPinAction: vi.fn(async (formData: FormData) => {
    void formData

    return {
      ok: true,
      message: "Section pinned.",
    }
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}))

vi.mock("@/app/wiki/actions", () => wikiActions)

vi.mock("@/components/wiki/wiki-management-controls", () => ({
  WikiCreateWizardDialog: ({
    triggerLabel = "Add",
  }: {
    triggerLabel?: string
  }) => <button type="button">{triggerLabel}</button>,
}))

const baseNode = {
  status: "published",
  sort_order: 0,
  is_pinned: false,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
} satisfies Partial<WikiNodeRow>

function node(overrides: Partial<WikiNodeRow> & Pick<WikiNodeRow, "id">) {
  return {
    ...baseNode,
    parent_id: null,
    type: "folder",
    slug: overrides.id,
    title: overrides.id,
    ...overrides,
  } as WikiNodeRow
}

const nodes = [
  node({
    id: "canopy-root",
    slug: "canopy-wiki",
    title: "Canopy Wiki",
    sort_order: 0,
  }),
  node({
    id: "learning-root",
    slug: "learning-hub",
    title: "Learning Hub",
    sort_order: 1,
  }),
  node({
    id: "nano-root",
    slug: "nano-wiki",
    title: "Nano Wiki",
    sort_order: 2,
  }),
  node({
    id: "canopy-hub",
    parent_id: "canopy-root",
    slug: "hub",
    title: "Hub",
    sort_order: 0,
  }),
  node({
    id: "canopy-operations",
    parent_id: "canopy-root",
    slug: "operations",
    title: "Operations",
    sort_order: 1,
  }),
  node({
    id: "learning-courses",
    parent_id: "learning-root",
    slug: "course-library",
    title: "Course Library",
    sort_order: 0,
  }),
  node({
    id: "learning-onboarding",
    parent_id: "learning-root",
    slug: "onboarding",
    title: "Onboarding",
    sort_order: 1,
  }),
]

const canManageWiki = true

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

function renderSidebar(
  selectedRepositorySlug: string,
  sidebarNodes: WikiNodeRow[] = nodes
) {
  return render(
    <TooltipProvider>
      <WikiRepositorySidebar
        nodes={sidebarNodes}
        activePath={selectedRepositorySlug}
        selectedRepositorySlug={selectedRepositorySlug}
        canManageWiki={canManageWiki}
      />
    </TooltipProvider>
  )
}

function expectBefore(leftLabel: string, rightLabel: string) {
  const left = screen.getByRole("button", { name: leftLabel })
  const right = screen.getByRole("button", { name: rightLabel })

  expect(
    left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
}

describe("WikiRepositorySidebar", () => {
  it("sorts pinned sections from shared wiki configuration", () => {
    const { rerender } = renderSidebar("canopy-wiki")

    expectBefore("Hub", "Operations")

    rerender(
      <TooltipProvider>
        <WikiRepositorySidebar
          nodes={nodes.map((item) =>
            item.id === "canopy-operations"
              ? { ...item, is_pinned: true }
              : item
          )}
          activePath="canopy-wiki"
          selectedRepositorySlug="canopy-wiki"
          canManageWiki={canManageWiki}
        />
      </TooltipProvider>
    )

    expectBefore("Operations", "Hub")
    expect(
      screen.getByRole("button", { name: "Unpin Operations" })
    ).toBeInTheDocument()

    rerender(
      <TooltipProvider>
        <WikiRepositorySidebar
          nodes={nodes.map((item) =>
            item.id === "learning-onboarding"
              ? { ...item, is_pinned: true }
              : item
          )}
          activePath="learning-hub"
          selectedRepositorySlug="learning-hub"
          canManageWiki={canManageWiki}
        />
      </TooltipProvider>
    )

    expectBefore("Onboarding", "Course Library")
  })

  it("uses a server action to update the pinned section", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")

    await user.click(screen.getByRole("button", { name: "Pin Operations" }))

    await waitFor(() => {
      expect(wikiActions.toggleWikiSectionPinAction).toHaveBeenCalledOnce()
    })
    const formData = wikiActions.toggleWikiSectionPinAction.mock.calls[0]?.[0]
    expect(formData?.get("section_id")).toBe("canopy-operations")
    expect(router.refresh).toHaveBeenCalled()
  })

  it("hides pin controls outside edit mode", () => {
    render(
      <TooltipProvider>
        <WikiRepositorySidebar
          nodes={nodes}
          activePath="canopy-wiki"
          selectedRepositorySlug="canopy-wiki"
          canManageWiki={false}
        />
      </TooltipProvider>
    )

    expect(
      screen.queryByRole("button", { name: "Pin Operations" })
    ).not.toBeInTheDocument()
  })
})
