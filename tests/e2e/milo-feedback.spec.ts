import { mkdirSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.describe.configure({ mode: "serial" })

test("rates a Milo answer on desktop and narrow screens", async ({ page }) => {
  test.setTimeout(120_000)
  const shots = process.env.CANOPY_MILO_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  for (const [label, width, height, email] of [
    ["desktop", 1440, 900, "wiki-manager@canopy.test"],
    ["narrow", 390, 844, "standard@canopy.test"],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme: "light" })
    await signInAsSeededUser(page, email)
    await page.goto("/wiki/999999999")
    await page.evaluate(() => localStorage.clear())
    await mockMiloChatApi(page)
    let shared = 0
    await page.route("**/api/wiki/chat/flag", async (route) => {
      shared++
      expect(route.request().postDataJSON().reason).toBe(
        "Reason: Missing information\nMessage: The answer is incomplete"
      )
      await route.fulfill({ status: 200, json: { ok: true } })
    })
    await page.route("**/api/wiki/chat/rating", async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } })
    })
    await page
      .getByRole("textbox", { name: "Search with Milo" })
      .fill("Where is the wiki?")
    await page
      .getByRole("main")
      .last()
      .getByRole("button", { name: "Search" })
      .click()
    const dialog = page.getByRole("dialog", { name: "Milo" })
    const up = dialog.getByRole("button", {
      name: "Helpful answer",
      exact: true,
    })
    const down = dialog.getByRole("button", {
      name: "Unhelpful answer",
      exact: true,
    })
    await expect(up).toBeVisible()
    await up.click()
    await expect(up).toHaveAttribute("aria-pressed", "true")
    await down.click()
    const feedback = page.getByRole("dialog", { name: "What went wrong?" })
    await expect(feedback).toBeVisible()
    await expect(
      page.locator(
        width < 640
          ? '[data-slot="sheet-content"]'
          : '[data-slot="dialog-content"]'
      )
    ).toHaveCount(1)
    expect(shared).toBe(0)
    if (shots)
      await page.screenshot({
        animations: "disabled",
        path: path.join(
          shots,
          label === "desktop"
            ? "03-sharing-desktop.png"
            : "04-sharing-narrow.png"
        ),
      })
    await feedback.getByRole("button", { name: "Missing information" }).click()
    await feedback
      .getByLabel("Tell managers more (optional)")
      .fill("The answer is incomplete")
    await feedback.getByRole("button", { name: "Cancel" }).click()
    await expect(feedback).toBeHidden()
    await expect(down).toHaveAttribute("aria-pressed", "true")
    expect(shared).toBe(0)
    await down.click()
    await feedback.getByRole("button", { name: "Missing information" }).click()
    await feedback
      .getByLabel("Tell managers more (optional)")
      .fill("The answer is incomplete")
    await feedback.getByRole("button", { name: "Send to managers" }).click()
    await expect(feedback).toBeHidden()
    await expect(
      page.getByText("Thanks, managers will see this.")
    ).toBeVisible()
    await expect(down).toHaveAttribute("aria-pressed", "true")
    expect(shared).toBe(1)
    await dialog.getByRole("button", { name: "Minimize Milo" }).click()
    await expect(dialog).toBeHidden()
    await page.evaluate(() => localStorage.clear())
    await page.unrouteAll({ behavior: "wait" })
  }
})

