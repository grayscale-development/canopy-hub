import { mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

async function shot(page: Page, name: string) {
  const directory = process.env.CANOPY_TAG_SHOTS_DIR
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    fullPage: true,
  })
}

test("wiki tags can be edited, created and browsed @wiki", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = process.env.CANOPY_TAG_STAMP ?? String(Date.now())
  const tag = `Tag smoke ${stamp}`
  const slug = `tag-smoke-${stamp}`
  const title = `Tag smoke page ${stamp}`
  const fixture = await createReviewedPage({
    slug,
    title,
    paragraphs: ["Tag smoke fixture."],
  })
  const db = serviceWiki()
  let createdId: string | undefined
  try {
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(fixture.path)
    await enableEditorMode(page)
    await page
      .getByRole("button", { name: "More actions for this page" })
      .click()
    await page.getByRole("menuitem", { name: "Edit details" }).click()
    await page.locator("#wiki-edit-tags").fill(tag)
    await page.locator("#wiki-edit-tags").press("Enter")
    await shot(page, "01-desktop-edit-details")
    // The expanded picker collapses on blur and shifts the Save button.
    await page.locator("#wiki-edit-title").focus()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText(tag).first()).toBeVisible()

    await page.goto("/wiki/canopy-wiki/operations/closing")
    await enableEditorMode(page)
    await page.getByRole("button", { name: "Add to Closing" }).first().click()
    await page.getByRole("menuitem", { name: "Page", exact: true }).click()
    await page.locator("#wiki-create-title").fill(`${title} created`)
    await page.locator("#wiki-create-tags").fill(tag)
    await page.locator("#wiki-create-tags").press("Enter")
    await shot(page, "02-desktop-create-page")
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create", exact: true })
      .click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText(`${title} created`).first()).toBeVisible()
    const created = await db
      .from("wiki_nodes")
      .select("id,tags")
      .eq("title", `${title} created`)
      .single()
    expect(created.error).toBeNull()
    expect(created.data?.tags).toEqual([tag])
    createdId = created.data!.id

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/wiki/canopy-wiki/operations/closing")
    await enableEditorMode(page)
    await page.getByRole("button", { name: "Add to Closing" }).first().click()
    await page.getByRole("menuitem", { name: "Page", exact: true }).click()
    await page.locator("#wiki-create-title").fill(`${title} narrow`)
    await page.locator("#wiki-create-tags").fill(tag)
    await page.locator("#wiki-create-tags").press("Enter")
    await shot(page, "03-narrow-create-page")
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create", exact: true })
      .click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await page.goto(
      `/wiki/canopy-wiki/operations/closing/tag-smoke-page-${stamp}`
    )
    await enableEditorMode(page)
    await page
      .getByRole("button", { name: "More actions for this page" })
      .click()
    await page.getByRole("menuitem", { name: "Edit details" }).click()
    await shot(page, "04-narrow-edit-details")
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click()

    await page.goto("/wiki/tags")
    await expect(
      page.getByRole("heading", { name: "Tags", exact: true })
    ).toBeVisible()
    await shot(page, "05-narrow-tags-directory")

    for (const [label, width, height, offset] of [
      ["desktop", 1440, 900, 6],
      ["narrow", 390, 844, 10],
    ] as const) {
      await page.setViewportSize({ width, height })
      for (const [mode, step] of [
        ["on", 0],
        ["off", 2],
      ] as const) {
        await page.goto(`/wiki/tags?tag=${encodeURIComponent(tag)}`)
        const toggle = page.getByRole("switch", {
          name: "Toggle wiki editor mode",
        })
        if (
          (await toggle.getAttribute("aria-checked")) !== String(mode === "on")
        )
          await toggle.click()
        await expect(page.getByText(tag).first()).toBeVisible()
        await shot(
          page,
          `${String(offset + step).padStart(2, "0")}-${label}-${mode}-directory-deep-link`
        )
        await page.goto("/wiki/canopy-wiki/operations")
        await page.getByRole("button", { name: tag, exact: true }).click()
        await expect(
          page.getByRole("button", { name: tag, exact: true })
        ).toHaveAttribute("aria-pressed", "true")
        await shot(
          page,
          `${String(offset + step + 1).padStart(2, "0")}-${label}-${mode}-section-filter`
        )
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockMiloChatApi(page)
    await page.goto("/wiki/canopy-wiki/operations")
    await page.waitForLoadState("networkidle")
    const search = page.getByRole("textbox", { name: "Ask Milo" }).first()
    await search.fill(tag)
    await expect(search).toHaveValue(tag)
    await shot(page, "14-desktop-header-search")
    await search.fill(tag)
    await search.press("Enter")
    await expect(page.getByRole("dialog", { name: "Ask Milo" })).toBeVisible()
  } finally {
    await db
      .from("knowledge_sources")
      .delete()
      .eq("source_type", "wiki_page")
      .eq("source_id", fixture.id)
    if (createdId) await db.from("wiki_nodes").delete().eq("id", createdId)
    await db.from("wiki_nodes").delete().like("title", `${title}%`)
    await db.from("wiki_nodes").delete().eq("id", fixture.id)
    await db.from("wiki_tags").delete().eq("name", tag)
  }
})
