import { expect, test } from "@playwright/test"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("saves and restores a checked fake answer", async ({ page, baseURL }) => {
  const target = new URL(baseURL ?? "http://127.0.0.1:3000")
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  ) {
    throw new Error("This test requires a local app.")
  }
  test.skip(
    Boolean(
      process.env.OPENAI_CHAT_MODEL &&
      process.env.OPENAI_CHAT_MODEL !== "fake-chat"
    ),
    "Requires the fake model"
  )
  const fixture = await createReviewedPage({
    slug: `milo-stream-${Date.now()}`,
    title: "Streaming checklist",
    paragraphs: ["Review the checklist before closing."],
  })
  const admin = serviceWiki()
  let sourceId: string | null = null
  let threadId: string | null = null
  try {
    await page.addInitScript(() => {
      const state = window as typeof window & {
        miloEvents: Array<Array<string>>
      }
      state.miloEvents = []
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const response = await originalFetch(...args)
        const request = args[0]
        const url =
          typeof request === "string"
            ? request
            : request instanceof URL
              ? request.href
              : request.url
        if (
          url.endsWith("/api/wiki/chat") &&
          args[1]?.method === "POST" &&
          response.body
        ) {
          const events: string[] = []
          state.miloEvents.push(events)
          void (async () => {
            const reader = response.clone().body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            try {
              while (true) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const parts = buffer.split("\n\n")
                buffer = parts.pop() ?? ""
                for (const part of parts) {
                  if (part.startsWith("data: "))
                    events.push(JSON.parse(part.slice(6)).type)
                }
              }
            } catch {
              /* Stop cancels the response. */
            }
          })()
        }
        return response
      }
    })
    const { data: source, error } = await admin
      .from("knowledge_sources")
      .insert({
        source_type: "wiki_page",
        source_id: fixture.id,
        title: "Streaming checklist",
        url: fixture.path,
        content_hash: "milo-stream-fixture",
        status: "active",
      })
      .select("id")
      .single()
    if (error || !source) throw error ?? new Error("Could not create source")
    sourceId = source.id
    const { error: chunkError } = await admin.from("knowledge_chunks").insert({
      source_id: sourceId,
      chunk_index: 0,
      content: "Review the checklist before closing.",
    })
    if (chunkError) throw chunkError
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(fixture.path)
    await page.evaluate(() => localStorage.removeItem("milo-active-thread"))
    await page.reload()
    await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Milo" })
    const input = dialog.getByRole("textbox", { name: "Ask a follow-up" })
    await input.fill("Summarize this page")
    await dialog.getByRole("button", { name: "Send follow-up" }).click()
    await expect(input).toHaveValue("")
    await expect(
      dialog.getByText("Please check", { exact: false })
    ).toBeVisible()
    await expect(input).toBeEnabled()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & { miloEvents: string[][] }
            ).miloEvents[0]?.includes("done") ?? false
        )
      )
      .toBe(true)
    const events = await page.evaluate(
      () => (window as typeof window & { miloEvents: string[][] }).miloEvents[0]
    )
    expect(events.filter((event) => event === "token").length).toBeGreaterThan(
      1
    )
    expect(events.indexOf("status")).toBeLessThan(events.indexOf("token"))
    expect(events.lastIndexOf("token")).toBeLessThan(events.indexOf("done"))
    threadId = await page.evaluate(() =>
      localStorage.getItem("milo-active-thread")
    )
    expect(threadId).toBeTruthy()
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("ai_chat_messages")
          .select("content,metadata")
          .eq("thread_id", threadId!)
          .eq("role", "assistant")
        return (
          data?.find((message) => !message.metadata?.stopped)?.content ?? ""
        )
      })
      .toContain("Please check")
    await input.fill("Summarize this page")
    await dialog.getByRole("button", { name: "Send follow-up" }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & { miloEvents: string[][] }
            ).miloEvents[1]?.filter((event) => event === "token").length ?? 0
        )
      )
      .toBeGreaterThan(0)
    await dialog.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(
      dialog.getByText("Stopped. Ask another question to continue.")
    ).toBeVisible()
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("ai_chat_messages")
          .select("content,metadata")
          .eq("thread_id", threadId!)
          .eq("role", "assistant")
        return data?.find((message) => message.metadata?.stopped)?.content ?? ""
      })
      .toContain("Please check")
    const stopped = await admin
      .from("ai_chat_messages")
      .select("content,metadata")
      .eq("thread_id", threadId!)
      .eq("role", "assistant")
    const partial = stopped.data?.find((message) => message.metadata?.stopped)
    expect(partial?.content).not.toContain("for the latest details.")
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { miloEvents: string[][] }).miloEvents[1]
      )
    ).not.toContain("done")
    await page.reload()
    await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
    await expect(
      page
        .getByRole("dialog", { name: "Milo" })
        .getByText("Please check", { exact: false })
        .first()
    ).toBeVisible()
  } finally {
    if (!threadId && !page.isClosed())
      threadId = await page
        .evaluate(() => localStorage.getItem("milo-active-thread"))
        .catch(() => null)
    if (threadId)
      await admin.from("ai_chat_threads").delete().eq("id", threadId)
    if (sourceId)
      await admin.from("knowledge_sources").delete().eq("id", sourceId)
    await admin.from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
