// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const openWithPrompt = vi.hoisted(() => vi.fn())
vi.mock("@/components/wiki/wiki-chat-modal", () => ({
  useWikiChatModal: () => ({ openWithPrompt }),
}))
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe("header tag search", () => {
  it("shows scoped tag results and still asks Milo on Enter", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "s",
              title: "Loans",
              type: "wiki_tag",
              snippet: "Operations",
              url: "/wiki/tags?tag=Loans&section=s#tag-loans-s",
            },
            {
              id: "p",
              title: "Page",
              type: "wiki_page",
              snippet: "Wiki",
              url: "/wiki/page",
            },
          ],
        }),
      }))
    )
    render(<WikiHeaderSearch />)
    const input = screen.getByRole("textbox", { name: "Ask Milo" })
    await user.type(input, "Loans")
    const result = await screen.findByRole("link", {
      name: /Loans.*Operations/,
    })
    expect(result).toHaveAttribute(
      "href",
      "/wiki/tags?tag=Loans&section=s#tag-loans-s"
    )
    expect(screen.queryByRole("link", { name: /Page/ })).toBeNull()
    await user.keyboard("{Enter}")
    expect(openWithPrompt).toHaveBeenCalledWith("Loans")
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Loans/ })).toBeNull()
    )
  })
})