test("managers review shared flags and private gap counts", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const shots = process.env.CANOPY_MILO_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const admin = serviceWiki()
  const fixtureTitle = `Feedback fixture ${randomUUID()}`
  const fixture = await createReviewedPage({
    slug: `feedback-${randomUUID()}`,
    title: fixtureTitle,
    paragraphs: ["Synthetic feedback fixture."],
  })
  const threadId = randomUUID()
  const questionId = randomUUID()
  const answerId = randomUUID()
  const privateId = randomUUID()
  const sourceId = randomUUID()
  try {
    const users = await admin.auth.admin.listUsers()
    const owner = users.data.users.find(
      (user) => user.email === "standard@canopy.test"
    )
    expect(owner).toBeTruthy()
    const check = (error: { message: string } | null) => {
      if (error) throw new Error(error.message)
    }
    check(
      (
        await admin.from("knowledge_sources").insert({
          id: sourceId,
          source_type: "wiki_page",
          source_id: fixture.id,
          title: fixtureTitle,
          url: fixture.path,
          content_hash: sourceId,
        })
      ).error
    )
    check(
      (
        await admin
          .from("ai_chat_threads")
          .insert({ id: threadId, user_id: owner!.id })
      ).error
    )
    check(
      (
        await admin.from("ai_chat_messages").insert([
          {
            id: questionId,
            thread_id: threadId,
            user_id: owner!.id,
            role: "user",
            content: "Shared synthetic question?",
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: answerId,
            thread_id: threadId,
            user_id: owner!.id,
            role: "assistant",
            content: "Shared synthetic answer",
            metadata: { abstained: true },
            created_at: "2026-01-01T00:00:01Z",
          },
          {
            id: privateId,
            thread_id: threadId,
            user_id: owner!.id,
            role: "assistant",
            content: "Private unshared answer",
            metadata: { abstained: true },
            created_at: "2026-01-01T00:00:02Z",
          },
        ])
      ).error
    )
    check(
      (
        await admin.from("ai_chat_citations").insert(
          [answerId, privateId].map((message_id) => ({
            message_id,
            knowledge_source_id: sourceId,
            title: fixtureTitle,
            url: fixture.path,
          }))
        )
      ).error
    )
    check(
      (
        await admin.from("ai_chat_message_flags").insert({
          user_id: owner!.id,
          thread_id: threadId,
          user_message_id: questionId,
          assistant_message_id: answerId,
          reason: "Synthetic reason",
          acknowledged: true,
          user_message_content: "Shared synthetic question?",
          assistant_message_content: "Shared synthetic answer",
        })
      ).error
    )

    check(
      (
        await admin.from("ai_chat_message_flags").insert({
          user_id: owner!.id,
          thread_id: threadId,
          user_message_id: questionId,
          assistant_message_id: privateId,
          reason: "Not shared",
          acknowledged: false,
          user_message_content: "Private unshared question",
          assistant_message_content: "Private unshared answer",
        })
      ).error
    )

    // Delete as the owner through the API before opening the manager queue.
    await signInAsSeededUser(page, "standard@canopy.test")
    const deleted = await page.request.delete(
      `/api/wiki/chat?threadId=${threadId}`
    )
    expect(deleted.status()).toBe(200)
    expect(
      (await page.request.get(`/api/wiki/chat?threadId=${threadId}`)).status()
    ).toBe(404)
    const list = await page.request.get("/api/wiki/chat")
    expect(
      (await list.json()).threads.some(
        (thread: { id: string }) => thread.id === threadId
      )
    ).toBe(false)

    for (const [label, width, height] of [
      ["desktop", 1440, 900],
      ["narrow", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: "light" })
      await signInAsSeededUser(page, "admin@canopy.test")
      await page.goto("/settings/milo")
      await expect(page.getByText(`${fixtureTitle}: 2`)).toBeVisible()
      await page.goto("/settings/feedback")
      await expect(
        page.getByRole("heading", { name: "Feedback", exact: true })
      ).toBeVisible()
      const item = page
        .locator("article")
        .filter({ hasText: "Synthetic reason" })
      await item.getByRole("button").click()
      const detail = page.getByRole("dialog", { name: "Milo answer" })
      await expect(detail.getByText("Shared synthetic question?")).toBeVisible()
      await expect(detail.getByText("Shared synthetic answer")).toBeVisible()
      await expect(detail.getByText("Synthetic reason")).toBeVisible()
      await expect(page.getByText("Private unshared answer")).toHaveCount(0)
      await expect(
        detail.getByRole("link", { name: fixtureTitle })
      ).toHaveAttribute("href", fixture.path)
      if (shots)
        await page.screenshot({
          animations: "disabled",
          path: path.join(
            shots,
            label === "desktop"
              ? "05-feedback-desktop.png"
              : "06-feedback-narrow.png"
          ),
          fullPage: true,
        })
      await detail
        .getByRole("button", { name: /Add to eval set|View eval snippet/ })
        .click()
      const dialog = page.getByRole("dialog", { name: "Prepare an eval case" })
      await expect(
        dialog.getByText(/replace-with-anonymized-synthetic-question/)
      ).toBeVisible()
      await expect(dialog).not.toContainText("Shared synthetic question?")
      if (shots && label === "desktop")
        await page.screenshot({
          animations: "disabled",
          path: path.join(shots, "07-eval-snippet.png"),
        })
      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(dialog).toBeHidden()
      await detail.getByRole("button", { name: "Mark resolved" }).click()
      await expect(item).toHaveCount(0)
      await page.getByRole("button", { name: "Resolved", exact: true }).click()
      await expect(item).toBeVisible()
      await item.getByRole("button").click()
      await detail.getByRole("button", { name: "Reopen" }).click()
      await expect(item).toHaveCount(0)
    }
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto("/settings/feedback")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText("Shared synthetic question?")).toHaveCount(0)
    await expect(page.getByText("Questions Milo couldn't answer")).toHaveCount(
      0
    )
    const response = await page.request.patch(
      `/api/settings/milo-flags/${(await admin.from("ai_chat_message_flags").select("id").eq("assistant_message_id", answerId).single()).data!.id}`,
      { data: { status: "closed" } }
    )
    expect(response.status()).toBe(403)
  } finally {
    await admin.from("ai_chat_threads").delete().eq("id", threadId)
    await admin.from("knowledge_sources").delete().eq("id", sourceId)
    await admin.from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
