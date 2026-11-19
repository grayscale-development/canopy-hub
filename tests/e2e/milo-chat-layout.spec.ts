import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`page-aware Milo chat on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    const fixture = await createReviewedPage({
      slug: `milo-layout-${viewport.name}-${Date.now()}`,
      title: "Milo layout fixture",
      paragraphs: ["Review the checklist before closing."],
    })
    try {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await signInAsSeededUser(page, "wiki-manager@canopy.test")
      await mockMiloChatApi(page)
      let count = 0
      await page.route("**/api/wiki/chat", async (route) => {
        if (route.request().method() !== "POST") return route.fallback()
        const payload = route.request().postDataJSON()
        expect(payload.pageContext).toEqual({ pageId: fixture.id })
        const card = {
          type: "page-candidates",
          id: "choices",
          title: "Is this the page you mean?",
          current: 0,
          candidates: [
            {
              id: fixture.id,
              title: "Milo layout fixture",
              breadcrumb: "Hub > Closing",
              snippet: "Review the checklist before closing.",
              confidence: "High",
              url: fixture.path,
            },
          ],
        }
        const events = [
          { type: "meta", threadId: "thread" },
          {
            type: "token",
            token: count++
              ? "Here is the closest match I found."
              : "Review the checklist before closing. [1]",
          },
          ...(count > 1 ? [{ type: "card", messageId: "message", card }] : []),
          {
            type: "done",
            threadId: "thread",
            assistantMessageId: "message",
            citations:
              count === 1
                ? [
                    {
                      title: "Milo layout fixture",
                      url: fixture.path,
                      snippet: "Review the checklist before closing.",
                      updatedAt: new Date().toISOString(),
                    },
                  ]
                : [],
          },
        ]
        await route.fulfill({
          contentType: "text/event-stream",
          body: events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
        })
      })
      await page.goto(fixture.path)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
      const dialog = page.getByRole("dialog", { name: "Milo" })
      await expect(dialog.getByText("About: Milo layout fixture")).toBeVisible()
      await expect(
        dialog.getByRole("button", { name: "Summarize this page" })
      ).toBeVisible()
      await testInfo.attach(`empty-${viewport.name}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })
      await dialog.getByRole("button", { name: "Summarize this page" }).click()
      await expect(dialog.getByText("Sources", { exact: true })).toBeVisible()
      await testInfo.attach(`sources-${viewport.name}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })
      await dialog
        .getByRole("textbox", { name: "Ask a follow-up" })
        .fill("Update this page")
      await dialog.getByRole("button", { name: "Send follow-up" }).click()
      await expect(dialog.getByText("Is this the page you mean?")).toBeVisible()
      await testInfo.attach(`edit-card-${viewport.name}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })
    } finally {
      await serviceWiki().from("wiki_nodes").delete().eq("id", fixture.id)
    }
  })
}
