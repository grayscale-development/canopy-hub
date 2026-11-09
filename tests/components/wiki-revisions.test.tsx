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
import type { WikiRevisionMetadata } from "@/lib/wiki"

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

const compare = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    current: {
      id: "current-revision",
      plain_text: "Send the file tomorrow.",
      blocks: [],
      created_at: "2026-11-05T15:00:00.000Z",
    },
    selected: {
      id: "old-revision",
      plain_text: "Send the file today.",
      blocks: [],
      created_at: "2026-11-04T15:15:00.000Z",
    },
  }))
)
const success = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { success } }))

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
  getWikiRevisionComparisonAction: compare,
}))

const revisions = [
  {
    id: "current-revision",
    change_note: "Updated the send date",
    created_by: "manager",
    author: "Manager",
    created_at: "2026-11-05T15:00:00.000Z",
  },
  {
    id: "old-revision",
    change_note: "Initial page",
    created_by: "manager",
    author: "Manager",
    created_at: "2026-11-04T15:15:00.000Z",
  },
] satisfies WikiRevisionMetadata[]

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

  async function openOldVersion(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /Last updated/ }))
    await user.click(screen.getByRole("menuitem", { name: /Initial page/ }))
    return screen.findByRole("dialog", { name: /Version from/ })
  }

  it("previews the diff in a dialog and closes without restoring", async () => {
    const user = userEvent.setup()
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        revisions={revisions}
        lastUpdatedAt="2026-11-05T15:00:00.000Z"
        canRestore
      />
    )
    expect(screen.queryByText("1 change")).not.toBeInTheDocument()
    const dialog = await openOldVersion(user)
    expect(within(dialog).getByText("1 change")).toBeVisible()
    expect(
      within(dialog).getByRole("heading", { name: "Page after restore" })
    ).toBeVisible()
    expect(dialog.querySelector("mark.line-through")).toBeInTheDocument()
    expect(dialog.querySelector("mark.underline")).toBeInTheDocument()
    expect(
      within(dialog).queryByText(/words are taken out/i)
    ).not.toBeInTheDocument()
    await user.click(
      within(dialog).getAllByRole("button", { name: "Close" })[0]
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(restoreWikiRevisionAction).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("restores once and closes, or displays a failure", async () => {
    const user = userEvent.setup()
    restoreWikiRevisionAction.mockResolvedValueOnce({
      ok: false,
      message: "Restore failed",
    })
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        revisions={revisions}
        lastUpdatedAt="2026-11-05T15:00:00.000Z"
        canRestore
      />
    )
    const dialog = await openOldVersion(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Restore this version" })
    )
    expect(await within(dialog).findByText("Restore failed")).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "Restore this version" })
    )
    expect(restoreWikiRevisionAction).toHaveBeenCalledTimes(2)
    expect(restoreWikiRevisionAction.mock.calls[1][0].get("revision_id")).toBe(
      "old-revision"
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalledOnce()
    expect(success).toHaveBeenCalledWith(
      "Page restored. The older version is still in the history."
    )
  })

  it("shows history only in Editor Mode and closes it when mode is off", async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditModeToggle />
        <WikiRevisionSelector
          nodeId="page-1"
          currentRevisionId="current-revision"
          revisions={revisions}
          lastUpdatedAt="2026-11-05T15:00:00.000Z"
          canRestore
        />
      </WikiEditModeProvider>
    )
    expect(
      screen.queryByRole("button", { name: /Last updated/ })
    ).not.toBeInTheDocument()
    expect(router.replace).toHaveBeenCalledWith("/wiki/canopy-wiki/escrow")
    await user.click(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    )
    const dialog = await openOldVersion(user)
    expect(dialog).toBeVisible()
    // Radix makes the background inert while the dialog is open.
    await user.keyboard("{Escape}")
    await user.click(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows loading, errors and a retry, and prevents restoring an identical version", async () => {
    const user = userEvent.setup()
    let resolve!: (value: Awaited<ReturnType<typeof compare>>) => void
    compare.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        revisions={revisions}
        canRestore
        lastUpdatedAt="2026-11-05T15:00:00Z"
        hasMore
      />
    )
    await user.click(screen.getByRole("button", { name: /Last updated/ }))
    expect(
      screen.getByRole("menuitem", { name: "Current version" })
    ).toBeVisible()
    expect(
      screen.getByText("Showing the 30 most recent versions")
    ).toBeVisible()
    await user.click(screen.getByRole("menuitem", { name: /Initial page/ }))
    expect(screen.getByText("Loading this version…")).toBeVisible()
    resolve({
      ok: true,
      current: {
        id: "current-revision",
        plain_text: "Same",
        blocks: [],
        created_at: "2026-11-05",
      },
      selected: {
        id: "old-revision",
        plain_text: "Same",
        blocks: [],
        created_at: "2026-11-04",
      },
    })
    expect(
      await screen.findByText("This version matches the page as it is now.")
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Restore this version" })
    ).toBeDisabled()
  })

  it("offers retry after a comparison fails", async () => {
    const user = userEvent.setup()
    compare.mockRejectedValueOnce(new Error("offline"))
    render(
      <WikiRevisionSelector
        nodeId="page-1"
        currentRevisionId="current-revision"
        revisions={revisions}
        canRestore
        lastUpdatedAt="2026-11-05T15:00:00Z"
      />
    )
    await openOldVersion(user)
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("1 change")).toBeVisible()
  })

  it("keeps history hidden from readers", () => {
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiRevisionSelector
          nodeId="page-1"
          currentRevisionId="current-revision"
          revisions={revisions}
          lastUpdatedAt="2026-11-05T15:00:00.000Z"
          canRestore={false}
        />
      </WikiEditModeProvider>
    )
    expect(
      screen.queryByRole("button", { name: /Last updated/ })
    ).not.toBeInTheDocument()
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
