// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WikiRepositorySidebar } from "@/components/wiki/wiki-repository-sidebar"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("@/components/wiki/wiki-management-controls", () => ({
  WikiCreateWizardDialog: ({
    triggerLabel = "Create",
    triggerAriaLabel,
    iconOnly = false,
  }: {
    triggerLabel?: string
    triggerAriaLabel?: string
    iconOnly?: boolean
  }) => (
    <button type="button" aria-label={triggerAriaLabel ?? triggerLabel}>
      {iconOnly ? "+" : triggerLabel}
    </button>
  ),
}))

const baseNode = {
  status: "published",
  sort_order: 0,
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
    id: "operations-overview",
    parent_id: "canopy-operations",
    type: "page",
    slug: "overview",
    title: "Operations Overview",
  }),
  node({
    id: "closing-group",
    parent_id: "canopy-operations",
    slug: "closing",
    title: "Closing",
  }),
  node({
    id: "closing-page",
    parent_id: "closing-group",
    type: "page",
    slug: "final-review",
    title: "Final Review",
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
  window.localStorage.clear()
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

function renderSidebar(
  selectedRepositorySlug: string,
  activePath = selectedRepositorySlug,
  sidebarNodes: WikiNodeRow[] = nodes,
  canManage = canManageWiki
) {
  return render(
    <TooltipProvider>
      <WikiRepositorySidebar
        nodes={sidebarNodes}
        activePath={activePath}
        selectedRepositorySlug={selectedRepositorySlug}
        canManageWiki={canManage}
      />
    </TooltipProvider>
  )
}

function expectBefore(leftLabel: string, rightLabel: string) {
  const left = screen.getByRole("link", { name: leftLabel })
  const right = screen.getByRole("link", { name: rightLabel })

  expect(
    left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
}

describe("WikiRepositorySidebar", () => {
  it("uses a static repository heading and contextual create controls", () => {
    renderSidebar("canopy-wiki")

    expect(screen.getByRole("heading", { name: "Canopy Wiki" })).toBeVisible()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create Section" })).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "Add a page or group to Operations",
      })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Add a page to Closing" })
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
  })

  it("keeps sections ordered and makes title navigation separate from expansion", async () => {
    const user = userEvent.setup()
    const view = renderSidebar("canopy-wiki")

    expectBefore("Hub", "Operations")

    const sectionTitle = screen.getByRole("link", { name: "Operations" })
    expect(sectionTitle).toHaveAttribute("href", "/wiki/canopy-wiki/operations")

    const sectionChevron = screen.getByRole("button", {
      name: "Collapse Operations",
    })
    expect(sectionChevron).toHaveAttribute("aria-expanded", "true")
    await user.click(sectionChevron)
    expect(
      screen.getByRole("button", { name: "Expand Operations" })
    ).toHaveAttribute("aria-expanded", "false")

    view.rerender(
      <TooltipProvider>
        <WikiRepositorySidebar
          nodes={nodes}
          activePath="canopy-wiki/operations/closing/final-review"
          selectedRepositorySlug="canopy-wiki"
          canManageWiki={canManageWiki}
        />
      </TooltipProvider>
    )
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Expand Operations" })
      ).toHaveAttribute("aria-expanded", "false")
    })
    view.unmount()
  })

  it("expands groups from the chevron and preserves their page link", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")

    const groupTitle = screen.getByRole("link", { name: "Closing" })
    expect(groupTitle).toHaveAttribute(
      "href",
      "/wiki/canopy-wiki/operations/closing"
    )

    const groupChevron = screen.getByRole("button", { name: "Expand Closing" })
    expect(groupChevron).toHaveAttribute("aria-expanded", "false")
    await user.click(groupChevron)
    expect(
      screen.getByRole("button", { name: "Collapse Closing" })
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: "Final Review" })).toHaveAttribute(
      "href",
      "/wiki/canopy-wiki/operations/closing/final-review"
    )
    expect(
      window.localStorage.getItem("wiki-sidebar:group:closing-group")
    ).toBe("open")
    expect(within(groupTitle).getByText("Closing")).toBeVisible()
  })

  it("does not offer creation controls to a viewer", () => {
    renderSidebar("canopy-wiki", "canopy-wiki", nodes, false)

    expect(
      screen.queryByRole("button", {
        name: "Add a page or group to Operations",
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Add a page to Closing" })
    ).not.toBeInTheDocument()
  })
})
