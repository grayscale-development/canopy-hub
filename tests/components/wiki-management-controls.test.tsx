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
    const dialog = await screen.findByRole("dialog", { name: "Edit group" })
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
    await user.click(archiveButton)
    const guard = await screen.findByRole("dialog", {
      name: "Cannot archive this group",
    })
    expect(
      within(guard).getByText("Move or archive what is inside first.")
    ).toBeVisible()
    expect(within(guard).getByRole("button", { name: "OK" })).toBeVisible()
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
      name: "Edit group",
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

  it("focuses the title when opening page details", async () => {
    const user = userEvent.setup()
    const page = { ...emptyGroup, type: "page" as const }
    render(
      <WikiNodeActionsMenu
        nodes={[page]}
        node={page}
        availableTags={["Credit"]}
      />
    )
    await user.click(
      screen.getByRole("button", { name: "More actions for this page" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit page" })
    expect(within(dialog).getByRole("textbox", { name: "Title" })).toHaveFocus()
    const tags = within(dialog).getByLabelText("Available tags")
    expect(tags.parentElement?.parentElement?.parentElement).toHaveClass(
      "[&_[aria-label='Available_tags']]:hidden"
    )
    await user.click(
      within(dialog).getByRole("textbox", { name: "Search or create a tag" })
    )
    expect(tags.parentElement?.parentElement?.parentElement).not.toHaveClass(
      "[&_[aria-label='Available_tags']]:hidden"
    )
  })

  it("confirms page archive in a dialog", async () => {
    const user = userEvent.setup()
    const page = { ...emptyGroup, type: "page" as const }
    const confirm = vi.spyOn(window, "confirm")
    render(<WikiNodeActionsMenu nodes={[page]} node={page} />)
    await user.click(
      screen.getByRole("button", { name: "More actions for this page" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Archive page" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Archive this page?",
    })
    expect(
      within(dialog).getByRole("button", { name: "Archive" })
    ).toBeVisible()
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it("previews an AI merge and archives the source page instead of deleting it", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const blocks = [
      { type: "paragraph", content: "Keep the lock steps." },
      { type: "paragraph", content: "Add the escrow note." },
    ]
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            preview: true,
            beforeText: "Keep the lock steps.",
            afterText: "Keep the lock steps.\n\nAdd the escrow note.",
            blocks,
            baseRevisionId: "target-rev",
            signedPreview: "signed-merge",
            previewSignature: "sig-merge",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, path: "/wiki/canopy-wiki/funding" }),
          { status: 200 }
        )
      )
    const source = {
      ...emptyGroup,
      id: "source-page",
      parent_id: "wiki-section",
      type: "page" as const,
      slug: "escrow-notes",
      title: "Escrow notes",
    }
    const target = {
      ...source,
      id: "target-page",
      slug: "funding-checklist",
      title: "Funding checklist",
    }

    render(
      <>
        <WikiEditableTitle nodeId={source.id}>Escrow notes</WikiEditableTitle>
        <WikiNodeActionsMenu
          nodes={[wikiSection, source, target]}
          node={source}
        />
      </>
    )

    await user.click(
      screen.getByRole("button", { name: "More actions for this page" })
    )
    expect(screen.getByRole("menuitem", { name: "Edit details" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Move to..." })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Archive page" })).toBeVisible()
    await user.click(
      screen.getByRole("menuitem", { name: "Merge into another page..." })
    )
    const picker = await screen.findByRole("dialog", {
      name: "Merge into another page",
    })
    expect(
      within(picker).getByRole("button", { name: "Review merge" })
    ).toBeDisabled()
    await user.click(
      within(picker).getByRole("button", { name: "Canopy Wiki" })
    )
    await user.click(
      within(picker).getByRole("button", { name: "Funding checklist" })
    )
    await user.click(
      within(picker).getByRole("button", { name: "Review merge" })
    )

    const confirm = await screen.findByRole("dialog", { name: "Review merge" })
    expect(confirm).toHaveTextContent(
      "This adds the words from “Escrow notes” to “Funding checklist”, then archives “Escrow notes” once “Funding checklist” is saved."
    )
    expect(confirm).not.toHaveTextContent(/delete/i)
    expect(
      await within(confirm).findByRole("heading", { name: "After the merge" })
    ).toBeVisible()
    expect(within(confirm).getByText("1 change")).toBeVisible()
    expect(
      within(confirm).getAllByText("Add the escrow note.").length
    ).toBeGreaterThan(0)

    await user.click(
      within(confirm).getByRole("button", {
        name: "Merge and archive this page",
      })
    )

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/wiki/canopy-wiki/funding")
    })
    const previewBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(previewBody.get("preview")).toBe("1")
    expect(previewBody.get("source_page_id")).toBe("source-page")
    expect(previewBody.get("target_page_id")).toBe("target-page")
    const applyBody = fetchMock.mock.calls[1]?.[1]?.body as FormData
    expect(applyBody.get("apply_preview")).toBe("1")
    expect(applyBody.get("signed_preview")).toBe("signed-merge")
    expect(applyBody.get("preview_signature")).toBe("sig-merge")
    expect(applyBody.get("source_page_id")).toBe("source-page")
    expect(applyBody.get("target_page_id")).toBe("target-page")
  })
})
