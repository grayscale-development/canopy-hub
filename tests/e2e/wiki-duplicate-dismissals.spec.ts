import { createHash, randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { mockMiloChatApi, signInAsLocalDev } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
} from "./wiki-reviewed-helpers"

test("mark intentional, show dismissed, and undo @wiki", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = randomUUID()
  const blockId = randomUUID()
  const text = `Before publishing this procedure, record each required approval in the review log. ${stamp}`
  const passageHash = createHash("sha256")
    .update(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ")
    )
    .digest("hex")
  const fixture = await createReviewedPage({
    slug: `dismissal-${stamp}`,
    title: "Dismissal fixture",
    paragraphs: [],
    extraBlocks: [
      {
        id: blockId,
        type: "paragraph",
        content: [{ type: "text", text, styles: {} }],
        children: [],
      },
    ],
  })
  const target = await createReviewedPage({
    slug: `dismissal-target-${stamp}`,
    title: "Closing Checklist",
    paragraphs: [text],
  })
  const shots = process.env.CANOPY_DUPLICATE_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const shot = async (name: string) => {
    if (shots)
      await page.screenshot({
        path: path.join(shots, name),
        animations: "disabled",
      })
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: "light" })
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/duplicates", async (route) => {
      const { data, error } = await serviceWiki()
        .from("wiki_duplicate_dismissals")
        .select("passage_hash")
        .eq("node_id", fixture.id)
        .eq("other_node_id", target.id)
        .eq("passage_hash", passageHash)
      if (error) throw error
      const match = {
        pageId: target.id,
        revisionId: target.revisionId,
        title: "Closing Checklist",
        path: target.path,
        snippet: text,
        text,
        score: 1,
        type: "near-exact",
      }
      const hidden = Boolean(data?.length)
      await route.fulfill({
        json: {
          revisionId: fixture.revisionId,
          passages: [
            {
              blockId,
              passageHash,
              text,
              common: false,
              matches: hidden ? [] : [match],
            },
          ],
          ...(route.request().postDataJSON().includeDismissed
            ? {
                dismissed: hidden
                  ? [{ blockId, passageHash, text, match }]
                  : [],
              }
            : {}),
        },
      })
    })
    await signInAsLocalDev(page)
    await page.goto(fixture.path)
    await enableEditorMode(page)
    await page.getByRole("button", { name: "Check for duplicates" }).click()
    const marker = page.getByRole("button", {
      name: "Passage also appears in Closing Checklist",
    })
    await marker.click()
    await expect(
      page.getByRole("button", { name: "This is intentional" })
    ).toBeVisible()
    await shot("01-desktop-action.png")
    await page.getByRole("button", { name: "This is intentional" }).click()
    await expect(marker).toHaveCount(0)
    await expect(
      page.getByRole("dialog", { name: "Duplicate passages" })
    ).toHaveCount(0)
    await expect(
      page.getByText(
        "Marked as intentional. You can undo this in Show dismissed."
      )
    ).toBeVisible()
    await shot("02-desktop-confirmation.png")
    await page.getByRole("button", { name: "Show dismissed" }).click()
    await expect(
      page.getByRole("region", { name: "Dismissed duplicates" })
    ).toContainText(text)
    await shot("03-desktop-dismissed.png")
    await page.getByRole("button", { name: "Undo" }).click()
    await expect(marker).toBeVisible()
    await expect(
      page.getByText("No dismissed duplicates for this page.")
    ).toBeVisible()
    await page.getByRole("button", { name: "Hide dismissed" }).click()
    await expect(page.getByText("Dismissal undone.")).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await marker.click()
    await expect(
      page.getByRole("button", { name: "This is intentional" })
    ).toBeVisible()
    await shot("04-mobile-action.png")
    await page.getByRole("button", { name: "This is intentional" }).click()
    await expect(marker).toHaveCount(0)
    await expect(
      page.getByRole("dialog", { name: "Duplicate passages" })
    ).toHaveCount(0)
    await expect(
      page.getByText(
        "Marked as intentional. You can undo this in Show dismissed."
      )
    ).toBeVisible()
    await shot("05-mobile-confirmation.png")
    await page.getByRole("button", { name: "Show dismissed" }).click()
    await expect(
      page.getByRole("region", { name: "Dismissed duplicates" })
    ).toContainText(text)
    await shot("06-mobile-dismissed.png")
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await shot("07-mobile-dark-dismissed.png")
    await page.getByRole("button", { name: "Undo" }).click()
    await expect(marker).toBeVisible()
  } finally {
    await serviceWiki()
      .from("wiki_nodes")
      .delete()
      .in("id", [fixture.id, target.id])
  }
})
