// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it } from "vitest"

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
