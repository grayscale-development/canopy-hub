// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  MILO_CHAT_THREAD_STORAGE_KEY,
  WikiChat,
} from "@/components/wiki/wiki-chat"

const threads = [
  {
    id: "current-thread",
    title: "Current session",
    updatedAt: "2026-10-16T12:00:00.000Z",
  },
  {
    id: "older-thread",
    title: "Older session",
    updatedAt: "2026-10-15T12:00:00.000Z",
  },
]

const messagesByThread: Record<string, Array<Record<string, unknown>>> = {
  "current-thread": [
    {
      id: "current-message",
      role: "assistant",
      content: "The current conversation stays open.",
      citations: [],
    },
  ],
  "older-thread": [
    {
      id: "older-message",
      role: "assistant",
      content: "The older session is loaded.",
      citations: [],
    },
  ],
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  const threadId = new URL(url, "http://localhost").searchParams.get("threadId")
  const thread = threadId ? threads.find((item) => item.id === threadId) : null
  const payload = thread
    ? { thread, messages: messagesByThread[threadId ?? ""] ?? [] }
    : { threads }

  return {
    ok: true,
    json: async () => payload,
  } as Response
})
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView"
)

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("crypto", {
    ...window.crypto,
    randomUUID: () => "test-message-id",
  })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  if (originalScrollIntoView) {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView
    )
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView")
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("WikiChat sessions", () => {
  it("replaces chat and composer with sessions, returns to the current chat, and opens a selected session", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(MILO_CHAT_THREAD_STORAGE_KEY, "current-thread")
    render(<WikiChat showTitle={false} className="h-full min-h-0 flex-1" />)

    expect(
      await screen.findByText("The current conversation stays open.")
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Sessions" }))
    const sessionList = screen.getByRole("region", { name: "Milo sessions" })
    expect(sessionList).toBeVisible()
    expect(within(sessionList).getByText("Current session")).toBeVisible()
    expect(screen.queryByPlaceholderText("Ask Milo anything")).toBeNull()
    expect(
      screen.queryByText("The current conversation stays open.")
    ).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "Return to current chat" })
    )
    expect(
      await screen.findByText("The current conversation stays open.")
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Sessions" }))
    await user.click(screen.getByRole("button", { name: /Older session/ }))
    expect(
      await screen.findByText("The older session is loaded.")
    ).toBeVisible()
    expect(window.localStorage.getItem(MILO_CHAT_THREAD_STORAGE_KEY)).toBe(
      "older-thread"
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})
