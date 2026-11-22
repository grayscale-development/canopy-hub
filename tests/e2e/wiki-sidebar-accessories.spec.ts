import path from "node:path"
import { expect, test, type Locator } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import {
  serviceWiki,
  setWikiEditorMode,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("sidebar accessories stay aligned across editor modes and viewport sizes", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const db = serviceWiki()
  const ids: string[] = []
  const stamp = crypto.randomUUID().slice(0, 8)
  const shots = process.env.CANOPY_140_SHOTS

  async function insertNode(
    parentId: string,
    title: string,
    type: "folder" | "page",
    status: "published" | "draft" | "archived"
  ) {
    const { data, error } = await db
      .from("wiki_nodes")
      .insert({
        parent_id: parentId,
        title,
        slug: `${title.toLowerCase().replaceAll(" ", "-")}-${stamp}`,
        type,
        status,
        sort_order: -100,
      })
      .select("id")
      .single()
    if (error || !data)
      throw error ?? new Error("Unable to create wiki fixture")
    ids.unshift(data.id)
    return data.id
  }

  async function center(locator: Locator) {
    return locator.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })
  }

  async function expectAligned(slots: Locator[]) {
    const centers = await Promise.all(slots.map(center))
    for (const point of centers.slice(1))
      expect(Math.abs(point.x - centers[0].x)).toBeLessThan(1)
    for (const slot of slots) {
      const [item, row] = await Promise.all([
        center(slot),
        center(slot.locator("..")),
      ])
      expect(Math.abs(item.y - row.y)).toBeLessThan(1)
      const accessory = slot.locator(":scope > :first-child")
      if (await accessory.count()) {
        const accessoryCenter = await center(accessory)
        expect(Math.abs(accessoryCenter.x - item.x)).toBeLessThan(1)
        expect(Math.abs(accessoryCenter.y - row.y)).toBeLessThan(1)
      }
    }
  }

  try {
    const { data: root, error } = await db
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "canopy-wiki")
      .is("parent_id", null)
      .single()
    if (error || !root) throw error ?? new Error("Missing seeded wiki root")
    const section = await insertNode(
      root.id,
      `Alignment ${stamp}`,
      "folder",
      "published"
    )
    await insertNode(section, `Draft ${stamp}`, "page", "draft")
    await insertNode(section, `Archived ${stamp}`, "page", "archived")
    const groupSection = await insertNode(
      root.id,
      `Groups ${stamp}`,
      "folder",
      "published"
    )
    const group = await insertNode(
      groupSection,
      `Group ${stamp}`,
      "folder",
      "published"
    )
    await insertNode(group, `Published ${stamp}`, "page", "published")

    await mockMiloChatApi(page)
    await page.emulateMedia({ colorScheme: "light" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto("/wiki/1")
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    const sectionToggle = sidebar.getByRole("button", {
      name: `Toggle Alignment ${stamp}`,
    })
    await expect(sectionToggle).toHaveAttribute("aria-expanded", "true")
    const groupToggle = sidebar.getByRole("button", {
      name: `Toggle Group ${stamp}`,
    })
    await groupToggle.click()
    await expect(groupToggle).toHaveAttribute("aria-expanded", "true")
    for (const title of ["Hub", "Operations"]) {
      const toggle = sidebar.getByRole("button", { name: `Toggle ${title}` })
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click()
      await expect(toggle).toHaveAttribute("aria-expanded", "false")
    }
    const draft = sidebar
      .getByRole("link", { name: `Draft ${stamp} Draft` })
      .getByRole("img", { name: "Draft" })
    const published = sidebar.getByRole("link", { name: `Published ${stamp}` })
    const sectionAdd = sidebar.getByRole("button", {
      name: `Add to Alignment ${stamp}`,
    })
    const groupAdd = sidebar.getByRole("button", {
      name: `Add to Group ${stamp}`,
    })
    const sectionArchive = sidebar
      .locator("section")
      .filter({
        has: page.getByRole("link", { name: `Alignment ${stamp}` }),
      })
      .getByRole("button", { name: "Toggle Archived" })
      .locator("..")
      .getByText("1", { exact: true })
    const globalArchive = sidebar
      .getByRole("button", { name: "Toggle Archive", exact: true })
      .locator("..")
      .locator("span.rounded-full")

    for (const [width, height, device] of [
      [1440, 900, "desktop"],
      [390, 844, "mobile"],
    ] as const) {
      await page.setViewportSize({ width, height })
      if (device === "mobile") {
        await page.getByRole("button", { name: "Pages", exact: true }).click()
      }
      await setWikiEditorMode(page, false)
      await expect(draft).toBeVisible()
      await expect(sectionAdd).toHaveCount(0)
      await expect(globalArchive).toHaveCount(0)
      await expectAligned([
        draft.locator(".."),
        published.locator(":scope > :last-child"),
      ])
      if (shots) {
        await draft.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await page.screenshot({
          path: path.join(
            shots,
            `0${device === "desktop" ? 1 : 2}-manager-editor-off-${device}.png`
          ),
          animations: "disabled",
          style: "nextjs-portal { visibility: hidden }",
        })
      }
      await setWikiEditorMode(page, true)
      await expect(sectionAdd).toBeVisible()
      await expect(sectionArchive).toBeVisible()
      await expect(globalArchive).toBeVisible()
      await expectAligned([
        sectionAdd.locator(".."),
        groupAdd.locator(".."),
        draft.locator(".."),
        sectionArchive.locator(".."),
        globalArchive.locator(".."),
        published.locator(":scope > :last-child"),
      ])
      await sectionAdd.hover()
      await expectAligned([
        sectionAdd.locator(".."),
        groupAdd.locator(".."),
        draft.locator(".."),
        sectionArchive.locator(".."),
        globalArchive.locator(".."),
      ])
      if (shots) {
        await sectionArchive.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await page.screenshot({
          path: path.join(
            shots,
            `0${device === "desktop" ? 3 : 4}-manager-editor-on-${device}.png`
          ),
          animations: "disabled",
          style: "nextjs-portal { visibility: hidden }",
        })
      }
    }
  } finally {
    for (const id of ids) {
      const { error } = await db.from("wiki_nodes").delete().eq("id", id)
      if (error) throw error
    }
  }
})
