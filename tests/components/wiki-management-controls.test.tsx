// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiEditableTitle,
  WikiNodeActionsMenu,
} from "@/components/wiki/wiki-management-controls"
import type { WikiNodeRow } from "@/lib/wiki"

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}))

vi.mock("@/app/wiki/actions", () => ({
  archiveWikiNodeAction: vi.fn(),
  updateWikiNodeAction: vi.fn(),
  createWikiNodeAction: vi.fn(),
}))

const emptyGroup = {
  id: "wiki-group",
  parent_id: "wiki-repository",
  type: "folder",
  slug: "operations",
  title: "Operations",
  status: "published",
  sort_order: 0,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
  tags: [],
} satisfies WikiNodeRow

const wikiSection = {
  ...emptyGroup,
  id: "wiki-section",
  parent_id: null,
  slug: "canopy-wiki",
  title: "Canopy Wiki",
} satisfies WikiNodeRow

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe("WikiNodeActionsMenu", () => {
  it("keeps Move on the left and Cancel and Save together on the right", async () => {
    const user = userEvent.setup()
    render(
      <>
        <WikiEditableTitle nodeId={emptyGroup.id}>Group</WikiEditableTitle>
        <WikiNodeActionsMenu nodes={[emptyGroup]} node={emptyGroup} />
      </>
    )

    await user.click(screen.getByRole("button", { name: "Group" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit Wiki Item" })
    const move = within(dialog).getByRole("button", { name: "Move" })
    const cancel = within(dialog).getByRole("button", { name: "Cancel" })
    const save = within(dialog).getByRole("button", { name: "Save" })

    expect(move.parentElement).toHaveClass("justify-between")
    expect(
      move.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("keeps Archive inside Edit and preserves the empty-folder guard", async () => {
    const user = userEvent.setup()
    render(
      <>
        <WikiEditableTitle nodeId={emptyGroup.id}>Group</WikiEditableTitle>
        <WikiNodeActionsMenu
          nodes={[emptyGroup]}
          node={emptyGroup}
          hasChildren
        />
      </>
    )

    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Group" }))

    const dialog = await screen.findByRole("dialog")
    const archiveButton = within(dialog).getByRole("button", {
      name: "Archive",
    })
    expect(archiveButton).toBeDisabled()
    expect(
      within(dialog).getByText(
        "Move or archive the items inside this section or group first."
      )
    ).toBeVisible()
  })

  it("starts the move picker with real top-level folders, not a synthetic Hub entry", async () => {
    const user = userEvent.setup()
    render(
      <>
        <WikiEditableTitle nodeId={emptyGroup.id}>Group</WikiEditableTitle>
        <WikiNodeActionsMenu
          nodes={[wikiSection, emptyGroup]}
          node={emptyGroup}
        />
      </>
    )

    await user.click(screen.getByRole("button", { name: "Group" }))
    const editDialog = await screen.findByRole("dialog", {
      name: "Edit Wiki Item",
    })
    await user.click(within(editDialog).getByRole("button", { name: "Move" }))

    const moveDialog = await screen.findByRole("dialog", {
      name: "Move Operations",
    })
    expect(
      within(moveDialog).getByRole("button", { name: "Canopy Wiki" })
    ).toBeVisible()
    expect(within(moveDialog).queryByRole("button", { name: "Hub" })).toBeNull()
    expect(
      within(moveDialog).queryByRole("button", { name: /AI Merge/i })
    ).not.toBeInTheDocument()
  })
})
