// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import { WikiChatCard } from "@/components/wiki/wiki-chat-card"
import type { MiloCard } from "@/lib/milo/chat-cards"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("shows a match, walks to another and confirms it without changing the wiki", async () => {
  const card: Extract<MiloCard, { type: "page-candidates" }> = {
    type: "page-candidates",
    id: "card",
    title: "Is this the page you mean?",
    current: 0,
    candidates: [
      {
        id: "one",
        title: "Policy",
        breadcrumb: "Area > Section",
        updatedAt: "2026-02-01T00:00:00Z",
        snippet: "Relevant text",
        confidence: "High",
        url: "/wiki/1/2/3",
      },
      { id: "two", title: "Other policy", url: "/wiki/1/2/4" },
    ],
  }
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", card: { ...card, current: 1 } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        card: { ...card, current: 1, outcome: "confirmed" },
      }),
    })
  vi.stubGlobal("fetch", fetch)
  const user = userEvent.setup()
  render(<WikiChatCard card={card} threadId="thread" messageId="message" />)
  expect(screen.getByRole("link", { name: "Policy" })).toHaveAttribute(
    "href",
    "/wiki/1/2/3"
  )
  expect(screen.getByText("Area > Section")).toBeVisible()
  expect(screen.getByText("Last updated Feb 1, 2026")).toBeVisible()
  expect(screen.getByText("High match")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Show me another" }))
  expect(screen.getByRole("link", { name: "Other policy" })).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Yes, this one" }))
  expect(screen.getByText(/No changes have been made/)).toBeVisible()
  expect(screen.queryByRole("button", { name: "Yes, this one" })).toBeNull()
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    action: "select-page",
    candidateId: "two",
  })
})

it("offers the existing AI Create entry point when there are no matches", async () => {
  const card: Extract<MiloCard, { type: "page-candidates" }> = {
    type: "page-candidates",
    id: "card",
    title: "Is this the page you mean?",
    candidates: [],
  }
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          card: { ...card, outcome: "create" },
        }),
      })
  )
  const user = userEvent.setup()
  render(<WikiChatCard card={card} threadId="thread" messageId="message" />)
  await user.click(
    screen.getByRole("button", { name: "None of these - create a new page" })
  )
  expect(screen.getByRole("link", { name: "Wiki" })).toHaveAttribute(
    "href",
    "/wiki"
  )
  expect(screen.getByText(/AI Create/)).toBeVisible()
})
