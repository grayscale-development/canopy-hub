import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
  wikiPathForNode,
} from "./wiki-reviewed-helpers"

const sectionId = "10000000-0000-4000-8000-000000000002"
const publishedId = "10000000-0000-4000-8000-000000000004"
const draftId = "10000000-0000-4000-8000-000000000005"
const archivedId = "10000000-0000-4000-8000-000000000006"

async function screenshot(page: Page, name: string) {
  const dir = process.env.CANOPY_TAG_QA_SHOTS
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await page.addStyleTag({
    content: "nextjs-portal { visibility: hidden !important; }",
  })
  await page.screenshot({ path: path.join(dir, name) })
}

test("combined tags work for managers and readers, with flat page tags", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = serviceWiki()
  const suffix = Date.now().toString(36)
  const globalName = `QA Global ${suffix}`
  const sectionName = `QA Section ${suffix}`
  const privateName = `QA Draft ${suffix}`
  const longName = `QA${"longtag".repeat(7)}${suffix}`
  const created: string[] = []
  let longPageId: string | undefined
  const longPageTitle = `QA${"longpagetitle".repeat(8)}${suffix}`
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort()
  })
  await mockMiloChatApi(page)
  try {
    const { data: tags, error: tagError } = await admin
      .from("wiki_tags")
      .insert([
        { name: globalName, scope: "global", section_id: null },
        { name: sectionName, scope: "section", section_id: sectionId },
        { name: privateName, scope: "global", section_id: null },
        { name: longName, scope: "global", section_id: null },
      ])
      .select("id,name")
    if (tagError || !tags) throw tagError ?? new Error("No tags created")
    created.push(...tags.map((tag) => tag.id))
    const id = (name: string) => tags.find((tag) => tag.name === name)!.id
    const { data: parent, error: parentError } = await admin
      .from("wiki_nodes")
      .select("parent_id")
      .eq("id", publishedId)
      .single()
    if (parentError || !parent?.parent_id)
      throw parentError ?? new Error("Published page has no parent")
    const { data: longPage, error: pageError } = await admin
      .from("wiki_nodes")
      .insert({
        parent_id: parent.parent_id,
        type: "page",
        slug: `qa-long-${suffix}`,
        title: longPageTitle,
        status: "published",
      })
      .select("id")
      .single()
    if (pageError || !longPage)
      throw pageError ?? new Error("Long page was not created")
    longPageId = longPage.id
    const { error: assignmentError } = await admin
      .from("wiki_page_tags")
      .insert([
        { node_id: publishedId, tag_id: id(globalName) },
        { node_id: publishedId, tag_id: id(sectionName) },
        { node_id: publishedId, tag_id: id(longName) },
        { node_id: longPageId, tag_id: id(longName) },
        { node_id: draftId, tag_id: id(privateName) },
        { node_id: archivedId, tag_id: id(privateName) },
      ])
    if (assignmentError) throw assignmentError
    const hash = `tag-${sectionName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${sectionId}`
    const query = `?tag=${encodeURIComponent(sectionName)}&section=${sectionId}#${hash}`

    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    for (const [width, height, prefix] of [
      [1440, 900, "01"],
      [390, 844, "02"],
      [320, 700, "02-small"],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto(`/wiki/tags/manage${query}`)
      await expect(page).toHaveURL(
        new RegExp(`/wiki/tags\\?tag=.*&section=${sectionId}#${hash}$`)
      )
      await expect(
        page.getByRole("heading", { name: "Tags", exact: true })
      ).toBeVisible()
      const row = page.locator("tr").filter({
        has: page.getByRole("button", { name: sectionName, exact: true }),
      })
      await expect(row).toHaveClass(/bg-muted/)
      await expect(
        row.getByRole("button", { name: sectionName, exact: true })
      ).toHaveAttribute("aria-expanded", "true")
      await expect(
        page.getByRole("link", { name: "Funding Checklist" })
      ).toBeVisible()
      await expect(
        row.getByRole("button", { name: /Actions for/ })
      ).toBeVisible()
      const table = page.locator("table")
      const wrapper = page
        .locator('[data-slot="table-container"]')
        .filter({ has: table })
      await expect(table).toBeVisible()
      await page.getByRole("button", { name: longName, exact: true }).click()
      await expect(
        page.getByRole("button", { name: longName, exact: true })
      ).toHaveAttribute("aria-expanded", "true")
      await expect(
        page.getByRole("link", { name: longPageTitle })
      ).toBeVisible()
      await expect
        .poll(() =>
          wrapper.evaluate(
            (element) => element.scrollWidth - element.clientWidth
          )
        )
        .toBeLessThanOrEqual(0)
      await screenshot(page, `${prefix}-manager-deep-link.png`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole("textbox", { name: "Search tags" }).fill(privateName)
    const privateRow = page.locator("tr").filter({
      has: page.getByRole("button", { name: privateName, exact: true }),
    })
    await expect(
      privateRow.getByRole("button", { name: privateName, exact: true })
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      page.getByText("No published pages use this tag yet.")
    ).toBeVisible()
    await expect(page.locator("table").getByText("Draft SOP")).toHaveCount(0)
    await expect(page.locator("table").getByText("Archived SOP")).toHaveCount(0)
    await page
      .getByRole("textbox", { name: "Search tags" })
      .fill(`missing-${suffix}`)
    await expect(page.getByText("No tags match your search.")).toBeVisible()
    await page.getByRole("textbox", { name: "Search tags" }).fill(privateName)
    await privateRow.getByRole("button", { name: /Actions for/ }).click()
    await expect(
      page.getByRole("menuitem", { name: "Delete", exact: true })
    ).toHaveAttribute("data-disabled", "")
    await page.getByRole("menuitem", { name: "Rename" }).click()
    const rename = page.getByRole("dialog", { name: "Rename tag" })
    await expect(rename).toContainText("2 pages")
    await rename
      .getByRole("textbox", { name: "Tag name" })
      .fill(`${privateName} renamed`)
    await rename.getByRole("button", { name: "Confirm" }).click()
    await expect(rename).toBeHidden()
    await expect(page.getByRole("status")).toHaveText("Tag updated.")

    await page.goto(await wikiPathForNode(publishedId))
    await enableEditorMode(page)
    await page.getByRole("button", { name: "Edit page tags" }).click()
    const dialog = page.getByRole("dialog", { name: "Page tags" })
    await dialog
      .getByRole("textbox", { name: "Search or create a tag" })
      .click()
    const list = dialog.getByLabel("Available tags")
    await expect(
      list.getByRole("button", { name: `${globalName}, Global` })
    ).toBeVisible()
    await expect(
      list.getByRole("button", { name: sectionName, exact: true })
    ).toBeVisible()
    await expect(list.getByText("In this section")).toHaveCount(0)
    await screenshot(page, "03-manager-picker-desktop.png")
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "Edit page tags" }).click()
    await expect(dialog).toHaveCSS("opacity", "1")
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    await screenshot(page, "04-manager-picker-mobile.png")
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()

    await signInAsSeededUser(page, "standard@canopy.test")
    for (const [width, height, prefix] of [
      [1440, 900, "05"],
      [390, 844, "06"],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto(`/wiki/tags${query}`)
      await expect(
        page.getByRole("heading", { name: "Tags", exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Funding Checklist" })
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: /Actions for/ })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Delete unused tags" })
      ).toHaveCount(0)
      await expect(page.locator("table").getByText("Draft SOP")).toHaveCount(0)
      await screenshot(page, `${prefix}-viewer-deep-link.png`)
    }
    await page.getByRole("textbox", { name: "Search tags" }).fill(privateName)
    await expect(
      page.getByRole("button", { name: `${privateName} renamed` })
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      page.getByText("No published pages use this tag yet.")
    ).toBeVisible()
    await expect(page.locator("table").getByText("Draft SOP")).toHaveCount(0)
    await expect(page.locator("table").getByText("Archived SOP")).toHaveCount(0)
  } finally {
    if (longPageId) {
      const { error } = await admin
        .from("wiki_nodes")
        .delete()
        .eq("id", longPageId)
      if (error) throw error
    }
    if (created.length) {
      const { error: assignmentError } = await admin
        .from("wiki_page_tags")
        .delete()
        .in("tag_id", created)
      if (assignmentError) throw assignmentError
      const { error: tagError } = await admin
        .from("wiki_tags")
        .delete()
        .in("id", created)
      if (tagError) throw tagError
    }
  }
})
