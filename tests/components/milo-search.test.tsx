// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WikiChatModalProvider } from "@/components/wiki/wiki-chat-modal"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push }),
}))
const results = [
  {
    id: "person",
    title: "Person",
    url: "/people",
    type: "employee",
    snippet: "Operations",
  },
  {
    id: "page",
    title: "Policy",
    url: "/wiki/1",
    type: "wiki_page",
    snippet: "Policies",
  },
  {
    id: "tag",
    title: "Policy tag",
    url: "/wiki/tags?tag=Policy",
    type: "wiki_tag",
    snippet: "Global",
  },
]
const searchResponse = () => ({ ok: true, json: async () => ({ results }) })
function stream(answer: string) {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              { type: "token", token: answer },
              { type: "done", threadId: "thread", citations: [] },
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join("")
          )
        )
        controller.close()
      },
    }),
  }
}
// The panel also reads the saved corner; keep that out of the search assertions.
function stubFetch(mock: unknown) {
  const forward = mock as (url: string, init?: unknown) => unknown
  vi.stubGlobal("fetch", (url: string, init?: unknown) =>
    url === "/api/milo/preferences"
      ? Promise.resolve({ ok: false })
      : forward(url, init)
  )
}
function panel(canUseMilo = true) {
  return (
    <TooltipProvider>
      <WikiChatModalProvider
        signedIn
        userId="test-user"
        canUseMilo={canUseMilo}
      >
        <div>Home</div>
      </WikiChatModalProvider>
    </TooltipProvider>
  )
}

describe("Milo search", () => {
  beforeEach(() => {
    localStorage.clear()
    push.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("debounces, aborts stale requests and hides results for source material", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<
      (url: string, options: { signal: AbortSignal }) => Promise<never>
    >(() => new Promise(() => {}))
    stubFetch(fetchMock)
    render(panel(false))
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: "Ask Milo" }))
    const input = screen.getByRole("textbox", {
      name: "Search people, branches and documents",
    })
    fireEvent.change(input, { target: { value: "po" } })
    await act(() => vi.advanceTimersByTimeAsync(199))
    expect(fetchMock).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    fireEvent.change(input, { target: { value: "policy" } })
    expect(signal.aborted).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fireEvent.change(input, { target: { value: "policy\nsource" } })
    expect((fetchMock.mock.calls[1][1].signal as AbortSignal).aborted).toBe(
      true
    )
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fireEvent.change(input, { target: { value: "a".repeat(201) } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("navigates highlighted results and keeps the panel open; plain Enter sends", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("/api/wiki/search")
        ? searchResponse()
        : stream("See [Policy](/wiki/1).")
    )
    stubFetch(fetchMock)
    const user = userEvent.setup()
    render(panel())
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    const dialog = screen.getByRole("dialog", { name: "Milo" })
    const input = within(dialog).getByRole("textbox", {
      name: "Ask a follow-up",
    })
    await user.type(input, "policy")
    const list = await screen.findByRole("listbox", { name: "Search results" })
    expect(
      within(list)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual([
      expect.stringContaining("Policy"),
      expect.stringContaining("Policy tag"),
      expect.stringContaining("Person"),
    ])
    await user.keyboard("{ArrowDown}{ArrowDown}")
    const active = within(list).getAllByRole("option")[1]
    expect(input).toHaveAttribute("aria-activedescendant", active.id)
    expect(active).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{Enter}")
    expect(push).toHaveBeenCalledWith("/wiki/tags?tag=Policy")
    expect(dialog).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/wiki/chat")
    ).toHaveLength(0)
    await user.type(input, "policy")
    await screen.findByRole("listbox")
    await user.keyboard("{Enter}")
    expect(await screen.findByText("Matching pages")).toBeVisible()
    expect(await screen.findByText(/See/)).toBeVisible()
    const matching = screen.getByText("Matching pages").parentElement!
    expect(
      within(matching).queryByRole("link", { name: /^Policy$/ })
    ).toBeNull()
    expect(
      within(matching).getByRole("link", { name: "Policy tag" })
    ).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/wiki/chat")
    ).toHaveLength(1)
  })

  it("searches without any chat requests and supports Shift+Enter", async () => {
    const fetchMock = vi.fn<
      (url: string) => Promise<ReturnType<typeof searchResponse>>
    >(async () => searchResponse())
    stubFetch(fetchMock)
    localStorage.setItem("milo-active-thread", "old-thread")
    const user = userEvent.setup()
    render(panel(false))
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    const dialog = screen.getByRole("dialog", { name: "Search" })
    const input = within(dialog).getByRole("textbox")
    await user.type(input, "person")
    await screen.findByRole("listbox")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await user.keyboard("{Shift>}{Enter}{/Shift}")
    expect(input).toHaveValue("person\n")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith("/api/wiki/search")
      )
    ).toBe(true)
    expect(dialog).not.toHaveTextContent(/Forbidden|Attach|Ask a question/)
  })
  it("fetches matches for a quickly submitted question and sends pasted multiline text", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("/api/wiki/search")
        ? searchResponse()
        : stream("A plain answer.")
    )
    stubFetch(fetchMock)
    const user = userEvent.setup()
    render(panel())
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    const input = await screen.findByRole("textbox", {
      name: "Ask a follow-up",
    })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: "policy" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(await screen.findByText("Matching pages")).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/wiki/search"))
    ).toHaveLength(1)
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: "long source\nsecond line" } })
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/wiki/chat")
    ).toHaveLength(1)
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/wiki/chat")
      ).toHaveLength(2)
    )
    expect(
      fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/wiki/search"))
    ).toHaveLength(1)
  })
})
