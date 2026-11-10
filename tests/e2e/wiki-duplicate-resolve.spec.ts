import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
} from "./wiki-reviewed-helpers"

test("compare and review duplicate resolution @wiki", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = randomUUID()
  const blockId = randomUUID()
  const text =
    "Follow these steps when reviewing a closing package before sending it to the customer."
  const otherText =
    "Follow these steps when reviewing a closing package before sending it to a customer."
  const fixture = await createReviewedPage({
    slug: `resolve-${stamp}`,
    title: "Resolution fixture",
    paragraphs: [],
    extraBlocks: [
      {
        id: blockId,
        type: "paragraph",
        content: [{ type: "text", text, styles: {} }],
        children: [],
      },
      {
        id: randomUUID(),
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Keep this neighboring paragraph.",
            styles: {},
          },
        ],
        children: [],
      },
    ],
  })
  const target = await createReviewedPage({
    slug: `resolve-target-${stamp}`,
    title: "Closing Checklist",
    paragraphs: [otherText],
  })
  const shots = process.env.CANOPY_DUPLICATE_RESOLVE_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const shot = async (name: string) => {
    if (shots)
      await page.screenshot({
        path: path.join(shots, name),
        animations: "disabled",
      })
  }
  try {
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/duplicates", (route) =>
      route.fulfill({
        json: {
          revisionId: fixture.revisionId,
          passages: [
            {
              blockId,
              common: false,
              matches: [
                {
                  pageId: target.id,
                  revisionId: target.revisionId,
                  title: "Closing Checklist",
                  path: target.path,
                  snippet: otherText,
                  text: otherText,
                  score: 0.9,
                  type: "near-exact",
                },
              ],
            },
          ],
        },
      })
    )
    await page.emulateMedia({ colorScheme: "light" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsLocalDev(page)
    await page.goto(fixture.path)
    await enableEditorMode(page)
    await page.getByRole("button", { name: "Check for duplicates" }).click()
    const marker = page.getByRole("button", {
      name: "Passage also appears in Closing Checklist",
    })
    await expect(marker).toBeVisible()
    for (const [size, dimensions] of [
      ["desktop", { width: 1440, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(dimensions)
      await marker.click()
      const popover = page.getByRole("dialog", { name: "Duplicate passages" })
      await expect(
        popover.getByRole("button", {
          name: "Keep this and update the other page",
        })
      ).toBeVisible()
      await shot(
        size === "desktop" ? "01-desktop-popover.png" : "05-mobile-popover.png"
      )
      await popover.getByRole("button", { name: "Compare" }).click()
      const compare = page.getByRole("dialog", { name: "Compare passages" })
      await expect(compare.getByText(text, { exact: true })).toBeVisible()
      await expect(compare.getByText(otherText, { exact: true })).toBeVisible()
      await shot(
        size === "desktop" ? "02-desktop-compare.png" : "06-mobile-compare.png"
      )
      await compare.getByRole("button", { name: "Done" }).click()
      await expect(compare).toHaveCount(0)
      await marker.click()
      await popover.getByRole("button", { name: "Replace with a link" }).click()
      const preview = page.getByRole("dialog", { name: "Replace with a link" })
      await expect(preview.getByText(/See Closing Checklist/)).toBeVisible()
      await shot(
        size === "desktop" ? "03-desktop-replace.png" : "07-mobile-replace.png"
      )
      await preview.getByRole("button", { name: "Cancel" }).click()
      await expect(preview).toHaveCount(0)
    }
    await marker.click()
    await page
      .getByRole("dialog", { name: "Duplicate passages" })
      .getByRole("button", { name: "Keep this and update the other page" })
      .click()
    const wizard = page.getByRole("dialog", {
      name: "AI Update: Closing Checklist",
    })
    await expect(wizard.getByLabel("Paste text")).toHaveValue(text)
    await wizard.getByRole("button", { name: "Close" }).click()
    await expect(wizard).toHaveCount(0)
    await marker.click()
    await page
      .getByRole("dialog", { name: "Duplicate passages" })
      .getByRole("button", { name: "Replace with a link" })
      .click()
    const preview = page.getByRole("dialog", { name: "Replace with a link" })
    await preview.getByRole("button", { name: "Save change" }).click()
    await expect(preview).toHaveCount(0)
    await expect(page.getByText(/To undo, select Last updated/)).toBeVisible()
    await expect(marker).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "See Closing Checklist" })
    ).toHaveAttribute("href", target.path)
    await expect(
      page.getByText("Keep this neighboring paragraph.")
    ).toBeVisible()
    await shot("08-mobile-saved.png")
    await page.setViewportSize({ width: 1440, height: 900 })
    await shot("04-desktop-saved.png")
    const db = serviceWiki()
    const { data: node, error } = await db
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", fixture.id)
      .single()
    expect(error).toBeNull()
    expect(node!.current_revision_id).not.toBe(fixture.revisionId)
    const { data: revision, error: revisionError } = await db
      .from("wiki_page_revisions")
      .select("blocks,change_note")
      .eq("id", node!.current_revision_id)
      .single()
    expect(revisionError).toBeNull()
    expect(revision!.change_note).toBe(
      "Consolidated duplicate with Closing Checklist"
    )
    expect(JSON.stringify(revision!.blocks)).toContain(target.path)
    expect(JSON.stringify(revision!.blocks)).toContain(
      "Keep this neighboring paragraph."
    )
  } finally {
    const db = serviceWiki()
    for (const id of [fixture.id, target.id]) {
      await db
        .from("knowledge_sources")
        .delete()
        .eq("source_type", "wiki_page")
        .eq("source_id", id)
      await db.from("wiki_nodes").delete().eq("id", id)
    }
  }
})
