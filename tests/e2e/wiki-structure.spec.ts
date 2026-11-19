import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  serviceWiki,
  setWikiEditorMode,
  signInAsSeededUser,
  wikiPathForNode,
} from "./wiki-reviewed-helpers"

test("section and group listings sort, navigate, and fit on phones for editors and viewers", async ({
  page,
}) => {
  const db = serviceWiki()
  const ids: string[] = []
  const suffix = crypto.randomUUID().slice(0, 8)
  async function insert(
    parentId: string,
    title: string,
    type: "folder" | "page",
    status: "draft" | "published" = "published"
  ) {
    const { data, error } = await db
      .from("wiki_nodes")
      .insert({
        parent_id: parentId,
        title,
        slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
        type,
        status,
      })
      .select("id")
      .single()
    if (error || !data)
      throw error ?? new Error("Unable to create wiki fixture")
    ids.unshift(data.id)
    return data.id as string
  }
  await page.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  )
  await mockMiloChatApi(page)
  try {
    const { data: root, error } = await db
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "canopy-wiki")
      .is("parent_id", null)
      .single()
    if (error || !root) throw error ?? new Error("Missing wiki root")
    const section = await insert(root.id, "Structure Section", "folder")
    const group = await insert(section, "Structure Group", "folder")
    await insert(section, "Zebra Page", "page")
    await insert(section, "Alpha Page", "page")
    await insert(group, "Group Page", "page")
    await insert(group, "Draft Page", "page", "draft")
    const sectionPath = await wikiPathForNode(section)
    const groupPath = await wikiPathForNode(group)

    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(sectionPath)
    await setWikiEditorMode(page, true)
    const main = page.getByRole("main").last()
    const table = main.getByRole("table")
    await expect(
      table.getByRole("link", { name: "Structure Group" })
    ).toHaveAttribute("href", groupPath)
    await expect(
      table
        .getByRole("row")
        .filter({ has: table.getByRole("link", { name: "Structure Group" }) })
    ).toContainText("2 pages")
    await table.getByRole("button", { name: "Name" }).click()
    await expect(table.getByRole("row").nth(1)).toContainText("Alpha Page")
    await table.getByRole("button", { name: "Updated" }).click()
    await expect(
      table.getByRole("columnheader", { name: "Updated" })
    ).toHaveAttribute("aria-sort", "ascending")
    const groupRow = table
      .getByRole("row")
      .filter({ has: table.getByRole("link", { name: "Structure Group" }) })
    const lastCell = groupRow.locator("td").last()
    const box = await lastCell.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(page).toHaveURL(new RegExp(`${groupPath}$`))
    await expect(
      main.getByRole("table").getByRole("link", { name: "Draft Page" })
    ).toBeVisible()
    await expect(
      main.getByRole("table").getByText("Draft", { exact: true })
    ).toBeVisible()

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const container = main.locator('[data-slot="table-container"]')
      await expect(container).toBeVisible()
      expect(
        await container.evaluate(
          (element) => element.scrollWidth <= element.clientWidth
        )
      ).toBe(true)
      await expect(main.getByRole("link", { name: "Group Page" })).toBeVisible()
    }

    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(groupPath)
    await expect(main.getByRole("link", { name: "Group Page" })).toBeVisible()
    await expect(main.getByRole("link", { name: "Draft Page" })).toHaveCount(0)
    await expect(main.getByText("Draft", { exact: true })).toHaveCount(0)
  } finally {
    for (const id of ids) {
      const { error } = await db.from("wiki_nodes").delete().eq("id", id)
      if (error) throw error
    }
  }
})
