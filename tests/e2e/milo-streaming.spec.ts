import { expect, test } from "@playwright/test"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("stops a fake streamed answer and keeps the saved partial text", async ({
  page,
  baseURL,
}) => {
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
    await dialog.getByRole("button", { name: "Stop" }).click()
    await expect(
      dialog.getByText(/Stopped\. Ask another question/)
    ).toBeVisible()
    await expect(input).toBeEnabled()
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
        return data?.find((message) => message.metadata?.stopped)?.content ?? ""
      })
      .toContain("Please check")
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
