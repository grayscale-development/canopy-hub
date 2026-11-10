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

test("duplicate markers follow saved passages and remain accessible @wiki", async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(10_000)
  const stamp = randomUUID()
  const firstId = randomUUID()
  const secondId = randomUUID()
  const firstText =
    "Follow these steps when reviewing a closing package before sending it to the customer."
  const secondText =
    "Confirm that all required documents are complete and ready for final review."
  const fixture = await createReviewedPage({
    slug: `duplicates-${stamp}`,
    title: "Duplicate check fixture",
    paragraphs: [],
    extraBlocks: [firstId, secondId].map((id, index) => ({
      id,
      type: "paragraph",
      content: [
        { type: "text", text: index ? secondText : firstText, styles: {} },
      ],
      children: [],
    })),
  })
  const target = await createReviewedPage({
    slug: `duplicates-target-${stamp}`,
    title: "Closing Checklist",
    paragraphs: [firstText],
  })
  const shots = process.env.CANOPY_DUPLICATE_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: path.join(shots, name) })
  }
  let mode: "empty" | "found" | "error" = "empty"
  let release: (() => void) | undefined
  let hold = false
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: "light" })
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/duplicates", async (route) => {
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      if (mode === "error")
        return route.fulfill({ status: 500, json: { error: "Failed" } })
      return route.fulfill({
        json: {
          revisionId: fixture.revisionId,
          passages:
            mode === "empty"
              ? []
              : [firstId, secondId].map((blockId, index) => ({
                  blockId,
                  common: false,
                  matches: [
                    {
                      pageId: target.id,
                      title: "Closing Checklist",
                      path: target.path,
                      snippet: index ? secondText : firstText,
                      score: index ? 0.9 : 1,
                      type: index ? "paraphrase" : "near-exact",
                    },
                  ],
                })),
        },
      })
    })
    await signInAsLocalDev(page)
    await page.goto(fixture.path)
    await expect(page.getByText(firstText)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Check for duplicates" })
    ).toHaveCount(0)
    await enableEditorMode(page)
    const check = page.getByRole("button", { name: "Check for duplicates" })
    await expect(check).toBeEnabled()
    await shot("01-desktop-idle.png")
    hold = true
    await check.click()
    await expect(
      page.getByRole("button", { name: "Checking for duplicates..." })
    ).toBeDisabled()
    await expect.poll(() => Boolean(release)).toBe(true)
    await shot("02-desktop-loading.png")
    hold = false
    release!()
    await expect(page.getByText("No duplicates found")).toBeVisible()
    await shot("03-desktop-empty.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(check).toBeEnabled()
    await shot("09-mobile-idle.png")
    hold = true
    release = undefined
    await check.click()
    await expect(
      page.getByRole("button", { name: "Checking for duplicates..." })
    ).toBeDisabled()
    await expect.poll(() => Boolean(release)).toBe(true)
    await shot("10-mobile-loading.png")
    hold = false
    release!()
    await expect(page.getByText("No duplicates found")).toBeVisible()
    await shot("11-mobile-empty.png")
    await page.setViewportSize({ width: 1440, height: 900 })
    mode = "error"
    await check.click()
    await expect(
      page.getByText("Could not check for duplicates. Please try again.")
    ).toBeVisible()
    mode = "found"
    await check.click()
    await expect(
      page.getByText("2 passages also appear elsewhere")
    ).toBeVisible()
    const markers = page.getByRole("button", {
      name: "Passage also appears in Closing Checklist",
    })
    await expect(markers).toHaveCount(2)
    await shot("04-desktop-found.png")
    await page.getByText(firstText).hover()
    await page.locator('[data-test="dragHandle"]').first().click()
    await expect(page.getByRole("menu")).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByText(firstText).click()
    const popover = page.getByRole("dialog")
    await expect(
      popover.getByText("This also appears in", { exact: false })
    ).toContainText("Closing Checklist (Operations > Closing)")
    await expect(popover.getByText("Exact", { exact: true })).toBeVisible()
    await expect(
      popover.getByRole("link", { name: /Open page/ })
    ).toHaveAttribute("target", "_blank")
    await shot("05-desktop-popover.png")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(popover.locator(":focus")).toHaveCount(1)
    await page.keyboard.press("Escape")
    await expect(popover).toHaveCount(0)
    await page.keyboard.press("Alt+Shift+ArrowDown")
    await expect(popover.getByText("Similar", { exact: true })).toBeVisible()
    await page.keyboard.press("Alt+Shift+ArrowUp")
    await expect(popover.getByText("Exact", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.setViewportSize({ width: 390, height: 844 })
    await shot("06-mobile-found.png")
    await markers.first().click()
    await expect(popover).toBeVisible()
    await shot("07-mobile-popover.png")
    await page.keyboard.press("Escape")
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await markers.first().click()
    await expect(popover).toBeVisible()
    await shot("08-mobile-dark.png")
    await page.keyboard.press("Escape")
    const editor = page.locator(
      ".wiki-blocknote-surface [contenteditable=true]"
    )
    await page.getByText(firstText).click()
    await expect(popover).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(editor).toBeFocused()
    await page.keyboard.press("Control+Home")
    await page.keyboard.type("Changed ")
    await expect(markers).toHaveCount(1)
    await expect(check).toBeDisabled()
    await expect(
      page.getByText("Save your changes to check for duplicates")
    ).toBeVisible()
    await page.getByRole("button", { name: "Save Changes" }).click()
    await expect(page.getByText("Unsaved changes")).toHaveCount(0)
    await expect(markers).toHaveCount(0)
    const { data: node, error } = await serviceWiki()
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", fixture.id)
      .single()
    expect(error).toBeNull()
    const { data: saved, error: savedError } = await serviceWiki()
      .from("wiki_page_revisions")
      .select("blocks")
      .eq("id", node!.current_revision_id)
      .single()
    expect(savedError).toBeNull()
    expect(JSON.stringify(saved!.blocks)).not.toContain("duplicate")
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
