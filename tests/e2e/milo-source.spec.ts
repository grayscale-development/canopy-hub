import { expect, test } from "@playwright/test"
import path from "node:path"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, prefix: "01" },
  { name: "mobile", width: 390, height: 844, prefix: "02" },
]) {
  test(`pastes and confirms source on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await mockMiloChatApi(page)
    let sentSource = false
    await page.route("**/api/wiki/chat", async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const body = route.request().postData() ?? ""
      const isConfirmation = body.includes('"message":"Yes"')
      if (!isConfirmation) {
        sentSource =
          body.includes("Escalation desk closes at 5") &&
          body.includes("source.txt")
      }
      const answer = isConfirmation
        ? "Thanks, the changes are confirmed. Next: find the page. Page matching isn't available yet."
        : "I found 1 change:\n• The escalation desk closes at 5 p.m.\n\nRight?"
      await route.fulfill({
        contentType: "text/event-stream",
        body: [
          { type: "meta", threadId: "thread" },
          { type: "token", token: answer },
          {
            type: "done",
            threadId: "thread",
            userMessageId: "user",
            assistantMessageId: "assistant",
            citations: [],
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      })
    })
    await signInAsLocalDev(page)
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    await expect(async () => {
      if (!(await dialog.isVisible()))
        await page
          .getByRole("button", { name: "Open Milo chat" })
          .last()
          .click()
      await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    const search = page.getByRole("textbox", { name: "Ask Milo" }).last()
    await search.evaluate((element) => {
      const data = new DataTransfer()
      data.setData("text/plain", "From: Alex Example\nPrivate source text")
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
      )
    })
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole("textbox", { name: "Ask a follow-up" })
    await expect(input).toHaveValue("From: Alex Example\nPrivate source text")
    await input.fill(
      "Update the wiki with this\n\nFrom: Alex Example\nEscalation desk closes at 5 p.m."
    )
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "source.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Escalation desk closes at 5 p.m."),
    })
    await expect(dialog.getByText("source.txt")).toBeVisible()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-draft.png`
        ),
        animations: "disabled",
      })
    await dialog.getByRole("button", { name: "Send follow-up" }).click()
    await expect(dialog.getByText("Right?", { exact: false })).toBeVisible()
    expect(sentSource).toBe(true)
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-confirmation.png`
        ),
        animations: "disabled",
      })
    await input.fill("Yes")
    await dialog.getByRole("button", { name: "Send follow-up" }).click()
    await expect(
      dialog.getByText("Next: find the page", { exact: false })
    ).toBeVisible()
    await input.fill("x".repeat(100_001))
    await expect(dialog.getByRole("alert")).toContainText("100,000")
    await expect(
      dialog.getByRole("button", { name: "Send follow-up" })
    ).toBeDisabled()
  })
}
