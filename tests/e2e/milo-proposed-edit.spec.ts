import { expect, test } from "@playwright/test"
import path from "node:path"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, prefix: "01" },
  { name: "mobile", width: 390, height: 844, prefix: "02" },
]) {
  test(`reviews and adjusts a proposed edit on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await mockMiloChatApi(page)
    const lines = Array.from(
      { length: 18 },
      (_, index) => `Unchanged policy ${index + 1}.`
    )
    const before = [...lines, "Call 555-0100 for help."].join("\n")
    const after = [...lines, "Call 555-0200 for help."].join("\n")
    const candidate = {
      type: "page-candidates",
      id: "choices",
      title: "Is this the page you mean?",
      current: 0,
      candidates: [{ id: "policy", title: "Loan policy", url: "/wiki/1/2" }],
    }
    const proposal = {
      type: "proposed-edit",
      id: "proposed-edit",
      pageTitle: "Loan policy",
      pageId: "policy",
      baseRevisionId: "revision",
      before,
      after,
      summary: "I updated the contact number.",
      notAdded: ["The table needs a manual update."],
      nonTextNotes: [
        "A picture was taken out. This comparison cannot show the picture, so check the page.",
      ],
      blocks: [],
      plain_text: after,
    }
    let calls = 0
    await page.route("**/api/wiki/chat", (route) => {
      calls += 1
      const card =
        calls === 1
          ? candidate
          : {
              ...proposal,
              after: `${after}\nThe old number is 555-0100.`,
              summary: "I kept the old number too.",
            }
      return route.fulfill({
        contentType: "text/event-stream",
        body: [
          { type: "meta", threadId: "thread" },
          {
            type: "token",
            token:
              calls === 1
                ? "Here is the closest match."
                : "Here is the revised proposal.",
          },
          { type: "card", messageId: `message-${calls}`, card },
          {
            type: "done",
            threadId: "thread",
            assistantMessageId: `message-${calls}`,
            citations: [],
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      })
    })
    await page.route("**/api/wiki/chat/card-action", async (route) => {
      const action = route.request().postDataJSON().action
      await route.fulfill({
        json:
          action === "approve"
            ? { status: "not-implemented" }
            : {
                status: "ok",
                card: { ...candidate, outcome: "confirmed" },
                proposal,
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
    await dialog.getByRole("button", { name: "Yes, this one" }).click()
    const card = dialog
      .getByRole("region", { name: "Proposed edit: Loan policy" })
      .first()
    await expect(card.getByText("I updated the contact number.")).toBeVisible()
    await expect(
      card.getByRole("button", { name: /Show \d+ lines that don't change/ })
    ).toBeVisible()
    await expect(card.getByText("Not added")).toBeVisible()
    await expect(card.getByText("Needs a manual check")).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-proposal.png`
        ),
        animations: "disabled",
      })
    await card.getByRole("button", { name: "Approve" }).click()
    await expect(
      card.getByText("This action isn't available yet.")
    ).toBeVisible()
    await dialog
      .getByRole("textbox", { name: "Ask a follow-up" })
      .fill("Keep the old number too")
    await dialog.getByRole("button", { name: "Send follow-up" }).click()
    const revised = dialog
      .getByRole("region", { name: "Proposed edit: Loan policy" })
      .last()
    await expect(revised.getByText("I kept the old number too.")).toBeVisible()
    await revised.scrollIntoViewIfNeeded()
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `${viewport.prefix}-revised.png`
        ),
        animations: "disabled",
      })
  })
}
