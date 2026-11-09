// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiEditModeProvider,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import {
  formatRevisionNote,
  WikiRevisionSelector,
} from "@/components/wiki/wiki-revisions"
import type { WikiRevisionRow } from "@/lib/wiki"

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

const restoreWikiRevisionAction = vi.hoisted(() =>
  vi.fn<(formData: FormData) => Promise<{ ok: boolean; message: string }>>(
    async () => ({
      ok: true,
      message: "Revision restored.",
    })
  )
)

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/wiki/canopy-wiki/escrow",
  useSearchParams: () => new URLSearchParams("revision=old-revision"),
}))

vi.mock("@/app/wiki/actions", () => ({
  restoreWikiRevisionAction,
}))

const revisions = [
  {
    id: "current-revision",
    node_id: "page-1",
    blocks: [],
    plain_text: "Send the file tomorrow.",
    change_note: "Updated the send date",
    created_by: "manager",
    created_at: "2026-11-05T15:00:00.000Z",
  },
  {
    id: "old-revision",
    node_id: "page-1",
    blocks: [],
    plain_text: "Send the file today.",
    change_note: "Initial page",
    created_by: "manager",
    created_at: "2026-11-04T15:15:00.000Z",
  },
] satisfies WikiRevisionRow[]

describe("WikiRevisionSelector", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    restoreWikiRevisionAction.mockResolvedValue({
      ok: true,
      message: "Revision restored.",
    })
  })

  it("previews a restore as a new copy and reports a failure", async () => {
    const user = userEvent.setup()
    restoreWikiRevisionAction.mockResolvedValueOnce({
      ok: false,
      message: "That version could not be found on this page.",
    })
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        selectedRevisionId="old-revision"
        revisions={revisions}
        canRestore
      />
    )

    const dateButton = screen.getByRole("button", { name: "Last updated" })
    expect(dateButton).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("combobox", { name: "Page versions" })
    ).not.toBeInTheDocument()
    dateButton.focus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("menu")).toBeVisible()
    await user.keyboard("{Escape}")
    expect(screen.getByText("1 change")).toBeVisible()
    expect(screen.queryByText(/words are taken out/i)).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("heading", { name: "Page after restore" }).length
    ).toBeGreaterThan(0)

    await user.click(
      screen.getByRole("button", { name: "Restore this version" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Restore this version?",
    })
    expect(dialog).toHaveTextContent(
      "This saves a new copy of the older version and makes that copy the current page."
    )
    expect(
      within(dialog).getByRole("heading", { name: "Page after restore" })
    ).toBeVisible()

    await user.click(
      within(dialog).getByRole("button", { name: "Restore this version" })
    )

    expect(restoreWikiRevisionAction).toHaveBeenCalledTimes(1)
    const formData = restoreWikiRevisionAction.mock.calls[0][0]
    expect(formData.get("node_id")).toBe("page-1")
    expect(formData.get("revision_id")).toBe("old-revision")
    expect(
      await screen.findByText("That version could not be found on this page.")
    ).toBeVisible()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("hides the version menu until Editor Mode is on", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditModeToggle />
        <WikiRevisionSelector
          nodeId="page-1"
          currentRevisionId="current-revision"
          selectedRevisionId="old-revision"
          revisions={revisions}
          canRestore
        />
      </WikiEditModeProvider>
    )

    expect(screen.getByText("Last updated").tagName).toBe("P")
    expect(
      screen.queryByRole("button", { name: "Last updated" })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Restore this version" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("1 change")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    )

    expect(screen.getByRole("button", { name: "Last updated" })).toBeVisible()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Restore this version" })
    ).toBeVisible()
    expect(screen.getByText("1 change")).toBeVisible()
  })

  it("hides the version menu from readers even if edit mode was saved", () => {
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiRevisionSelector
          nodeId="page-1"
          currentRevisionId="current-revision"
          selectedRevisionId="old-revision"
          revisions={revisions}
          canRestore={false}
        />
      </WikiEditModeProvider>
    )

    expect(screen.getByText("Last updated").tagName).toBe("P")
    expect(
      screen.queryByRole("button", { name: "Last updated" })
    ).not.toBeInTheDocument()
    expect(router.replace).toHaveBeenCalledWith("/wiki/canopy-wiki/escrow")
  })

  it("hides restore when the person cannot manage the wiki", () => {
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        selectedRevisionId="old-revision"
        revisions={revisions}
        canRestore={false}
      />
    )

    expect(
      screen.queryByRole("button", { name: "Restore this version" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("1 change")).toBeVisible()
  })
})

describe("formatRevisionNote", () => {
  it("shows a restore time in the reader's own time zone", () => {
    const expected = new Date("Nov 9, 2026, 7:59 PM UTC").toLocaleString(
      undefined,
      { dateStyle: "medium", timeStyle: "short" }
    )

    expect(formatRevisionNote("Restored from Nov 9, 2026, 7:59 PM UTC")).toBe(
      `Restored from ${expected}`
    )
    expect(
      formatRevisionNote("Restored from Nov 9, 2026, 7:59 PM UTC")
    ).not.toContain("UTC")
  })

  it("leaves other notes alone", () => {
    expect(formatRevisionNote("Initial page")).toBe("Initial page")
    expect(formatRevisionNote("Restored from sometime UTC")).toBe(
      "Restored from sometime UTC"
    )
    expect(formatRevisionNote(null)).toBe("")
  })
})
