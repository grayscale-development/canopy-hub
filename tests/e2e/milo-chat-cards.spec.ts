import { expect, test } from "@playwright/test"
import path from "node:path"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, prefix: "01" },
  { name: "mobile", width: 390, height: 844, prefix: "02" },
]) {
  test(`finds and confirms a page on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await mockMiloChatApi(page)
    const card = {
      type: "page-candidates",
      id: "choices",
      title: "Is this the page you mean?",
      current: 0,
      candidates: [
        {
          id: "policy",
          title: "Loan policy",
          breadcrumb: "Hub > Operations > Lending",
          updatedAt: "2026-11-01T00:00:00Z",
          snippet: "Escalations go to the operations team.",
          confidence: "High",
          url: "/wiki/1/2/3/4",
        },
        {
          id: "other",
          title: "Escalation guide",
          breadcrumb: "Hub > Operations",
          updatedAt: "2026-10-01T00:00:00Z",
          snippet: "The escalation process and contacts.",
          confidence: "Possible",
          url: "/wiki/1/2/5",
        },
      ],
    }
    await page.route("**/api/wiki/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: [
          { type: "meta", threadId: "thread" },
          { type: "token", token: "Here is the closest match I found." },
          { type: "card", messageId: "message", card },
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
    await page.route("**/api/wiki/chat/card-action", async (route) => {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          status: "ok",
          card:
            body.action === "next-page"
              ? { ...card, current: 1 }
              : { ...card, current: 1, outcome: "confirmed" },
        },
      })
    })
    await signInAsLocalDev(page)
    const search = page.getByRole("textbox", { name: "Ask Milo" }).last()
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    await expect(async () => {
      await search.fill("Update the policy")
      await search.press("Enter")
      await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })
    await expect(dialog.getByText("Is this the page you mean?")).toBeVisible()
    await expect(
      dialog.getByRole("link", { name: "Loan policy" })
    ).toHaveAttribute("href", "/wiki/1/2/3/4")
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-candidate.png`
        ),
        animations: "disabled",
      })
    await dialog.getByRole("button", { name: "Show me another" }).click()
    await expect(
      dialog.getByRole("link", { name: "Escalation guide" })
    ).toBeVisible()
    await dialog.getByRole("button", { name: "Yes, this one" }).click()
    await expect(dialog.getByText(/No changes have been made/)).toBeVisible()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-confirmed.png`
        ),
        animations: "disabled",
      })
  })
}
