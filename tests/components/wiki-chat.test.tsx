// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WikiChat } from "@/components/wiki/wiki-chat"

function streamedResponse(
  threadId: string,
  answer: string,
  cards: unknown[] = []
) {
  const body = [
    { type: "meta", threadId },
    { type: "token", token: answer },
    ...cards.map((card) => ({
      type: "card",
      messageId: "server-message",
      card,
    })),
    { type: "done", threadId, citations: [] },
  ]
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

describe("WikiChat", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(streamedResponse("thread-1", "First answer."))
      .mockResolvedValueOnce(streamedResponse("thread-1", "Follow-up answer."))
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

  it("keeps the active conversation for a follow-up question", async () => {
    const user = userEvent.setup()
    render(<WikiChat queuedPrompt="What is Milo?" />)

    expect(await screen.findByText("First answer.")).toBeVisible()

    await user.type(
      screen.getByRole("textbox", { name: "Ask a follow-up" }),
      "Tell me more"
    )
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))

    expect(await screen.findByText("Follow-up answer.")).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/wiki/chat",
      expect.objectContaining({
        body: JSON.stringify({ threadId: "thread-1", message: "Tell me more" }),
      })
    )
  })

  it("saves a rating, lets it change, and restores it with the conversation", async () => {
    fetchMock.mockReset()
    sessionStorage.setItem("milo-active-thread", "thread-1")
    const history = (rating?: string) => ({
      ok: true,
      json: async () => ({
        messages: [
          { id: "answer-1", role: "assistant", content: "An answer", rating },
        ],
      }),
    })
    fetchMock.mockResolvedValueOnce(history())
    fetchMock.mockResolvedValueOnce({ ok: true })
    fetchMock.mockResolvedValueOnce({ ok: true })
    fetchMock.mockResolvedValueOnce(history("down"))
    const user = userEvent.setup()
    const view = render(<WikiChat />)
    await screen.findByText("An answer")
    await user.click(screen.getByRole("button", { name: "Helpful answer" }))
    expect(await screen.findByText("Thanks for your feedback")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Helpful answer" })
    ).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "Unhelpful answer" }))
    expect(
      screen.getByRole("button", { name: "Unhelpful answer" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/wiki/chat/rating",
      expect.objectContaining({
        body: JSON.stringify({
          assistantMessageId: "answer-1",
          rating: "down",
        }),
      })
    )
    view.unmount()
    render(<WikiChat />)
    await screen.findByText("An answer")
    expect(
      screen.getByRole("button", { name: "Unhelpful answer" })
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("renders cards safely, submits actions, and restores applied cards on reload", async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(
      streamedResponse("thread-1", "Review these.", [
        {
          type: "page-candidates",
          id: "choices",
          title: "Is this the page?",
          candidates: [{ id: "page", title: "Policy" }],
        },
        {
          type: "proposed-edit",
          id: "edit",
          pageTitle: "Policy",
          before: "Old",
          after: "New",
        },
        { type: "future-card", text: "<img src=x onerror=alert(1)>" },
      ])
    )
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "not-implemented" }),
    })
    const user = userEvent.setup()
    const view = render(<WikiChat queuedPrompt="Edit policy" />)
    expect(await screen.findByText("Is this the page?")).toBeVisible()
    expect(
      screen.getByText("<img src=x onerror=alert(1)>", { exact: false })
    ).toBeVisible()
    expect(document.querySelector("img")).toBeNull()
    expect(screen.getByText("Old")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Yes, this one" }))
    expect(
      await screen.findByText("This action isn't available yet.")
    ).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/wiki/chat/card-action",
      expect.objectContaining({
        body: JSON.stringify({
          action: "select-page",
          candidateId: "page",
          threadId: "thread-1",
          messageId: "server-message",
          cardId: "choices",
        }),
      })
    )
    view.unmount()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "server-message",
            role: "assistant",
            content: "",
            cards: [{ type: "applied-edit", id: "edit", pageTitle: "Policy" }],
          },
        ],
      }),
    })
    render(<WikiChat />)
    expect(await screen.findByText("Applied: Policy")).toBeVisible()
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled()
  })
})
