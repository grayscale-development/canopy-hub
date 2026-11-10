// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  path: "/wiki/old-loan_guide/123/closing",
  openWithPrompt: vi.fn(),
}))
vi.mock("next/navigation", () => ({ usePathname: () => state.path }))
vi.mock("@/components/wiki/wiki-chat-modal", () => ({
  useWikiChatModal: () => ({ openWithPrompt: state.openWithPrompt }),
}))
import WikiNotFound from "@/app/wiki/not-found"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("outdated wiki links", () => {
  it("suggests words from the path, lets the user edit them, and opens Milo", async () => {
    const user = userEvent.setup()
    render(<WikiNotFound />)
    const search = screen.getByRole("textbox", { name: "Search with Milo" })
    expect(search).toHaveValue("old loan guide closing")
    expect(
      screen.getByRole("link", { name: "Go to wiki home" })
    ).toHaveAttribute("href", "/wiki")
    await user.clear(search)
    await user.type(search, "Closing guide")
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(state.openWithPrompt).toHaveBeenCalledWith("Closing guide")
  })

  it("limits words, decodes safely, and renders path text as input data", () => {
    state.path = "/wiki/1/%3Cscript%3E/a_b-c/d/e/f/g/h/i/j"
    render(<WikiNotFound />)
    expect(
      screen.getByRole("textbox", { name: "Search with Milo" })
    ).toHaveValue("<script> a b c d e f g")
    expect(document.querySelector("script")).toBeNull()
  })

  it("leaves unknown numeric paths empty and tolerates malformed escapes", () => {
    state.path = "/wiki/1/999999"
    const { rerender } = render(<WikiNotFound />)
    expect(
      screen.getByRole("textbox", { name: "Search with Milo" })
    ).toHaveValue("")
    state.path = "/wiki/bad%escape"
    rerender(<WikiNotFound />)
    expect(
      screen.getByRole("textbox", { name: "Search with Milo" })
    ).toHaveValue("bad%escape")
  })
})
