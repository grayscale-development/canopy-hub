import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { mockMiloChatApi, openWikiPath } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
  wikiPathForNode,
} from "./wiki-reviewed-helpers"

test.use({ trace: "off", screenshot: "off" })

test("sidebar filter finds pages without changing saved expansion @wiki", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const shotDir = process.env.CANOPY_WIKI_NAV_SHOTS
  const screenshot = async (name: string) => {
    if (!shotDir) return
    mkdirSync(shotDir, { recursive: true })
    await page.screenshot({ path: path.join(shotDir, name) })
  }
  const stamp = Date.now()
  const fixture = await createReviewedPage({
    slug: `sidebar-filter-${stamp}`,
    title: `Loan Éstimate Checklist ${stamp}`,
    paragraphs: ["Sidebar filter fixture."],
  })
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: "light" })
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto("/wiki/1")
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    const header = sidebar.locator("..")
    const operations = sidebar.getByRole("button", {
      name: "Toggle Operations",
    })
    await expect(async () => {
      if ((await operations.getAttribute("aria-expanded")) === "true")
        await operations.click()
      await expect(operations).toHaveAttribute("aria-expanded", "false", {
        timeout: 1000,
      })
    }).toPass({ timeout: 20_000 })
    await expect(operations.locator("svg")).toHaveCSS("rotate", "none")
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem(
            "wiki-sidebar:section:10000000-0000-4000-8000-000000000002"
          )
        )
      )
      .toBe("closed")
    const saved = await page.evaluate(() => ({
      section: localStorage.getItem(
        "wiki-sidebar:section:10000000-0000-4000-8000-000000000002"
      ),
      group: localStorage.getItem(
        "wiki-sidebar:group:10000000-0000-4000-8000-000000000003"
      ),
    }))
    await expect(
      header.getByRole("button", { name: "Create Section" })
    ).toHaveCount(0)
    await screenshot("00-desktop-viewer-header.png")
    await header.getByRole("button", { name: "Filter wiki navigation" }).click()
    const input = header.getByRole("textbox", {
      name: "Filter sections, groups, and pages",
    })
    await expect(input).toBeFocused()
    await input.fill(`est loan ${stamp}`)
    await expect(operations).toHaveAttribute("aria-expanded", "true")
    await expect(
      sidebar.getByRole("button", { name: "Toggle Closing" })
    ).toHaveAttribute("aria-expanded", "true")
    const result = sidebar.getByRole("link", {
      name: `Loan Éstimate Checklist ${stamp}`,
    })
    await expect(result).toBeVisible()
    await expect(result.locator("mark")).toHaveCount(3)
    await expect(operations.locator("svg")).toHaveCSS("rotate", "90deg")
    await screenshot("01-desktop-results.png")
    await input.press("ArrowDown")
    await expect(result).toBeFocused()
    await input.focus()
    await input.fill("no-such-sidebar-result")
    await expect(
      sidebar.getByText(
        'No pages, sections, or groups match "no-such-sidebar-result"'
      )
    ).toBeVisible()
    await screenshot("02-desktop-empty.png")
    await sidebar.getByRole("button", { name: "Clear filter" }).click()
    await expect(input).toBeFocused()
    await expect(operations).toHaveAttribute("aria-expanded", "false")
    expect(
      await page.evaluate(() => ({
        section: localStorage.getItem(
          "wiki-sidebar:section:10000000-0000-4000-8000-000000000002"
        ),
        group: localStorage.getItem(
          "wiki-sidebar:group:10000000-0000-4000-8000-000000000003"
        ),
      }))
    ).toEqual(saved)
    await input.fill(`loan ${stamp}`)
    await input.press("Escape")
    await expect(input).toHaveValue("")
    await input.press("Escape")
    await expect(
      header.getByRole("button", { name: "Filter wiki navigation" })
    ).toBeFocused()
    await page.setViewportSize({ width: 390, height: 844 })
    await header.getByRole("button", { name: "Filter wiki navigation" }).click()
    await input.fill(`est loan ${stamp}`)
    await expect(result).toBeVisible()
    await expect(operations.locator("svg")).toHaveCSS("rotate", "90deg")
    await screenshot("03-mobile-results.png")
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await screenshot("04-mobile-dark.png")
    await input.press("ArrowDown")
    await expect(result).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`${fixture.path}$`))
  } finally {
    const db = serviceWiki()
    await db
      .from("knowledge_sources")
      .delete()
      .eq("source_type", "wiki_page")
      .eq("source_id", fixture.id)
    await db.from("wiki_nodes").delete().eq("id", fixture.id)
  }
})

