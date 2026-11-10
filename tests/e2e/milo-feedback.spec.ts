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
    await page.evaluate(() => sessionStorage.clear())
    await mockMiloChatApi(page)
    let shared = 0
    await page.route("**/api/wiki/chat/flag", async (route) => {
      shared++
      expect(route.request().postDataJSON().reason).toBe(
        "The answer is incomplete"
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
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
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
    await expect(dialog.getByText("Thanks for your feedback")).toBeVisible()
    await down.click()
    await expect(down).toHaveAttribute("aria-pressed", "true")
    await expect(
      dialog.getByText("Want to tell the wiki managers what went wrong?")
    ).toBeVisible()
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
    await dialog.getByRole("button", { name: "Tell managers" }).click()
    await expect(dialog.getByText(/Sharing sends your question/)).toBeVisible()
    await dialog.getByLabel("What went wrong?").fill("The answer is incomplete")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    expect(shared).toBe(0)
    await dialog.getByRole("button", { name: "Tell managers" }).click()
    await dialog.getByLabel("What went wrong?").fill("The answer is incomplete")
    await dialog.getByRole("button", { name: "Share feedback" }).click()
    await expect(dialog.getByText("Shared with wiki managers")).toBeVisible()
    expect(shared).toBe(1)
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    await page.evaluate(() => sessionStorage.clear())
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

    for (const [label, width, height] of [
      ["desktop", 1440, 900],
      ["narrow", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: "light" })
      await signInAsSeededUser(page, "admin@canopy.test")
      await page.goto("/settings/ai")
      await expect(
        page.getByRole("link", { name: "Milo feedback" })
      ).toBeVisible()
      await expect(page.getByText(`${fixtureTitle}: 2`)).toBeVisible()
      const item = page
        .locator("article")
        .filter({ hasText: "Shared synthetic question?" })
      await expect(item.getByText("Shared synthetic answer")).toBeVisible()
      await expect(item.getByText("Synthetic reason")).toBeVisible()
      await expect(item.getByText("Milo couldn't answer")).toBeVisible()
      await expect(page.getByText("Private unshared answer")).toHaveCount(0)
      await expect(
        item.getByRole("link", { name: "Open the page to fix" })
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
      await item
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
      await item.getByRole("button", { name: "Mark resolved" }).click()
      await expect(item).toHaveCount(0)
      await page.getByRole("button", { name: "Resolved", exact: true }).click()
      await expect(item).toBeVisible()
      await item.getByRole("button", { name: "Reopen" }).click()
      await expect(item).toHaveCount(0)
    }
    await signInAsSeededUser(page, "settings@canopy.test")
    await page.goto("/settings/ai")
    await expect(page.getByRole("link", { name: "Milo feedback" })).toHaveCount(
      0
    )
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
