// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WikiChat } from "@/components/wiki/wiki-chat"

function streamedResponse(threadId: string, answer: string) {
  const body = [
    { type: "meta", threadId },
    { type: "token", token: answer },
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

    await user.type(screen.getByRole("textbox", { name: "Ask a follow-up" }), "Tell me more")
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))

    expect(await screen.findByText("Follow-up answer.")).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/wiki/chat",
      expect.objectContaining({
        body: JSON.stringify({ threadId: "thread-1", message: "Tell me more" }),
      })
    )
  })
})
