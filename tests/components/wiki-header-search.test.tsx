// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
const modal = vi.hoisted(() => ({
  available: true,
  openWithPrompt: vi.fn(),
  openWithDraft: vi.fn(),
}))
vi.mock("@/components/wiki/wiki-chat-modal", () => ({
  useWikiChatModal: () => modal,
}))
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
describe("home Milo input", () => {
  it("opens Milo with the question and has no tag dropdown", async () => {
    const user = userEvent.setup()
    render(<WikiHeaderSearch />)
    await user.type(
      screen.getByRole("textbox", { name: "Ask Milo" }),
      "Loans{Enter}"
    )
    expect(modal.openWithPrompt).toHaveBeenCalledWith("Loans")
    expect(screen.queryByRole("listbox")).toBeNull()
  })
})
