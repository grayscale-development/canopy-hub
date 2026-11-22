// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  writes: [] as unknown[],
  error: null as { message: string } | null,
  success: vi.fn(),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/wiki/1" }))
vi.mock("sonner", () => ({ toast: { success: state.success } }))
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "viewer" } }, error: null }),
    },
    from: () => ({
      insert: async (value: unknown) => {
        state.writes.push(value)
        return { error: state.error }
      },
    }),
  }),
}))
import { FeedbackDialog } from "@/components/feedback-dialog"

beforeEach(() => {
  state.writes = []
  state.error = null
  state.success.mockClear()
})
afterEach(cleanup)

it("sends other and the page by default, then resets after success", async () => {
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  const dialog = screen.getByRole("dialog", { name: "Send feedback" })
  expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled()
  expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument()
  expect(
    within(dialog).getByRole("switch", { name: "Includes a link to this page" })
  ).toBeChecked()
  await user.type(within(dialog).getByLabelText("Message"), "A useful idea")
  await user.click(within(dialog).getByRole("button", { name: "Send" }))
  expect(state.writes).toEqual([
    {
      created_by: "viewer",
      type: "other",
      message: "A useful idea",
      page_path: "/wiki/1",
    },
  ])
  expect(state.success).toHaveBeenCalledWith("Thanks, we read every message.")
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  expect(screen.getByLabelText("Message")).toHaveValue("")
  expect(
    screen.getByRole("switch", { name: "Includes a link to this page" })
  ).toBeChecked()
})

it("supports an optional type and excluding the page, and resets both after success", async () => {
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  await user.click(screen.getByRole("button", { name: "Add a type" }))
  expect(screen.getByLabelText("Type")).toHaveFocus()
  await user.selectOptions(screen.getByLabelText("Type"), "idea")
  await user.click(
    screen.getByRole("switch", { name: "Includes a link to this page" })
  )
  await user.type(screen.getByLabelText("Message"), "A useful idea")
  await user.click(screen.getByRole("button", { name: "Send" }))
  expect(state.writes[0]).toMatchObject({ type: "idea", page_path: null })
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  expect(
    screen.getByRole("switch", { name: "Includes a link to this page" })
  ).toBeChecked()
  await user.click(screen.getByRole("button", { name: "Add a type" }))
  expect(screen.getByLabelText("Type")).toHaveValue("other")
})

it("keeps the message and choices on failure and can close with Escape", async () => {
  state.error = { message: "offline" }
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  await user.click(
    screen.getByRole("switch", { name: "Includes a link to this page" })
  )
  await user.type(screen.getByLabelText("Message"), "Broken")
  await user.click(screen.getByRole("button", { name: "Send" }))
  expect(state.writes[0]).toMatchObject({ type: "other", page_path: null })
  expect(screen.getByRole("alert")).toHaveTextContent("Could not send feedback")
  expect(screen.getByLabelText("Message")).toHaveValue("Broken")
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it("shows the character count only near the limit", async () => {
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  const message = screen.getByLabelText("Message")
  expect(screen.queryByText(/5,000/)).not.toBeInTheDocument()
  await user.click(message)
  await user.paste("x".repeat(4500))
  expect(message).toHaveAttribute("aria-describedby", "feedback-count")
  expect(screen.getByText("4500 / 5,000")).toBeInTheDocument()
})
