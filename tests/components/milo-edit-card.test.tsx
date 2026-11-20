// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import { WikiChatCard } from "@/components/wiki/wiki-chat-card"
import { displayCard } from "@/lib/milo/chat-cards"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("shows the safe fallback and warnings for actual non-text changes separately", () => {
  const proposal = {
    type: "proposed-edit",
    id: "proposal",
    pageTitle: "Policy",
    before: "Old words.",
    after: "New words.",
  }
  const { rerender } = render(
    <WikiChatCard
      card={displayCard({ ...proposal, keptOriginal: true, nonTextNotes: [] })}
      threadId={null}
    />
  )
  expect(screen.getByText("Kept as it was")).toBeVisible()
  expect(screen.getByText(/Milo added only the new facts/)).toBeVisible()
  expect(screen.queryByText("Needs a manual check")).not.toBeInTheDocument()
  // A new card is mounted when another proposal arrives.
  rerender(
    <WikiChatCard
      key="new-proposal"
      card={displayCard({
        ...proposal,
        nonTextNotes: ["A picture was put in. Check the page."],
      })}
      threadId={null}
    />
  )
  expect(screen.getByText("Needs a manual check")).toBeVisible()
  expect(
    screen.getByText("A picture was put in. Check the page.")
  ).toBeVisible()
  expect(screen.queryByText("Kept as it was")).not.toBeInTheDocument()
})

it.each(["", " Search indexing couldn't finish; please reindex this page."])(
  "shows one undo notice and preserves indexing details%s",
  async (extraNotice) => {
    const card = {
      type: "applied-edit" as const,
      id: "edit",
      pageTitle: "Policy",
      undoAvailable: true,
    }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          card: { ...card, undone: true, undoAvailable: false },
          notice: `Previous version restored.${extraNotice}`,
        }),
      })
    )
    const user = userEvent.setup()
    const { unmount } = render(
      <WikiChatCard card={card} threadId="thread" messageId="message" />
    )
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(screen.getAllByText(/Previous version restored\./)).toHaveLength(1)
    if (extraNotice)
      expect(screen.getByRole("status")).toHaveTextContent(extraNotice.trim())
    unmount()
    render(
      <WikiChatCard
        card={{ ...card, undone: true, undoAvailable: false }}
        threadId="thread"
        messageId="message"
      />
    )
    expect(screen.getAllByText("Previous version restored.")).toHaveLength(1)
  }
)
