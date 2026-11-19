import { expect, test } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import {
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("sidebar filters archived results and keeps the empty state compact", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const db = serviceWiki()
  const ids: string[] = []
  const stamp = crypto.randomUUID().slice(0, 8)
  const shots = process.env.CANOPY_123_SHOTS
  const countShots = process.env.CANOPY_124_SHOTS
  const shot = async (name: string) => {
    if (shots) {
      await page.mouse.move(5, 5)
      await page.screenshot({
        path: `${shots}/${name}.png`,
        animations: "disabled",
        style: "nextjs-portal { visibility: hidden }",
      })
    }
  }
  const countShot = async (name: string) => {
    if (countShots) {
      await page.mouse.move(5, 5)
      await page.screenshot({
        path: `${countShots}/${name}.png`,
        animations: "disabled",
        style: "nextjs-portal { visibility: hidden }",
      })
    }
  }
  async function insertNode(
    parent: string,
    title: string,
    type: "folder" | "page",
    status: "published" | "archived"
  ) {
    const { data, error } = await db
      .from("wiki_nodes")
      .insert({
        parent_id: parent,
        slug: `${title.toLowerCase().replaceAll(" ", "-")}-${stamp}`,
        title,
        type,
        status,
        sort_order: -100,
      })
      .select("id")
      .single()
    if (error || !data) throw error ?? new Error("Unable to create fixture")
    ids.unshift(data.id)
    return data.id
  }
  try {
    const { data: root, error } = await db
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "canopy-wiki")
      .is("parent_id", null)
      .single()
    if (error || !root) throw error ?? new Error("Missing wiki root")
    const section = await insertNode(
      root.id,
      `Atlas ${stamp}`,
      "folder",
      "published"
    )
    await insertNode(section, `Current ${stamp}`, "page", "published")
    await insertNode(section, `Legacy ${stamp}`, "page", "archived")
    await insertNode(section, `Retired ${stamp}`, "page", "archived")

    await page.emulateMedia({ colorScheme: "light" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto("/wiki/1")
    await enableEditorMode(page)
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    const header = sidebar.locator("..")
    const sectionArea = sidebar.locator("section").filter({
      has: page.getByRole("link", { name: `Atlas ${stamp}` }),
    })
    const sectionToggle = sectionArea.getByRole("button", {
      name: `Toggle Atlas ${stamp}`,
    })
    if ((await sectionToggle.getAttribute("aria-expanded")) === "false") {
      await sectionToggle.click()
    }
    const sectionArchive = sectionArea
      .getByRole("button", { name: "Toggle Archived" })
      .locator("..")
    const globalArchive = sidebar
      .getByRole("button", { name: "Toggle Archive", exact: true })
      .locator("..")
    await expect(sectionArchive.getByText("2", { exact: true })).toBeVisible()
    await expect(globalArchive.locator("span.rounded-full")).toHaveText(
      /^[1-9]\d*$/
    )
    await countShot("01-unfiltered-desktop")
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "Pages", exact: true }).click()
    await expect(sectionArchive.getByText("2", { exact: true })).toBeVisible()
    await countShot("02-unfiltered-mobile")
    await page.setViewportSize({ width: 1440, height: 900 })
    await header.getByRole("button", { name: "Filter wiki navigation" }).click()
    const filter = header.getByRole("textbox", {
      name: "Filter sections, groups, and pages",
    })
    await filter.fill(`no-match-${stamp}-${"x".repeat(100)}`)
    await expect(sidebar.getByText("No matches.")).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Clear filter" })
    ).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Toggle Archive", exact: true })
    ).toHaveCount(0)
    await shot("01-manager-empty-desktop")
    await page.setViewportSize({ width: 390, height: 844 })
    await shot("02-manager-empty-mobile")
    await filter.fill(`current ${stamp}`)
    await expect(
      sidebar.getByRole("link", { name: `Current ${stamp}` })
    ).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Toggle Archived" })
    ).toHaveCount(0)
    await expect(
      sidebar.getByRole("button", { name: "Toggle Archive", exact: true })
    ).toHaveCount(0)
    await filter.fill(`legacy ${stamp}`)
    const archived = sidebar.getByRole("link", { name: `Legacy ${stamp}` })
    await expect(archived).toBeVisible()
    await expect(globalArchive.getByText("1", { exact: true })).toBeVisible()
    await expect(sidebar.getByText("No matches.")).toHaveCount(0)
    await expect(
      sidebar.getByRole("link", { name: `Retired ${stamp}` })
    ).toHaveCount(0)
    await shot("03-manager-archive-mobile")
    await countShot("03-filtered-mobile")
    await page.setViewportSize({ width: 1440, height: 900 })
    await shot("04-manager-archive-desktop")
    await countShot("04-filtered-desktop")
    await filter.fill(`atlas ${stamp}`)
    await expect(sectionArchive.getByText("2", { exact: true })).toBeVisible()
    await expect(globalArchive.getByText("2", { exact: true })).toBeVisible()
    await expect(
      sidebar.getByRole("link", { name: `Legacy ${stamp}` })
    ).toHaveCount(2)
    await expect(
      sidebar.getByRole("link", { name: `Retired ${stamp}` })
    ).toHaveCount(2)
    await filter.fill("")
    await expect(
      sidebar.getByRole("button", { name: "Toggle Archive", exact: true })
    ).toHaveAttribute("aria-expanded", "false")

    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto("/wiki/1")
    await header.getByRole("button", { name: "Filter wiki navigation" }).click()
    await filter.fill(`no-match-${stamp}-${"x".repeat(100)}`)
    await expect(sidebar.getByText("No matches.")).toBeVisible()
    await expect(
      sidebar.getByRole("button", { name: "Toggle Archive", exact: true })
    ).toHaveCount(0)
    await shot("05-viewer-empty-desktop")
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "Pages", exact: true }).click()
    await shot("06-viewer-empty-mobile")
    await sidebar.getByRole("button", { name: "Clear filter" }).click()
    await expect(filter).toHaveValue("")
    await expect(filter).toBeFocused()
  } finally {
    for (const id of ids) {
      const { error } = await db.from("wiki_nodes").delete().eq("id", id)
      if (error) throw error
    }
  }
})
