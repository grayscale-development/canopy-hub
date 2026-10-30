// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiChatDockProvider,
  WikiChatDockTrigger,
} from "@/components/wiki/wiki-chat-dock"
import { MILO_CHAT_THREAD_STORAGE_KEY } from "@/components/wiki/wiki-chat"

const supabaseState = vi.hoisted(() => {
  const permissionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: { id: "beta-id" } })),
  }
  permissionQuery.select.mockImplementation(() => permissionQuery)
  permissionQuery.eq.mockImplementation(() => permissionQuery)

  let userPermissionFilters = 0
  const userPermissionsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
  }
  userPermissionsQuery.select.mockImplementation(() => userPermissionsQuery)
  userPermissionsQuery.eq.mockImplementation(() => {
    userPermissionFilters += 1
    return userPermissionFilters % 2 === 0
      ? Promise.resolve({ count: 1 })
      : userPermissionsQuery
  })

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "test-user" } } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table: string) =>
      table === "permissions" ? permissionQuery : userPermissionsQuery
    ),
  }

  return { supabase }
})

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => supabaseState.supabase,
}))

let deferThreadResponse = false
let releaseThreadResponse: (() => void) | null = null

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init
    const url = String(input)
    const threadId = new URL(url, "http://localhost").searchParams.get(
      "threadId"
    )
    if (threadId && deferThreadResponse) {
      await new Promise<void>((resolve) => {
        releaseThreadResponse = resolve
      })
    }

    return {
      ok: true,
      json: async () =>
        threadId
          ? {
              thread: {
                id: threadId,
                title: "Saved session",
                updatedAt: "2026-10-16T12:00:00.000Z",
              },
              messages: [
                {
                  id: "saved-message",
                  role: "assistant",
                  content: "This saved conversation stays in history.",
                  citations: [],
                },
              ],
            }
          : {
              threads: [
                {
                  id: "saved-thread",
                  title: "Saved session",
                  updatedAt: "2026-10-16T12:00:00.000Z",
                },
              ],
            },
    } as Response
  }
)

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView"
)

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("milo-chat-open", "true")
  window.localStorage.setItem(MILO_CHAT_THREAD_STORAGE_KEY, "saved-thread")
  deferThreadResponse = false
  releaseThreadResponse = null
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
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

describe("WikiChatDockProvider", () => {
  it("opens a fresh chat after close while keeping the saved session in history", async () => {
    const user = userEvent.setup()
    render(
      <WikiChatDockProvider>
        <div>Wiki page</div>
        <WikiChatDockTrigger />
      </WikiChatDockProvider>
    )

    expect(
      await screen.findByText("This saved conversation stays in history.")
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Close Milo chat" }))
    expect(window.localStorage.getItem(MILO_CHAT_THREAD_STORAGE_KEY)).toBeNull()
    await user.click(screen.getByRole("button", { name: /Ask Milo/ }))

    expect(await screen.findByText(/Ask Milo about Wiki pages/)).toBeVisible()
    expect(
      screen.queryByText("This saved conversation stays in history.")
    ).toBeNull()
    expect(window.localStorage.getItem(MILO_CHAT_THREAD_STORAGE_KEY)).toBeNull()
    expect(
      fetchMock.mock.calls.every(([, init]) =>
        [undefined, "GET"].includes((init as RequestInit | undefined)?.method)
      )
    ).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it("does not restore a thread when closed while that thread is still loading", async () => {
    const user = userEvent.setup()
    deferThreadResponse = true
    render(
      <WikiChatDockProvider>
        <div>Wiki page</div>
        <WikiChatDockTrigger />
      </WikiChatDockProvider>
    )

    expect(await screen.findByText("Loading session...")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Close Milo chat" }))
    expect(window.localStorage.getItem(MILO_CHAT_THREAD_STORAGE_KEY)).toBeNull()

    deferThreadResponse = false
    await act(async () => {
      releaseThreadResponse?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await user.click(screen.getByRole("button", { name: /Ask Milo/ }))

    expect(await screen.findByText(/Ask Milo about Wiki pages/)).toBeVisible()
    expect(
      screen.queryByText("This saved conversation stays in history.")
    ).toBeNull()
    expect(window.localStorage.getItem(MILO_CHAT_THREAD_STORAGE_KEY)).toBeNull()
  })
})