test("numeric wiki navigation survives rename and move @wiki", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const shotDir = process.env.CANOPY_WIKI_NAV_SHOTS
  const screenshot = async (name: string) => {
    if (!shotDir) return
    mkdirSync(shotDir, { recursive: true })
    await page.screenshot({ path: path.join(shotDir, name) })
  }
  const stamp = Date.now()
  const fixture = await createReviewedPage({
    slug: `numeric-nav-${stamp}`,
    title: `Numeric navigation ${stamp}`,
    paragraphs: ["Local numeric navigation fixture."],
  })
  const renamed = `Renamed navigation ${stamp}`
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await openWikiPath(page, "Canopy Wiki", "Operations", "Closing")
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    const closingToggle = sidebar.getByRole("button", {
      name: "Toggle Closing",
    })
    if ((await closingToggle.getAttribute("aria-expanded")) !== "true") {
      await closingToggle.click()
    }
    await sidebar.evaluate((element) =>
      element.setAttribute("data-nav-marker", "1")
    )
    await sidebar
      .getByRole("link", { name: `Numeric navigation ${stamp}`, exact: true })
      .click()
    await expect(
      page.locator('[data-wiki-sidebar-scroll][data-nav-marker="1"]')
    ).toHaveCount(1)
    await expect(page).toHaveURL(new RegExp(`${fixture.path}$`))
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toContainText("Operations")
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toContainText("Closing")
    await expect(
      page
        .getByRole("main")
        .last()
        .getByText("Local numeric navigation fixture.")
    ).toBeVisible()
    await screenshot("01-valid-page-desktop.png")
    await enableEditorMode(page)
    await page
      .getByRole("button", { name: "More actions for this page" })
      .click()
    await page.getByRole("menuitem", { name: "Edit details" }).click()
    const editDialog = page.getByRole("dialog", { name: "Edit page" })
    await editDialog.getByRole("textbox", { name: "Title" }).fill(renamed)
    await editDialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText(renamed, { exact: true }).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${fixture.path}$`))
    await page
      .getByRole("button", { name: "More actions for this page" })
      .click()
    await page.getByRole("menuitem", { name: "Move to..." }).click()
    const moveDialog = page.getByRole("dialog", { name: `Move ${renamed}` })
    await moveDialog.getByRole("button", { name: "Hub", exact: true }).click()
    await moveDialog.getByRole("button", { name: "Move", exact: true }).click()
    await expect.poll(() => wikiPathForNode(fixture.id)).not.toBe(fixture.path)
    const movedPath = await wikiPathForNode(fixture.id)
    await expect(page).toHaveURL(new RegExp(`${movedPath}$`))
    await page.goto(fixture.path)
    await expect(page).toHaveURL(new RegExp(`${movedPath}$`))
    await expect(page.getByText(renamed, { exact: true }).first()).toBeVisible()
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toContainText("Hub")
    await openWikiPath(page, "Learning Hub")
    await expect(
      page
        .locator("[data-wiki-sidebar-scroll]")
        .locator("..")
        .getByRole("heading", { name: "Learning Hub" })
    ).toBeVisible()
    await page.goto("/wiki/tags")
    await expect(page.getByRole("main").last()).toContainText("Tags")
    await page.setViewportSize({ width: 390, height: 844 })
    await openWikiPath(page, "Canopy Wiki", "Hub", renamed)
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toContainText("Hub")
    await expect(
      page
        .getByRole("main")
        .last()
        .getByText("Local numeric navigation fixture.")
    ).toBeVisible()

    await screenshot("04-valid-page-narrow.png")

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/wiki/old-loan_guide/123/closing")
    const missingPage = page.getByRole("main").last()
    await expect(
      missingPage.getByRole("heading", {
        name: "This link is out of date or the page was removed",
      })
    ).toBeVisible()
    await expect(
      missingPage.getByRole("textbox", { name: "Search with Milo" })
    ).toHaveValue("old loan guide closing")
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toBeVisible()
    await expect(page.locator("[data-wiki-sidebar-scroll]")).toBeVisible()
    await expect(
      page.locator('meta[name="robots"][content="noindex"]').first()
    ).toHaveCount(1)
    await screenshot("02-outdated-link-desktop.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot("03-outdated-link-narrow.png")
    await mockMiloChatApi(page)
    const chatRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/wiki/chat") && request.method() === "POST"
    )
    await missingPage.getByRole("button", { name: "Search" }).click()
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    await expect(dialog).toBeVisible()
    expect((await chatRequest).postDataJSON()).toMatchObject({
      message: "old loan guide closing",
    })
    await expect(dialog.getByRole("heading", { name: "Answer" })).toBeVisible()
    await dialog.getByRole("button", { name: "Close" }).click()
    await missingPage.getByRole("link", { name: "Go to wiki home" }).click()
    await expect(page).toHaveURL(/\/wiki$/)

    const db = serviceWiki()
    const { error } = await db
      .from("wiki_nodes")
      .update({ status: "draft" })
      .eq("id", fixture.id)
    if (error) throw error
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(movedPath)
    await expect(
      page.getByRole("main").last().getByRole("heading", {
        name: "This link is out of date or the page was removed",
      })
    ).toBeVisible()
    const deniedContent = await page.getByRole("main").last().innerText()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/wiki/1/999999999")
    await expect(page.getByRole("main").last()).toHaveText(deniedContent, {
      useInnerText: true,
    })
    await expect(
      page
        .getByRole("main")
        .last()
        .getByRole("textbox", { name: "Search with Milo" })
    ).toHaveValue("")
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toBeVisible()
    await expect(page.locator("[data-wiki-sidebar-scroll]")).toBeVisible()
    await expect(
      page.locator('meta[name="robots"][content="noindex"]').first()
    ).toHaveCount(1)
    await screenshot("05-unknown-id-desktop.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot("06-unknown-id-narrow.png")
  } finally {
    const db = serviceWiki()
    await db
      .from("knowledge_sources")
      .delete()
      .eq("source_type", "wiki_page")
      .eq("source_id", fixture.id)
    await db.from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
