// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  writes: [] as unknown[],
  error: null as { message: string } | null,
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/wiki/1" }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
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
})
afterEach(cleanup)

it("sends the selected type and page by default, then resets the form", async () => {
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  const dialog = screen.getByRole("dialog", { name: "Submit feedback" })
  expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled()
  await user.click(within(dialog).getByLabelText("Idea"))
  await user.type(within(dialog).getByLabelText("Message"), "A useful idea")
  await user.click(within(dialog).getByRole("button", { name: "Send" }))
  expect(state.writes).toEqual([
    {
      created_by: "viewer",
      type: "idea",
      message: "A useful idea",
      page_path: "/wiki/1",
    },
  ])
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  expect(screen.getByLabelText("Message")).toHaveValue("")
})

it("allows excluding the page and keeps the message on failure", async () => {
  state.error = { message: "offline" }
  const user = userEvent.setup()
  render(<FeedbackDialog trigger={<button>Submit Feedback</button>} />)
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }))
  await user.click(screen.getByLabelText("Include this page"))
  await user.type(screen.getByLabelText("Message"), "Broken")
  await user.click(screen.getByRole("button", { name: "Send" }))
  expect(state.writes[0]).toMatchObject({ page_path: null })
  expect(screen.getByRole("alert")).toHaveTextContent("Could not send feedback")
  expect(screen.getByLabelText("Message")).toHaveValue("Broken")
})
