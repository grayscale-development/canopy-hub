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
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"
import { WikiRepositorySidebar } from "@/components/wiki/wiki-repository-sidebar"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("@/components/wiki/wiki-management-controls", () => ({
  WIKI_EDIT_NODE_EVENT: "wiki:edit-node",
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
  WikiNodeActionsMenu: () => null,
}))

vi.mock("@/components/wiki/wiki-import-wizard", () => ({
  WikiImportWizardDialog: ({
    parentId,
    open,
  }: {
    parentId?: string | null
    open?: boolean
  }) =>
    open ? (
      <div data-testid="ai-create-dialog" data-parent-id={parentId ?? ""}>
        AI Create dialog
      </div>
    ) : null,
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
        name: "Add to Operations",
      })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Add to Closing" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
  })

  it("keeps sections ordered and toggles them from the chevron", async () => {
    const user = userEvent.setup()
    const view = renderSidebar("canopy-wiki")

    expectBefore("Hub", "Operations")

    expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute(
      "href",
      "/wiki/canopy-wiki/operations"
    )

    const sectionChevron = screen.getByRole("button", {
      name: "Toggle Operations",
    })
    expect(sectionChevron).toHaveAttribute("aria-expanded", "true")
    await user.click(sectionChevron)
    expect(
      screen.getByRole("button", { name: "Toggle Operations" })
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
        screen.getByRole("button", { name: "Toggle Operations" })
      ).toHaveAttribute("aria-expanded", "false")
    })
    view.unmount()
  })

  it("links group titles and expands them using the chevron", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")
    const groupTitle = screen.getByRole("link", { name: "Closing" })
    expect(groupTitle).toHaveAttribute(
      "href",
      "/wiki/canopy-wiki/operations/closing"
    )
    await user.click(screen.getByRole("button", { name: "Toggle Closing" }))
    expect(screen.getByRole("link", { name: "Final Review" })).toBeVisible()
    expect(
      window.localStorage.getItem("wiki-sidebar:group:closing-group")
    ).toBe("open")
    expect(within(groupTitle).getByText("Closing")).toBeVisible()
  })

  it("uses the same minimum row height for sections, groups, and pages", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")

    await user.click(screen.getByRole("button", { name: "Toggle Closing" }))

    expect(
      screen.getByRole("link", { name: "Operations" }).parentElement
    ).toHaveClass("min-h-8")
    expect(
      screen.getByRole("link", { name: "Closing" }).parentElement
    ).toHaveClass("min-h-8")
    expect(screen.getByRole("link", { name: "Final Review" })).toHaveClass(
      "min-h-8"
    )
  })

  it("shows manager-only edit controls for sections and groups", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    window.addEventListener("wiki:edit-node", onEdit)
    renderSidebar("canopy-wiki")

    expect(screen.getByRole("button", { name: "Edit Operations" })).toHaveClass(
      "size-6"
    )
    expect(screen.getByRole("button", { name: "Edit Closing" })).toHaveClass(
      "cursor-pointer"
    )

    await user.click(screen.getByRole("button", { name: "Edit Operations" }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({
      detail: { id: "canopy-operations" },
    })
    window.removeEventListener("wiki:edit-node", onEdit)
  })

  it("offers page and AI Create options when adding to a group", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")

    const addButton = screen.getByRole("button", { name: "Add to Closing" })
    expect(addButton).toHaveClass("size-8", "cursor-pointer")
    await user.click(addButton)

    const pageOption = screen.getByRole("menuitem", { name: "Page" })
    const aiCreateOption = screen.getByRole("menuitem", { name: "AI Create" })
    expect(pageOption).toBeVisible()
    expect(pageOption.querySelector("svg")).toHaveClass("size-4")
    expect(aiCreateOption.querySelector("svg")).toHaveClass("size-4")
    await user.click(aiCreateOption)
    expect(screen.getByTestId("ai-create-dialog")).toHaveAttribute(
      "data-parent-id",
      "closing-group"
    )
  })

  it("shows an icon beside every section add option", async () => {
    const user = userEvent.setup()
    renderSidebar("canopy-wiki")

    await user.click(screen.getByRole("button", { name: "Add to Operations" }))

    for (const label of ["Page", "Group", "AI Create"]) {
      expect(
        screen.getByRole("menuitem", { name: label }).querySelector("svg")
      ).toHaveClass("size-4")
    }
  })

  it.each([true, false])(
    "hides editing controls with Editor Mode off (manager: %s)",
    (manager) => {
      render(
        <WikiEditModeProvider canManageWiki={manager}>
          <TooltipProvider>
            <WikiRepositorySidebar
              nodes={nodes}
              activePath="canopy-wiki"
              selectedRepositorySlug="canopy-wiki"
              canManageWiki={manager}
            />
          </TooltipProvider>
        </WikiEditModeProvider>
      )
      for (const name of [
        "Create Section",
        "Add to Operations",
        "Add to Closing",
        "Edit Operations",
        "Edit Closing",
      ]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
      }
      expect(
        screen.getByRole("switch", { name: "Toggle wiki editor mode" })
      ).toBeInTheDocument()
    }
  )

  it("explains the draft indicator", async () => {
    const user = userEvent.setup()
    const draftNodes = nodes.map((item) =>
      item.id === "closing-page" ? { ...item, status: "draft" } : item
    ) as WikiNodeRow[]
    renderSidebar("canopy-wiki", "canopy-wiki", draftNodes)
    await user.click(screen.getByRole("button", { name: "Toggle Closing" }))
    expect(screen.getByRole("img", { name: "Draft" })).toHaveAttribute(
      "title",
      "Draft - only editors can see this"
    )
  })

  it("does not offer creation controls to a viewer", () => {
    renderSidebar("canopy-wiki", "canopy-wiki", nodes, false)

    expect(
      screen.queryByRole("button", {
        name: "Add to Operations",
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Add to Closing" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Edit Operations" })
    ).not.toBeInTheDocument()
  })
})
