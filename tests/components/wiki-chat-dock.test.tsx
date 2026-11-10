// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WikiChatModalProvider } from "@/components/wiki/wiki-chat-modal"
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"

function streamedResponse(answer: string) {
  const events = [
    { type: "meta", threadId: "thread-1" },
    { type: "token", token: answer },
    {
      type: "card",
      messageId: "server-message",
      card: { type: "error", id: "error", message: "Please try again." },
    },
    {
      type: "done",
      threadId: "thread-1",
      citations: [
        {
          title: "Loan policy",
          url: "/wiki/loan-policy",
          snippet: "The source page for this answer.",
        },
      ],
    },
  ]
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")

  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
        controller.close()
      },
    }),
  } as Response
}

describe("WikiChatModalProvider", () => {
  let resolveResponse: ((response: Response) => void) | null = null
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
  )

  beforeEach(() => {
    sessionStorage.clear()
    fetchMock.mockClear()
    resolveResponse = null
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("crypto", {
      ...window.crypto,
      randomUUID: () => "test-message-id",
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("opens Ask Milo from the header, streams an answer, and closes for a resource", async () => {
    const user = userEvent.setup()
    render(
      <WikiChatModalProvider>
        <WikiHeaderSearch />
      </WikiChatModalProvider>
    )

    expect(screen.getByRole("textbox", { name: "Ask Milo" })).toHaveAttribute(
      "placeholder",
      "Ask Milo"
    )
    expect(screen.queryByRole("button", { name: "Ask Milo" })).toBeNull()

    await user.type(
      screen.getByRole("textbox", { name: "Ask Milo" }),
      "Where is the loan policy?"
    )
    await user.keyboard("{Enter}")

    expect(await screen.findByRole("dialog")).toBeVisible()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wiki/chat",
        expect.objectContaining({ method: "POST" })
      )
    )
    expect(screen.getByLabelText("Milo is thinking")).toBeVisible()

    await act(async () => {
      resolveResponse?.(streamedResponse("The loan policy is in the Wiki."))
    })

    expect(
      await screen.findByText("The loan policy is in the Wiki.")
    ).toBeVisible()
    expect(screen.getByText("Please try again.")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Sources" })).toBeVisible()

    await user.click(screen.getByRole("link", { name: /Loan policy/ }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("reopens the active thread after a page reload", async () => {
    sessionStorage.setItem("milo-chat-open", "true")
    sessionStorage.setItem("milo-active-thread", "thread-1")
    fetchMock.mockImplementationOnce(
      async () =>
        ({
          ok: true,
          json: async () => ({
            messages: [
              {
                id: "message",
                role: "assistant",
                content: "",
                cards: [
                  { type: "applied-edit", id: "edit", pageTitle: "Policy" },
                ],
              },
            ],
          }),
        }) as Response
    )
    render(
      <WikiChatModalProvider>
        <WikiHeaderSearch />
      </WikiChatModalProvider>
    )
    expect(
      await screen.findByRole("dialog", { name: "Ask Milo" })
    ).toBeVisible()
    expect(await screen.findByText("Applied: Policy")).toBeVisible()
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled()
  })
})
