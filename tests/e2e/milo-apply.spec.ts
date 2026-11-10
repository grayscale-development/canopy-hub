import { expect, test } from "@playwright/test"
import path from "node:path"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  revisionTexts,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.setTimeout(120_000)
for (const viewport of [
  { name: "desktop", width: 1440, height: 900, prefix: "01" },
  { name: "mobile", width: 390, height: 844, prefix: "02" },
]) {
  test(`approves and undoes a reviewed edit on ${viewport.name}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport)
    const title = `Milo policy ${crypto.randomUUID().slice(0, 8)}`
    const reviewed = await createReviewedPage({
      slug: `milo-${crypto.randomUUID()}`,
      title,
      paragraphs: ["The original policy remains."],
      olderParagraphs: ["An older version."],
    })
    const admin = serviceWiki()
    const email = `milo-browser-${crypto.randomUUID()}@canopy.test`
    const { data: created, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
        email_confirm: true,
      })
    if (userError || !created.user)
      throw userError ?? new Error("Unable to create manager")
    const user = created.user
    const permissions = await admin
      .from("permissions")
      .select("id")
      .in("code", ["beta.1", "wiki.manage"])
    if (permissions.error || permissions.data.length !== 2)
      throw permissions.error ?? new Error("Missing permissions")
    const grants = await admin
      .from("user_permissions")
      .insert(
        permissions.data.map((permission) => ({
          user_id: user.id,
          permission_id: permission.id,
        }))
      )
    if (grants.error) throw grants.error
    const { data: thread, error: threadError } = await admin
      .from("ai_chat_threads")
      .insert({ user_id: user.id, title: "Fixture email" })
      .select("id")
      .single()
    if (threadError) throw threadError
    const candidate = {
      type: "page-candidates",
      id: "page-candidates",
      title: "Is this the page you mean?",
      candidates: [{ id: reviewed.id, title, url: reviewed.path }],
      current: 0,
    }
    const extraction = {
      facts: ["Send new requests to the operations team."],
      chatter: "",
      unclear: [],
      source: { sender: "Alex", date: "March 2", subject: "Policy" },
    }
    const { data: message, error: messageError } = await admin
      .from("ai_chat_messages")
      .insert({
        thread_id: thread.id,
        user_id: user.id,
        role: "assistant",
        content: "Here is the closest match.",
        metadata: {
          cards: [candidate],
          miloEdit: {
            stage: "ready_to_find_page",
            sourceMessageId: crypto.randomUUID(),
            extraction,
          },
        },
      })
      .select("id")
      .single()
    if (messageError) throw messageError
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/chat", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { threads: [] } })
      const events = [
        { type: "meta", threadId: thread.id },
        { type: "token", token: "Here is the closest match." },
        { type: "card", messageId: message.id, card: candidate },
        {
          type: "done",
          threadId: thread.id,
          assistantMessageId: message.id,
          citations: [],
        },
      ]
      return route.fulfill({
        contentType: "text/event-stream",
        body: events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      })
    })
    // The chat is mocked, while confirmation, approval and undo use the local API.
    await page.route("**/api/wiki/chat/card-action", (route) =>
      route.continue()
    )
    await signInAsSeededUser(page, email)
    await page.goto("/home")
    const search = page.getByRole("textbox", { name: "Ask Milo" }).last()
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    await expect(async () => {
      await search.fill(
        "Update the wiki\nFrom: Alex\nSend new requests to the operations team."
      )
      await search.press("Enter")
      await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })
    await dialog.getByRole("button", { name: "Yes, this one" }).click()
    const proposed = dialog.getByRole("region", {
      name: `Proposed edit: ${title}`,
    })
    await expect(proposed.getByText(/operations team/).first()).toBeVisible()
    // A concurrent save makes the proposal stale; redo must use the new base.
    const { data: concurrent, error: concurrentError } = await admin
      .from("wiki_page_revisions")
      .insert({
        node_id: reviewed.id,
        blocks: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "The original policy remains. A concurrent update.",
                styles: {},
              },
            ],
            children: [],
          },
        ],
        plain_text: "The original policy remains. A concurrent update.",
        change_note: "Concurrent edit",
      })
      .select("id")
      .single()
    if (concurrentError) throw concurrentError
    const { error: pointerError } = await admin
      .from("wiki_nodes")
      .update({ current_revision_id: concurrent.id })
      .eq("id", reviewed.id)
    if (pointerError) throw pointerError
    await proposed.getByRole("button", { name: "Approve" }).click()
    await expect(
      proposed.getByText(
        "This page changed since the proposal. Want me to redo it?"
      )
    ).toBeVisible()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-stale.png`
        ),
        animations: "disabled",
      })
    await proposed.getByRole("button", { name: "Redo proposal" }).click()
    await expect(
      proposed.getByText("Proposal updated. Review it before approving.")
    ).toBeVisible()
    await proposed.getByRole("button", { name: "Approve" }).click()
    const applied = dialog.getByRole("region", { name: `Applied: ${title}` })
    await expect(applied.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      reviewed.path
    )
    await expect(applied.getByRole("button", { name: "Undo" })).toBeEnabled()
    await expect(
      applied.getByText(/Send new requests to the operations team/)
    ).toBeVisible()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-applied.png`
        ),
        animations: "disabled",
      })
    const { data: source, error: sourceError } = await admin
      .from("knowledge_sources")
      .select("id,metadata")
      .eq("source_type", "wiki_page")
      .eq("source_id", reviewed.id)
      .single()
    if (sourceError) throw sourceError
    const { data: chunks, error: chunksError } = await admin
      .from("knowledge_chunks")
      .select("content")
      .eq("source_id", source.id)
    if (chunksError) throw chunksError
    expect(
      chunks.some((chunk) =>
        chunk.content.includes("Send new requests to the operations team.")
      )
    ).toBe(true)
    const wiki = await context.newPage()
    await wiki.goto(reviewed.path)
    await expect(
      wiki.getByText("Send new requests to the operations team.").first()
    ).toBeVisible()
    await enableEditorMode(wiki)
    const date = wiki.getByRole("button", { name: /Last updated/ })
    await date.scrollIntoViewIfNeeded()
    await date.click()
    await expect(
      wiki.getByRole("menuitem", { name: "Current version" })
    ).toBeVisible()
    await applied.getByRole("button", { name: "Undo" }).click()
    await expect(
      applied.getByText("Previous version restored.").first()
    ).toBeVisible()
    await expect(applied.getByRole("button", { name: "Undo" })).toBeDisabled()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-undone.png`
        ),
        animations: "disabled",
      })
    await wiki.reload()
    await expect(
      wiki
        .getByText("The original policy remains. A concurrent update.")
        .first()
    ).toBeVisible()
    await expect(
      wiki.getByText("Send new requests to the operations team.")
    ).toHaveCount(0)
    const restoredDate = wiki.getByRole("button", { name: /Last updated/ })
    await restoredDate.scrollIntoViewIfNeeded()
    await restoredDate.click()
    await expect(
      wiki.getByRole("menuitem", { name: /Updated from email/ })
    ).toBeVisible()
    const revisions = await revisionTexts(reviewed.id)
    expect(
      revisions.some((revision) =>
        revision.change_note?.startsWith("Updated from email")
      )
    ).toBe(true)
    expect(
      revisions.some((revision) =>
        revision.change_note?.startsWith("Restored from")
      )
    ).toBe(true)
    await wiki.close()
  })
}
