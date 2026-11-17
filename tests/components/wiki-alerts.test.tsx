// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WikiAlerts } from "@/components/wiki/wiki-alerts"
import type { WikiNodeRow } from "@/lib/wiki"

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  update: null as Record<string, unknown> | null,
  error: false,
}))
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({
              range: async () => ({ data: state.rows, error: null }),
            }),
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        state.update = values
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () =>
                  state.error
                    ? { data: null, error: {} }
                    : { data: { id: "alert" }, error: null },
              }),
            }),
          }),
        }
      },
    }),
  }),
}))
const nodes = [
  {
    id: "a",
    short_id: 1,
    parent_id: null,
    title: "First",
    status: "published",
  },
  {
    id: "b",
    short_id: 2,
    parent_id: null,
    title: "Second",
    status: "published",
  },
] as WikiNodeRow[]
beforeEach(() => {
  state.rows = []
  state.update = null
  state.error = false
})
afterEach(cleanup)

describe("wiki alerts", () => {
  it("shows a compact empty state", async () => {
    render(<WikiAlerts nodes={nodes} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /Alerts 0/ }))
    expect(await screen.findByText("No open alerts.")).toBeInTheDocument()
  })
  it("explains an unavailable recommendation and dismisses the selected alert", async () => {
    state.rows = [
      { id: "alert", page_id: "a", other_page_id: "b", recommendation: null },
    ]
    render(<WikiAlerts nodes={nodes} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /Alerts 1/ }))
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("These pages may contain duplicate information.")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("No applicable recommendation yet.")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "Apply recommendation" })
    ).toBeDisabled()
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }))
    expect(await screen.findByText("No open alerts.")).toBeInTheDocument()
    expect(state.update).toEqual({
      status: "dismissed",
      dismissed_by: "manager",
      dismissed_at: expect.any(String),
    })
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.getByRole("button", { name: /Alerts 0/ })).toBeInTheDocument()
  })
  it("leaves a failed dismissal visible", async () => {
    state.rows = [
      {
        id: "alert",
        page_id: "a",
        other_page_id: "b",
        recommendation: { summary: "Possible overlap" },
      },
    ]
    state.error = true
    render(<WikiAlerts nodes={nodes} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /Alerts 1/ }))
    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not dismiss"
    )
    expect(screen.getByText("Possible overlap")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Apply recommendation" })
    ).toBeDisabled()
  })
})
