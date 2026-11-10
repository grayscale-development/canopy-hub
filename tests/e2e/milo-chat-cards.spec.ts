import { expect, test } from "@playwright/test"
import path from "node:path"

import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, shot: "01-desktop-cards.png" },
  { name: "mobile", width: 390, height: 844, shot: "02-mobile-cards.png" },
]) {
  test(`Milo cards are accessible and restore on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await mockMiloChatApi(page)
    const cards = [
      {
        type: "page-candidates",
        id: "choices",
        title: "Is this the page?",
        candidates: [{ id: "policy", title: "Loan policy" }],
      },
      {
        type: "proposed-edit",
        id: "edit",
        pageTitle: "Loan policy",
        before: "Existing guidance",
        after: "Updated guidance",
      },
      { type: "applied-edit", id: "applied", pageTitle: "Published policy" },
      { type: "error", id: "error", message: "Something went wrong." },
      { type: "future", text: "Future card" },
    ]
    await page.route("**/api/wiki/chat?threadId=*", (route) =>
      route.fulfill({
        json: {
          messages: [
            {
              id: "message",
              role: "assistant",
              content: "Review these options.",
              cards,
            },
          ],
        },
      })
    )
    await page.route("**/api/wiki/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: [
          { type: "meta", threadId: "thread" },
          { type: "token", token: "Review these options." },
          ...cards.map((card) => ({
            type: "card",
            messageId: "message",
            card,
          })),
          {
            type: "done",
            threadId: "thread",
            assistantMessageId: "message",
            citations: [],
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      })
    )
    await page.route("**/api/wiki/chat/card-action", (route) =>
      route.fulfill({ json: { status: "not-implemented" } })
    )
    await signInAsLocalDev(page)
    const search = page.getByRole("textbox", { name: "Ask Milo" }).last()
    await expect(async () => {
      await search.fill("Update the policy")
      await search.press("Enter")
      await expect(page.getByRole("dialog", { name: "Ask Milo" })).toBeVisible({
        timeout: 2000,
      })
    }).toPass({ timeout: 20000 })
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    await expect(dialog.getByText("Is this the page?")).toBeVisible()
    await expect(dialog.getByText("Updated guidance")).toBeVisible()
    await expect(dialog.getByText("Something went wrong.")).toBeVisible()
    await expect(
      dialog.getByText("Future card", { exact: false })
    ).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Undo" })).toBeDisabled()
    const output = process.env.CANOPY_SHOTS_DIR
    if (output)
      await page.screenshot({
        path: path.join(output, viewport.shot),
        animations: "disabled",
      })
    const candidate = dialog.getByRole("button", { name: "Loan policy" })
    await candidate.focus()
    await candidate.press("Enter")
    await expect(
      dialog.getByText("This action isn't available yet.")
    ).toBeVisible()
    await page.reload()
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText("Applied: Published policy").first()
    ).toBeVisible()
  })
}
