import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { checkAnswer } from "../../lib/milo/evidence"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.use({ trace: "off", screenshot: "off" })

test("renders the funding answer and a calm missing-answer state", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const shots = process.env.CANOPY_MILO_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const fixture = await createReviewedPage({
    slug: `milo-funding-${Date.now()}`,
    title: "Funding Checklist",
    paragraphs: ["Complete the funding checklist before closing."],
  })
  try {
    for (const [label, width, height, email] of [
      ["desktop", 1440, 900, "wiki-manager@canopy.test"],
      ["mobile", 390, 844, "standard@canopy.test"],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: "light" })
      await signInAsSeededUser(page, email)
      await page.goto("/wiki/999999999")
      await page.evaluate(() => sessionStorage.clear())
      await mockMiloChatApi(page)
      let abstained = false
      const funding = {
        title: "Funding Checklist",
        url: fixture.path,
        snippet: "Complete the funding checklist before closing.",
      }
      const closing = {
        title: "Closing Desk Notes",
        url: "/wiki/1/16/18",
        snippet: "Notes for the closing desk.",
      }
      const tag = {
        title: "Tag: Hub Process (v2.2 Test Section)",
        url: "/wiki/tags?tag=Hub%20Process",
        snippet: "Accessible pages: Funding Checklist",
      }
      const checked = checkAnswer(
        `The best match is **Funding Checklist**: \`${fixture.path}\`.\n\n- **Closing Desk Notes**: \`/wiki/1/16/18\`\n- Hub Process tag, section v2.2 Test Section`,
        [funding, closing],
        [funding, closing, tag]
      )
      await page.route("**/api/wiki/chat", async (route) => {
        if (route.request().method() !== "POST") return route.fallback()
        const events = [
          { type: "meta", threadId: "e2e-thread" },
          {
            type: "token",
            token: abstained
              ? "I couldn't find an answer in the wiki. You can ask a manager or flag this gap."
              : checked.answer,
          },
          {
            type: "done",
            threadId: "e2e-thread",
            assistantMessageId: "assistant-message",
            abstained,
            citations: abstained ? [funding] : checked.citations,
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
      await search.fill("tell me about the funding process")
      await page
        .getByRole("main")
        .last()
        .getByRole("button", { name: "Search" })
        .click()
      const dialog = page.getByRole("dialog", { name: "Ask Milo" })
      await expect(
        dialog.getByText("tell me about the funding process")
      ).toBeVisible()
      const citation = dialog.getByRole("link", {
        name: "Funding Checklist",
        exact: true,
      })
      await expect(citation).toHaveAttribute("href", fixture.path)
      await expect(
        dialog.getByRole("link", { name: fixture.path })
      ).toHaveAttribute("href", fixture.path)
      await expect(
        dialog.getByRole("link", { name: "Closing Desk Notes" })
      ).toHaveAttribute("href", closing.url)
      await expect(
        dialog.getByRole("link", { name: "Hub Process" })
      ).toHaveAttribute("href", tag.url)
      await expect(dialog.getByText("Sources", { exact: true })).toHaveCount(0)
      await expect(dialog).not.toContainText("Not found in the wiki")
      await expect(dialog.locator("strong").first()).toContainText(
        "Funding Checklist"
      )
      if (shots)
        await page.screenshot({
          animations: "disabled",
          path: path.join(
            shots,
            label === "desktop"
              ? "01-funding-desktop.png"
              : "03-funding-mobile.png"
          ),
        })
      await citation.click()
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`${fixture.path}$`))
      await expect(page.getByRole("main").last()).toContainText(
        "Funding Checklist"
      )
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
      await expect(dialog.getByText(/couldn't find an answer/)).toBeVisible()
      await expect(dialog.getByText("Closest pages")).toHaveCount(0)
      if (shots)
        await page.screenshot({
          animations: "disabled",
          path: path.join(
            shots,
            label === "desktop"
              ? "02-abstain-desktop.png"
              : "04-abstain-mobile.png"
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
