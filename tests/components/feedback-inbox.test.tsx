// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import {
  FeedbackInbox,
  type FeedbackItem,
} from "@/app/settings/[section]/feedback-inbox"

afterEach(cleanup)
const item: FeedbackItem = {
  id: "1",
  type: "bug",
  message: "Broken page\nMore detail",
  pagePath: "/wiki/1",
  status: "open",
  submitter: "Viewer",
  createdAt: "2026-11-19T00:00:00Z",
}

it("distinguishes an empty inbox from a filter with no matches", async () => {
  render(<FeedbackInbox initialItems={[]} />)
  expect(screen.getByText(/No feedback yet/)).toBeVisible()
})

it("filters the list and opens the complete message and page", async () => {
  render(<FeedbackInbox initialItems={[item]} />)
  await userEvent.selectOptions(screen.getByLabelText("Type"), "idea")
  expect(screen.getByText("No feedback matches these filters.")).toBeVisible()
  await userEvent.selectOptions(screen.getByLabelText("Type"), "bug")
  await userEvent.click(screen.getByRole("button", { name: /Broken page/ }))
  const detail = screen.getByRole("dialog", { name: "Bug" })
  expect(within(detail).getByText(/More detail/)).toBeVisible()
  expect(within(detail).getByRole("link", { name: /^\// })).toHaveAttribute(
    "href",
    "/wiki/1"
  )
})

it("copies an item link using the current origin", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const copyable = {
    ...item,
    id: "8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9",
  }
  render(<FeedbackInbox initialItems={[copyable]} />)
  await userEvent.click(screen.getByRole("button", { name: "Copy link" }))
  expect(writeText).toHaveBeenCalledWith(
    `http://localhost:3000/settings/feedback?item=${copyable.id}`
  )
})

it("copies a Milo link using the Milo query key", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  render(
    <FeedbackInbox
      initialItems={[
        {
          ...item,
          id: "8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9",
          type: "milo",
          milo: {
            question: "Question",
            answer: "Answer",
            addedToEvalSet: false,
            sources: [],
          },
        },
      ]}
    />
  )
  await userEvent.click(screen.getByRole("button", { name: "Copy link" }))
  expect(writeText).toHaveBeenCalledWith(
    "http://localhost:3000/settings/feedback?milo=8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9"
  )
})

it("opens a linked item and switches to its status", async () => {
  const linked = {
    ...item,
    id: "8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9",
    status: "resolved" as const,
    githubIssueUrl:
      "https://github.com/grayscale-development/canopy-hub/issues/254",
  }
  window.history.replaceState({}, "", `/settings/feedback?item=${linked.id}`)
  render(<FeedbackInbox initialItems={[linked]} />)
  expect(await screen.findByRole("dialog", { name: "Bug" })).toBeVisible()
  expect(
    screen.getByRole("button", { name: "Resolved", hidden: true })
  ).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("link", { name: "Issue #254" })).toHaveAttribute(
    "href",
    linked.githubIssueUrl
  )
  window.history.replaceState({}, "", "/")
})
