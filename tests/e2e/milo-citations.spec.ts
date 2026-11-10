import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.use({ trace: "off", screenshot: "off" })

test("shows an exact section and a way to flag a missing answer", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const shots = process.env.CANOPY_MILO_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const fixture = await createReviewedPage({
    slug: `milo-evidence-${Date.now()}`,
    title: "Milo citation fixture",
    paragraphs: ["Fixture introduction."],
    extraBlocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Refund status", styles: {} }],
        children: [],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Track returned checks in the refund ledger.",
            styles: {},
          },
        ],
        children: [],
      },
    ],
  })
  try {
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
      let abstained = false
      await page.route("**/api/wiki/chat", async (route) => {
        if (route.request().method() !== "POST") return route.fallback()
        const answer = abstained
          ? "I couldn't find an answer in the wiki. You can ask a manager or flag this gap."
          : "Track returned checks in the refund ledger. [1]"
        const events = [
          { type: "meta", threadId: "e2e-thread" },
          { type: "token", token: answer },
          {
            type: "done",
            threadId: "e2e-thread",
            assistantMessageId: "assistant-message",
            abstained,
            citations: [
              {
                title: "Milo citation fixture",
                url: `${fixture.path}#refund-status`,
                snippet: "Track returned checks in the refund ledger.",
                updatedAt: "2025-01-02T00:00:00Z",
                updatedBy: "Pat Example",
              },
            ],
          },
        ]
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
        })
      })
      const search = page.getByRole("textbox", { name: "Search with Milo" })
      await search.fill("Where are returned checks tracked?")
      await page
        .getByRole("main")
        .last()
        .getByRole("button", { name: "Search" })
        .click()
      const dialog = page.getByRole("dialog", { name: "Ask Milo" })
      const citation = dialog.getByRole("link", {
        name: /Milo citation fixture/,
      })
      await expect(citation).toHaveAttribute(
        "href",
        `${fixture.path}#refund-status`
      )
      await expect(citation).toContainText("Updated Jan 2, 2025 by Pat Example")
      if (shots)
        await page.screenshot({
          animations: "disabled",
          path: path.join(
            shots,
            label === "desktop"
              ? "01-citation-desktop.png"
              : "03-citation-narrow.png"
          ),
        })
      await citation.click()
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`${fixture.path}#refund-status$`))
      await expect(page.locator("#refund-status")).toHaveText("Refund status")
      await page.goto("/wiki/999999999")
      await page.evaluate(() => sessionStorage.clear())
      abstained = true
      await page
        .getByRole("textbox", { name: "Search with Milo" })
        .fill("What is the cafeteria menu?")
      await page
        .getByRole("main")
        .last()
        .getByRole("button", { name: "Search" })
        .click()
      await expect(dialog.getByText("Closest pages")).toBeVisible()
      await expect(dialog.getByText(/couldn't find an answer/)).toBeVisible()
      if (shots)
        await page.screenshot({
          animations: "disabled",
          path: path.join(
            shots,
            label === "desktop"
              ? "02-abstain-desktop.png"
              : "04-abstain-narrow.png"
          ),
        })
      await dialog.getByRole("button", { name: "Flag this gap" }).click()
      await expect(
        dialog.getByRole("button", { name: "Gap flagged" })
      ).toBeDisabled()
      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(dialog).toBeHidden()
      await page.unrouteAll({ behavior: "wait" })
    }
  } finally {
    await serviceWiki().from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
