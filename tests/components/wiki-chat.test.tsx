// @vitest-environment jsdom

import * as React from "react"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
    localStorage.clear()
    fetchMock.mockReset()
    let chats = 0
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/wiki/search")
        ? { ok: true, json: async () => ({ results: [] }) }
        : streamedResponse(
            "thread-1",
            chats++ ? "Follow-up answer." : "First answer."
          )
    )
    vi.stubGlobal("fetch", fetchMock)
    let messageId = 0
    vi.stubGlobal("crypto", {
      ...window.crypto,
      randomUUID: () => `test-message-${++messageId}`,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("shows the empty state and makes a network error retryable", async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new Error("internal network detail"))
    render(<WikiChat />)
    expect(await screen.findByText(/How can I help/)).toBeVisible()
    const input = screen.getByRole("textbox", { name: "Ask a follow-up" })
    await user.type(input, "Where is the wiki?")
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))
    expect(input).toHaveValue("")
    expect(
      await screen.findByText(
        "Milo couldn't answer right now. Please try again."
      )
    ).toBeVisible()
    expect(
      screen.queryByText("internal network detail")
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("First answer.")).toBeVisible()
  })

  it("stops an in-progress answer and keeps its partial text", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(
      async (_url: string, init: RequestInit) => ({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"meta","threadId":"t","userMessageId":"u"}\n\ndata: {"type":"token","token":"Partial answer"}\n\n'
              )
            )
            init.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError"))
            )
          },
        }),
      })
    )
    render(<WikiChat />)
    const input = await screen.findByRole("textbox", {
      name: "Ask a follow-up",
    })
    await user.type(input, "Explain funding")
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))
    expect(await screen.findByText("Partial answer")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wiki/chat/stop",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ threadId: "t", userMessageId: "u" }),
      })
    )
    expect(
      await screen.findByText("Stopped. Ask another question to continue.")
    ).toBeVisible()
    expect(input).toBeEnabled()
    expect(screen.getByText("Partial answer")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Helpful answer" })
    ).not.toBeInTheDocument()
  })

  it("restores a stopped question without an answer, keeps a full answer saved before the stop, and places late replies with their question", async () => {
    localStorage.setItem("milo-active-thread", "thread-1")
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "q1",
            role: "user",
            content: "First question",
            stopRequested: true,
          },
          {
            id: "q2",
            role: "user",
            content: "Second question",
            stopRequested: true,
          },
          { id: "q3", role: "user", content: "Third question" },
          { id: "a3", role: "assistant", content: "Third answer" },
          {
            id: "late",
            role: "assistant",
            content: "Late answer",
            replyTo: "q2",
          },
          {
            id: "a1",
            role: "assistant",
            content: "Saved partial",
            stopped: true,
            replyTo: "q1",
          },
        ],
      }),
    })
    render(<WikiChat />)
    expect(await screen.findByText("First question")).toBeVisible()
    expect(screen.getByText("Saved partial")).toBeVisible()
    expect(
      screen.getAllByText("Stopped. Ask another question to continue.")
    ).toHaveLength(1)
    expect(screen.getByText("Third answer")).toBeVisible()
    expect(screen.getByText("Late answer")).toBeVisible()
    const ordered = [...document.querySelectorAll("p")].map(
      (p) => p.textContent
    )
    expect(ordered.indexOf("Saved partial")).toBeLessThan(
      ordered.indexOf("Second question")
    )
    expect(ordered.indexOf("Late answer")).toBeGreaterThan(
      ordered.indexOf("Second question")
    )
    expect(ordered.indexOf("Late answer")).toBeLessThan(
      ordered.indexOf("Third question")
    )
  })

  it("shows stopped immediately before stream metadata arrives and silently sends a later stop", async () => {
    const user = userEvent.setup()
    let stream!: ReadableStreamDefaultController<Uint8Array>
    let signal!: AbortSignal
    fetchMock.mockImplementationOnce(
      async (_url: string, init: RequestInit) => {
        signal = init.signal!
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              stream = controller
            },
          }),
        }
      }
    )
    fetchMock.mockRejectedValue(new Error("stop failed"))
    render(<WikiChat />)
    await user.type(
      await screen.findByRole("textbox", { name: "Ask a follow-up" }),
      "Explain funding"
    )
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))
    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(
      await screen.findByText("Stopped. Ask another question to continue.")
    ).toBeVisible()
    stream.enqueue(
      new TextEncoder().encode(
        'data: {"type":"meta","threadId":"t","userMessageId":"u"}\n\n'
      )
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wiki/chat/stop",
        expect.objectContaining({
          body: JSON.stringify({ threadId: "t", userMessageId: "u" }),
        })
      )
    )
    expect(signal.aborted).toBe(true)
    expect(screen.queryByText(/stop failed/)).not.toBeInTheDocument()
  })

  it("keeps the active conversation for a follow-up question", async () => {
    const user = userEvent.setup()
    render(<WikiChat queuedPrompt="What is Milo?" />)

    expect(await screen.findByText("First answer.")).toBeVisible()
    expect(screen.getByText("What is Milo?")).toBeVisible()

    await user.type(
      screen.getByRole("textbox", { name: "Ask a follow-up" }),
      "Tell me more"
    )
    await user.click(screen.getByRole("button", { name: "Send follow-up" }))

    expect(await screen.findByText("Follow-up answer.")).toBeVisible()
    expect(screen.getByText("Tell me more")).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wiki/chat",
      expect.objectContaining({
        body: JSON.stringify({ threadId: "thread-1", message: "Tell me more" }),
      })
    )
  })

  it("renders markdown, references and the restored question inline", async () => {
    localStorage.setItem("milo-active-thread", "thread-1")
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "question",
            role: "user",
            content: "tell me about the funding process",
          },
          {
            id: "answer",
            role: "assistant",
            content:
              "The best match is **Funding Checklist**: `/wiki/1/16/17`. [1]\n\n- *Closing Desk Notes*\n- [Hub Process](/wiki/tags?tag=Hub%20Process)\n- [**Manual**](/wiki/1/16/19)\n- [`/wiki/1/16/17`](/wiki/1/16/17)\n- [Unknown][invented]\n\n[invented]: /wiki/tags?tag=Unknown",
            citations: [
              {
                title: "Funding Checklist",
                url: "/wiki/1/16/17",
                snippet: "Funding steps",
              },
              {
                title: "Closing Desk Notes",
                url: "/wiki/1/16/18",
                snippet: "Closing notes",
              },
              { title: "Manual", url: "/wiki/1/16/19", snippet: "Manual" },
              {
                title: "Tag: Hub Process (Global)",
                url: "/wiki/tags?tag=Hub%20Process",
                snippet: "Tag",
              },
            ],
          },
        ],
      }),
    })
    const onNavigate = vi.fn()
    render(<WikiChat onNavigate={onNavigate} />)
    expect(
      await screen.findByText("tell me about the funding process")
    ).toBeVisible()
    expect(
      screen.getAllByRole("link", { name: "Funding Checklist" })[0]
    ).toHaveAttribute("href", "/wiki/1/16/17")
    expect(
      screen.queryByRole("link", { name: "/wiki/1/16/17" })
    ).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/\[\d+\]|\/wiki\/1\/16\/17/)
    expect(screen.getAllByRole("link", { name: "Manual" })[0]).toHaveAttribute(
      "href",
      "/wiki/1/16/19"
    )
    expect(document.querySelector("a a")).toBeNull()
    expect(
      screen
        .getAllByRole("link", { name: "Closing Desk Notes" })[0]
        .closest("em")
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Hub Process" })).toHaveAttribute(
      "href",
      "/wiki/tags?tag=Hub%20Process"
    )
    expect(screen.getByText("Unknown")).toBeVisible()
    expect(screen.queryByRole("link", { name: "Unknown" })).toBeNull()
    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getByText("Sources")).toBeVisible()
    expect(
      within(screen.getByLabelText("Sources")).queryByRole("link", {
        name: /Hub Process/,
      })
    ).toBeNull()
    const link = screen.getAllByRole("link", { name: "Funding Checklist" })[0]
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    })
    await userEvent.click(link)
    expect(onNavigate).toHaveBeenCalled()
  })

  it("sends on Enter and inserts a newline on Shift+Enter without searching", async () => {
    const user = userEvent.setup()
    render(<WikiChat />)
    const input = await screen.findByRole("textbox", {
      name: "Ask a follow-up",
    })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, "First{Shift>}{Enter}{/Shift}second")
    expect(input).toHaveValue("First\nsecond")
    expect(fetchMock).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(await screen.findByText("First answer.")).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBe(
      "First\nsecond"
    )
  })

  it("offers page-aware questions and removes context before sending", async () => {
    const user = userEvent.setup()
    function Example() {
      const [page, setPage] = React.useState<{
        pageId: string
        title: string
      } | null>({ pageId: "page-1", title: "Operations" })
      return (
        <WikiChat
          firstName="Alex"
          pageContext={page}
          onRemovePage={() => setPage(null)}
        />
      )
    }
    render(<Example />)
    expect(await screen.findByText("Hi, Alex. How can I help?")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Summarize this page" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Who do I ask about Operations?" })
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Remove Operations page context" })
    )
    expect(screen.queryByText("About: Operations")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Find a wiki page" }))
    expect(await screen.findByText("First answer.")).toBeVisible()
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/wiki/chat"
    )
    expect(JSON.parse(request![1].body)).toEqual({
      threadId: null,
      message: "Find a wiki page",
    })
    expect(
      screen.getByText(
        "Milo can make mistakes. Check the linked page. Don't paste borrower information."
      )
    ).toBeVisible()
  })

  it("sends page context with a suggested question", async () => {
    render(<WikiChat pageContext={{ pageId: "page-1", title: "Operations" }} />)
    await userEvent.click(
      await screen.findByRole("button", { name: "Summarize this page" })
    )
    await screen.findByText("First answer.")
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/wiki/chat"
    )
    expect(JSON.parse(request![1].body)).toMatchObject({
      pageContext: { pageId: "page-1" },
    })
  })

  it("includes the file and page context when sending a suggestion", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <WikiChat pageContext={{ pageId: "page-1", title: "Operations" }} />
    )
    await screen.findByRole("button", { name: "Summarize this page" })
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    await user.upload(
      input,
      new File(["source"], "source.txt", { type: "text/plain" })
    )
    await user.click(
      screen.getByRole("button", { name: "Summarize this page" })
    )
    await screen.findByText("First answer.")
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/wiki/chat"
    )
    expect(JSON.parse(request![1].body.get("pageContext"))).toEqual({
      pageId: "page-1",
    })
    expect(request![1].body.get("file").name).toBe("source.txt")
  })

  it("deduplicates sources by URL while preserving inline citations", async () => {
    localStorage.setItem("milo-active-thread", "thread-1")
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "answer",
            role: "assistant",
            content: "See Policy [1].",
            citations: [
              { title: "Policy", url: "/wiki/1/2", snippet: "first" },
              { title: "Policy", url: "/wiki/1/2", snippet: "second" },
            ],
          },
        ],
      }),
    })
    render(<WikiChat />)
    const sources = await screen.findByLabelText("Sources")
    expect(within(sources).getAllByRole("link")).toHaveLength(1)
    expect(screen.getAllByRole("link", { name: "Policy" })).toHaveLength(2)
  })

  it("keeps citation numbers aligned when an earlier source is unavailable", async () => {
    localStorage.setItem("milo-active-thread", "thread-1")
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "answer",
            role: "assistant",
            content: "## Policy [2]\n\nDetails [1] and [2].",
            citations: [
              { title: "", url: null, snippet: "" },
              { title: "Policy", url: "/wiki/1/2", snippet: "Policy" },
            ],
          },
        ],
      }),
    })
    render(<WikiChat />)
    expect(await screen.findByRole("heading", { name: "Policy" })).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "Policy" }).querySelector("a")
    ).toHaveAttribute("href", "/wiki/1/2")
    expect(document.body).not.toHaveTextContent(/\[\d+\]/)
  })

  it("saves a rating, lets it change, and restores it with the conversation", async () => {
    fetchMock.mockReset()
    localStorage.setItem("milo-active-thread", "thread-1")
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
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/wiki/search")
        ? { ok: true, json: async () => ({ results: [] }) }
        : { ok: true, json: async () => ({ status: "not-implemented" }) }
    )
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
