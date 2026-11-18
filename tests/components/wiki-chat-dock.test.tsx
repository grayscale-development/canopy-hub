// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  WikiChatModalProvider,
  useWikiChatModal,
} from "@/components/wiki/wiki-chat-modal"
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"

const route = vi.hoisted(() => ({ pathname: "/home" }))
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }))

function Harness({
  signedIn = true,
  canUseMilo = true,
}: {
  signedIn?: boolean
  canUseMilo?: boolean
}) {
  return (
    <TooltipProvider>
      <WikiChatModalProvider signedIn={signedIn} canUseMilo={canUseMilo}>
        <WikiHeaderSearch />
        <InnerControl />
        <DropdownMenu>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Menu item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </WikiChatModalProvider>
    </TooltipProvider>
  )
}
function InnerControl() {
  const { openWithDraft } = useWikiChatModal()
  return <button onClick={() => openWithDraft("draft")}>Open draft</button>
}
function stream(answer: string) {
  const events = [
    { type: "meta", threadId: "thread-1" },
    { type: "token", token: answer },
    {
      type: "done",
      threadId: "thread-1",
      citations: [
        { title: "Loan policy", url: "/wiki/loan-policy", snippet: "Source" },
      ],
    },
  ]
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
          )
        )
        controller.close()
      },
    }),
  } as Response
}

describe("floating Milo", () => {
  beforeEach(() => {
    localStorage.clear()
    route.pathname = "/home"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => stream("See the Loan policy."))
    )
    let id = 0
    vi.stubGlobal("crypto", {
      ...window.crypto,
      randomUUID: () => `message-${++id}`,
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("toggles by launcher and shortcut, focuses the composer and returns focus", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const launcher = screen.getByRole("button", { name: "Ask Milo" })
    expect(launcher).toHaveAttribute("aria-expanded", "false")
    expect(
      document.getElementById(launcher.getAttribute("aria-controls")!)
    ).toBeInTheDocument()
    await user.click(launcher)
    const dialog = screen.getByRole("dialog", { name: "Milo" })
    expect(dialog).not.toHaveAttribute("aria-modal")
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Ask a follow-up" })
      ).toHaveFocus()
    )
    const inner = screen.getByRole("textbox", { name: "Ask a follow-up" })
    const prevent = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault()
    }
    inner.addEventListener("keydown", prevent)
    fireEvent.keyDown(inner, { key: "Escape" })
    expect(dialog).toBeVisible()
    inner.removeEventListener("keydown", prevent)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(launcher).toHaveFocus())
    expect(dialog).not.toBeVisible()
    expect(localStorage.getItem("milo-chat-open")).toBe("false")
    fireEvent.keyDown(window, { key: "j", ctrlKey: true })
    expect(dialog).toBeVisible()
    fireEvent.keyDown(window, { key: "j", metaKey: true })
    expect(dialog).not.toBeVisible()
  })

  it("lets a Radix menu handle Escape before closing the panel", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Ask Milo" }))
    await user.click(screen.getByRole("button", { name: "Open menu" }))
    expect(
      await screen.findByRole("menuitem", { name: "Menu item" })
    ).toBeVisible()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menuitem", { name: "Menu item" })).toBeNull()
    expect(screen.getByRole("dialog", { name: "Milo" })).toBeVisible()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Milo" })).toBeNull()
  })

  it("keeps the panel open on source navigation and preserves the thread", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(
      screen.getByRole("textbox", { name: "Ask Milo" }),
      "Where is the loan policy?"
    )
    await user.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog", { name: "Milo" })
    const link = await screen.findByRole("link", { name: "Loan policy" })
    expect(localStorage.getItem("milo-active-thread")).toBe("thread-1")
    link.addEventListener("click", (event) => event.preventDefault())
    await user.click(link)
    expect(dialog).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(screen.getByRole("button", { name: "Ask Milo" }))
    expect(screen.getByText("Where is the loan policy?")).toBeVisible()
  })

  it("restores an open conversation from local storage", async () => {
    localStorage.setItem("milo-chat-open", "true")
    localStorage.setItem("milo-active-thread", "thread-1")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          messages: [
            { id: "answer", role: "assistant", content: "Restored answer" },
          ],
        }),
      }))
    )
    render(<Harness />)
    expect(await screen.findByRole("dialog", { name: "Milo" })).toBeVisible()
    expect(await screen.findByText("Restored answer")).toBeVisible()
  })

  it("updates a draft when reopening a mounted chat and shows the tip once", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    expect(await screen.findByText(/Milo moved here/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Dismiss Milo tip" }))
    await user.click(screen.getByRole("button", { name: "Ask Milo" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(screen.getByRole("button", { name: "Open draft" }))
    expect(
      screen.getByRole("textbox", { name: "Ask a follow-up" })
    ).toHaveValue("draft")
    unmount()
    render(<Harness />)
    await act(async () => {})
    expect(screen.queryByText(/Milo moved here/)).toBeNull()
  })

  it("gates login and signed-out users and shows a placeholder without beta access", async () => {
    const user = userEvent.setup()
    const view = render(<Harness signedIn={false} />)
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()
    route.pathname = "/login"
    view.rerender(<Harness />)
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()
    route.pathname = "/home"
    view.rerender(<Harness canUseMilo={false} />)
    await user.click(screen.getByRole("button", { name: "Ask Milo" }))
    expect(screen.getByText("Search coming soon")).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })
})
