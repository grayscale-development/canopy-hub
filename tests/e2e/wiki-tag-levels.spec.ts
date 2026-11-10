import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.use({ trace: "off", screenshot: "off" })

async function screenshot(locator: Locator, name: string) {
  const directory = process.env.CANOPY_TAG_QA_SHOTS
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  const hideDevBadge = await locator.page().addStyleTag({
    content: "nextjs-portal { visibility: hidden !important; }",
  })
  try {
    await locator.screenshot({ path: path.join(directory, name) })
  } finally {
    await hideDevBadge.evaluate((style) => style.parentNode?.removeChild(style))
  }
}

async function openCreatePage(page: Page) {
  await expect(async () => {
    await page.goto("/wiki/canopy-wiki/operations/closing")
    await expect(
      page.getByRole("switch", { name: "Toggle wiki editor mode" })
    ).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 20_000, intervals: [1000, 2000] })
  await enableEditorMode(page)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Page", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add Page" })
  await expect(dialog).toBeVisible()
  return dialog
}

async function openDetails(page: Page) {
  const trigger = page.getByRole("button", {
    name: "More actions for this page",
  })
  if ((page.viewportSize()?.width ?? 1440) < 600) {
    await trigger.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("menuitem", { name: "Edit details" }).focus()
    await page.keyboard.press("Enter")
  } else {
    await trigger.click()
    await page.getByRole("menuitem", { name: "Edit details" }).click()
  }
  const dialog = page.getByRole("dialog", { name: "Edit page" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("textbox", { name: "Search or create a tag" }).click()
  return dialog
}

test("creates and reuses section and global tags on a page @wiki-reviewed", async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const title = `Tag levels QA ${suffix}`
  const sectionName = `Section QA ${suffix}`
  const globalName = `Global QA ${suffix}`
  const admin = serviceWiki()
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text())
  })
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort()
  })

  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    let dialog = await openCreatePage(page)
    await dialog.getByRole("textbox", { name: "Title" }).fill(title)
    const search = dialog.getByRole("textbox", {
      name: "Search or create a tag",
    })
    await search.fill(sectionName)
    await expect(
      dialog.getByRole("button", { name: /This section only/ })
    ).toBeVisible()
    await search.press("Enter")
    await search.fill(globalName)
    await dialog.getByRole("switch", { name: /Make global/ }).click()
    await dialog.getByRole("button", { name: /Create.*Global/ }).click()
    await expect(
      dialog.getByRole("button", { name: `Remove ${sectionName}` })
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: `Remove ${globalName}, global tag` })
    ).toBeVisible()
    await screenshot(dialog, "01-desktop-create-page.png")
    await dialog.getByRole("button", { name: "Create", exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator("h1").filter({ hasText: title })).toBeVisible()
    await expect(
      page.getByRole("link", { name: `Global tag: ${globalName}` })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: sectionName, exact: true })
    ).toBeVisible()
    await screenshot(
      page.getByRole("link", { name: sectionName, exact: true }).locator(".."),
      "02-desktop-pills.png"
    )

    dialog = await openDetails(page)
    await expect(
      dialog.getByRole("button", { name: `Remove ${sectionName}` })
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: `Remove ${globalName}, global tag` })
    ).toBeVisible()
    await screenshot(dialog, "03-desktop-edit-details.png")
    await dialog.getByRole("button", { name: `Remove ${sectionName}` }).click()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    dialog = await openDetails(page)
    await expect(
      dialog.getByRole("button", { name: `Remove ${sectionName}` })
    ).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot(dialog, "04-narrow-edit-details.png")
    await dialog
      .getByRole("button", { name: `Remove ${globalName}, global tag` })
      .click()
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    await expect(
      page.getByRole("link", { name: sectionName, exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: `Global tag: ${globalName}` })
    ).toHaveCount(0)
    dialog = await openDetails(page)
    const editSearch = dialog.getByRole("textbox", {
      name: "Search or create a tag",
    })
    await editSearch.fill(globalName.toLowerCase())
    await expect(dialog.getByText("Use existing")).toBeVisible()
    await editSearch.press("Enter")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    await expect(
      page.getByRole("link", { name: `Global tag: ${globalName}` })
    ).toBeVisible()
    await screenshot(
      page.getByRole("link", { name: sectionName, exact: true }).locator(".."),
      "05-narrow-pills.png"
    )

    const { data: created, error: nodeError } = await admin
      .from("wiki_nodes")
      .select("id,parent_id")
      .eq("title", title)
      .single()
    expect(nodeError).toBeNull()
    const { data: section, error: sectionError } = await admin
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "operations")
      .single()
    expect(sectionError).toBeNull()
    const { data: assignments, error: assignmentError } = await admin
      .from("wiki_page_tags")
      .select("wiki_tags(name,scope,section_id)")
      .eq("node_id", created!.id)
    expect(assignmentError).toBeNull()
    expect(assignments?.map((row) => row.wiki_tags)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: sectionName,
          scope: "section",
          section_id: section!.id,
        }),
        expect.objectContaining({
          name: globalName,
          scope: "global",
          section_id: null,
        }),
      ])
    )

    dialog = await openCreatePage(page)
    const narrowSearch = dialog.getByRole("textbox", {
      name: "Search or create a tag",
    })
    await narrowSearch.fill(sectionName.toLowerCase())
    await expect(dialog.getByText("Use existing")).toBeVisible()
    await narrowSearch.press("Enter")
    await narrowSearch.fill(globalName.toLowerCase())
    await expect(dialog.getByText("Use existing")).toBeVisible()
    await narrowSearch.press("Enter")
    await screenshot(dialog, "06-narrow-create-page.png")
    await page.keyboard.press("Escape")
    // The existing app sidebar produces this hydration error in Next's dev
    // server; keep checking for any other browser errors during local QA.
    if (process.env.CANOPY_TAG_QA_SHOTS) {
      expect(
        pageErrors.filter(
          (error) =>
            !error.includes("JWT issued at future") &&
            !(
              error.includes("Hydration failed") &&
              error.includes('data-sidebar="menu-button"') &&
              error.includes('href="/home"')
            )
        )
      ).toEqual([])
    }
  } finally {
    // Only remove the uniquely named page and tags created by this test.
    const { data: testPages, error: findPageError } = await admin
      .from("wiki_nodes")
      .select("id")
      .eq("title", title)
    if (findPageError) throw findPageError
    for (const testPage of testPages ?? []) {
      const { error: removeSourceError } = await admin
        .from("knowledge_sources")
        .delete()
        .eq("source_type", "wiki_page")
        .eq("source_id", testPage.id)
      if (removeSourceError) throw removeSourceError
    }
    const { error: removePageError } = await admin
      .from("wiki_nodes")
      .delete()
      .eq("title", title)
    if (removePageError) throw removePageError
    const { error: removeTagsError } = await admin
      .from("wiki_tags")
      .delete()
      .in("name", [sectionName, globalName])
    if (removeTagsError) throw removeTagsError
  }
})
