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
  MiloPageContext,
  useWikiChatModal,
} from "@/components/wiki/wiki-chat-modal"
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"

const route = vi.hoisted(() => ({ pathname: "/home", push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: route.push }),
}))

function Harness({
  signedIn = true,
  canUseMilo = true,
}: {
  signedIn?: boolean
  canUseMilo?: boolean
}) {
  return (
    <TooltipProvider>
      <WikiChatModalProvider
        signedIn={signedIn}
        userId={signedIn ? "test-user" : null}
        canUseMilo={canUseMilo}
      >
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
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(hover: hover) and (pointer: fine)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
        configurable: true,
        value: () => {},
      })
    }
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
    const launcher = await screen.findByRole("button", { name: "Ask Milo" })
    expect(launcher).toHaveAttribute("aria-expanded", "false")
    expect(document.body).toHaveAttribute("data-milo-launcher", "bottom")
    await waitFor(() =>
      expect(
        document.body.style.getPropertyValue("--milo-launcher-clearance")
      ).toBe("72px")
    )
    expect(
      document.getElementById(launcher.getAttribute("aria-controls")!)
    ).toBeInTheDocument()
    await user.click(launcher)
    expect(document.body).toHaveAttribute("data-milo-launcher", "bottom")
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
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
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
    const link = (
      await screen.findAllByRole("link", { name: "Loan policy" })
    )[0]
    expect(localStorage.getItem("milo-active-thread")).toBe("thread-1")
    link.addEventListener("click", (event) => event.preventDefault())
    await user.click(link)
    expect(dialog).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    expect(screen.getByText("Where is the loan policy?")).toBeVisible()
  })

  it("updates page context on navigation and reattaches it after leaving a page", async () => {
    const user = userEvent.setup()
    route.pathname = "/wiki/1/2"
    const view = (pageId: string, title: string) => (
      <TooltipProvider>
        <WikiChatModalProvider signedIn userId="test-user" canUseMilo>
          <MiloPageContext pageId={pageId} title={title} />
        </WikiChatModalProvider>
      </TooltipProvider>
    )
    const { rerender } = render(view("a", "Page A"))
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    await user.click(
      await screen.findByRole("button", { name: "Remove Page A page context" })
    )
    expect(screen.queryByText("About: Page A")).not.toBeInTheDocument()
    route.pathname = "/wiki/1/3"
    rerender(view("b", "Page B"))
    expect(await screen.findByText("About: Page B")).toBeVisible()
    route.pathname = "/wiki/1/2"
    rerender(view("a", "Page A"))
    expect(await screen.findByText("About: Page A")).toBeVisible()
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
    expect(await screen.findByText(/Milo lives here now/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Dismiss Milo tip" }))
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(screen.getByRole("button", { name: "Open draft" }))
    expect(
      screen.getByRole("textbox", { name: "Ask a follow-up" })
    ).toHaveValue("draft")
    unmount()
    render(<Harness />)
    await act(async () => {})
    expect(screen.queryByText(/Milo lives here now/)).toBeNull()
  })

  it("keeps the tip until it is dismissed or Milo is opened", async () => {
    const user = userEvent.setup()
    const first = render(<Harness />)
    expect(await screen.findByText(/Milo lives here now/)).toBeVisible()
    first.unmount()
    const second = render(<Harness />)
    expect(await screen.findByText(/Milo lives here now/)).toBeVisible()
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    second.unmount()
    localStorage.removeItem("milo-chat-open")
    render(<Harness />)
    await act(async () => {})
    expect(screen.queryByText(/Milo lives here now/)).toBeNull()
  })

  it("never shows or marks the tip seen on a coarse pointer", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(await screen.findByRole("button", { name: "Ask Milo" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByText(/Milo lives here now/)).toBeNull()
    expect(localStorage.getItem("milo-moved-tip-seen")).toBeNull()
  })

  it.each([
    ["MacIntel", "⌘J"],
    ["Win32", "Ctrl+J"],
  ])(
    "shows only the platform shortcut on %s and remembers dismissal",
    async (platform, shortcut) => {
      vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
      const user = userEvent.setup()
      const first = render(<Harness />)
      const tip = await screen.findByText(`Milo lives here now · ${shortcut}`)
      expect(tip).toBeVisible()
      expect(tip.parentElement).toHaveClass("top-1/2")
      await user.click(screen.getByRole("button", { name: "Dismiss Milo tip" }))
      first.unmount()
      render(<Harness />)
      await act(async () => {})
      expect(screen.queryByText(/Milo lives here now/)).toBeNull()
    }
  )

  it("does not open the shortcut tooltip when close returns focus", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const launcher = await screen.findByRole("button", { name: "Ask Milo" })
    await user.click(launcher)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(launcher).toHaveFocus())
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("shows the platform shortcut on keyboard focus and mouse hover", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
    const user = userEvent.setup()
    render(<Harness />)
    const launcher = await screen.findByRole("button", { name: "Ask Milo" })
    fireEvent.keyDown(window, { key: "Tab" })
    launcher.focus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent("⌘J")
    launcher.blur()
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
    await user.hover(launcher)
    expect(await screen.findByRole("tooltip")).toHaveTextContent("⌘J")
    await user.unhover(launcher)
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
  })

  it("preserves clicks below the drag threshold and saves a free drag", async () => {
    const writes: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/milo/preferences" && init?.method === "PUT") {
          writes.push(JSON.parse(String(init.body)).position)
          return Promise.resolve({ ok: true })
        }
        if (url === "/api/milo/preferences")
          return Promise.resolve({ ok: false })
        return Promise.resolve(stream("answer"))
      })
    )
    render(<Harness />)
    const launcher = await screen.findByRole("button", { name: "Ask Milo" })
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        isPrimary: { value: true },
      })
      fireEvent(launcher, event)
    }
    pointer("pointerdown", 900, 700)
    pointer("pointermove", 897, 699)
    pointer("pointerup", 897, 699)
    fireEvent.click(launcher)
    expect(screen.getByRole("dialog", { name: "Milo" })).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    pointer("pointerdown", 900, 700)
    pointer("pointermove", 20, 20)
    expect(document.body.style.userSelect).toBe("none")
    pointer("pointerup", 20, 20)
    expect(document.body.style.userSelect).toBe("")
    fireEvent.click(launcher)
    expect(screen.queryByRole("dialog", { name: "Milo" })).toBeNull()
    await waitFor(() => expect(writes).toEqual([{ x: 0, y: 0 }]))
  })

  it("replaces the cached position with the server preference", async () => {
    localStorage.setItem(
      "milo-position:test-user",
      JSON.stringify({ x: 0, y: 0 })
    )
    let finishRead!: (value: unknown) => void
    const get = new Promise((resolve) => {
      finishRead = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() => get)
    )
    render(<Harness />)
    const launcher = await screen.findByRole("button", { name: "Ask Milo" })
    expect(launcher.parentElement).toHaveStyle({ left: "10px", top: "10px" })
    await act(async () => {
      finishRead({ ok: true, json: async () => ({ position: { x: 1, y: 1 } }) })
      await get
    })
    await waitFor(() =>
      expect(localStorage.getItem("milo-position:test-user")).toBe(
        JSON.stringify({ x: 1, y: 1 })
      )
    )
  })

  it("moves with the keyboard and ignores a stale server read", async () => {
    localStorage.setItem(
      "milo-position:test-user",
      JSON.stringify({ x: 0.5, y: 0.5 })
    )
    let finishRead!: (value: unknown) => void
    const get = new Promise((resolve) => {
      finishRead = resolve
    })
    const writes: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/milo/preferences" && init?.method === "PUT") {
          writes.push(JSON.parse(String(init.body)).position)
          return Promise.resolve({ ok: true })
        }
        if (url === "/api/milo/preferences") return get
        return Promise.resolve(stream("answer"))
      })
    )
    render(<Harness />)
    await userEvent.click(
      await screen.findByRole("button", { name: "Ask Milo" })
    )
    const panel = screen.getByRole("dialog", { name: "Milo" })
    expect(screen.queryByRole("button", { name: "Move to corner" })).toBeNull()
    fireEvent.keyDown(panel, { key: "ArrowLeft", altKey: true })
    await waitFor(() => expect(writes).toHaveLength(1))
    const saved = localStorage.getItem("milo-position:test-user")
    await act(async () => {
      finishRead({ ok: true, json: async () => ({ position: { x: 1, y: 1 } }) })
      await get
    })
    expect(localStorage.getItem("milo-position:test-user")).toBe(saved)
  })

  it("gates login and signed-out users and removes Milo without beta access", async () => {
    const user = userEvent.setup()
    const view = render(<Harness signedIn={false} />)
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()
    route.pathname = "/login"
    view.rerender(<Harness />)
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()
    route.pathname = "/home"
    localStorage.setItem("milo-chat-open", "true")
    view.rerender(<Harness canUseMilo={false} />)
    await user.click(screen.getByRole("button", { name: "Open draft" }))
    const shortcut = new KeyboardEvent("keydown", {
      key: "j",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    })
    window.dispatchEvent(shortcut)
    await act(async () => {
      await Promise.resolve()
    })
    expect(shortcut.defaultPrevented).toBe(false)
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Ask Milo" })).toBeNull()
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
