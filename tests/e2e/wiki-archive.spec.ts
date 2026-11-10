import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.setTimeout(120_000)

test("managers can find and restore archived wiki items while viewers cannot see them", async ({
  page,
}) => {
  const db = serviceWiki()
  const ids: string[] = []
  const stamp = crypto.randomUUID().slice(0, 8)
  const shotDir = process.env.CANOPY_QA_SHOTS_DIR
  async function shot(name: string) {
    if (shotDir) {
      await page.mouse.move(5, 5)
      await page.screenshot({
        path: `${shotDir}/${name}.png`,
        style: "nextjs-portal { visibility: hidden }",
        animations: "disabled",
      })
    }
  }
  async function insertNode(
    parentId: string,
    slug: string,
    title: string,
    type: "page" | "folder",
    status: "published" | "archived"
  ) {
    const { data, error } = await db
      .from("wiki_nodes")
      .insert({
        parent_id: parentId,
        slug: `${slug}-${stamp}`,
        title,
        type,
        status,
        sort_order: -100,
      })
      .select("id,slug")
      .single()
    if (error || !data) throw error ?? new Error("Unable to create fixture")
    ids.unshift(data.id)
    return data
  }
  async function revision(nodeId: string) {
    const { data, error } = await db
      .from("wiki_page_revisions")
      .insert({
        node_id: nodeId,
        blocks: [
          { type: "paragraph", content: "A practical guide for the team." },
        ],
        plain_text: "A practical guide for the team.",
      })
      .select("id")
      .single()
    if (error || !data) throw error ?? new Error("Unable to create revision")
    const result = await db
      .from("wiki_nodes")
      .update({ current_revision_id: data.id })
      .eq("id", nodeId)
    if (result.error) throw result.error
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
      "team-handbook",
      "Team Handbook",
      "folder",
      "published"
    )
    const live = await insertNode(
      section.id,
      "onboarding-checklist",
      "Onboarding Checklist",
      "page",
      "published"
    )
    await revision(live.id)
    const live2 = await insertNode(
      section.id,
      "client-communications",
      "Client Communications",
      "page",
      "published"
    )
    await revision(live2.id)
    const old = await insertNode(
      section.id,
      "legacy-onboarding",
      "Legacy Onboarding Guide",
      "page",
      "archived"
    )
    await revision(old.id)
    await insertNode(
      section.id,
      "retired-templates",
      "Retired Templates",
      "folder",
      "archived"
    )
    const archived1 = await insertNode(
      root.id,
      "loan-training",
      "Loan Training Library",
      "folder",
      "archived"
    )
    const archivedChild = await insertNode(
      archived1.id,
      "old-course",
      "Old Training Course",
      "page",
      "archived"
    )
    await insertNode(
      root.id,
      "compliance-resources",
      "Compliance Resources",
      "folder",
      "archived"
    )
    const sectionPath = `/wiki/canopy-wiki/${section.slug}`
    const oldPath = `${sectionPath}/${old.slug}`
    const livePath = `${sectionPath}/${live.slug}`
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(sectionPath)
    const sectionArea = page
      .locator("section")
      .filter({ has: page.getByRole("link", { name: "Team Handbook" }) })
      .first()
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    const archivedToggle = sectionArea.getByRole("button", {
      name: "Toggle Archived",
    })
    const archived = page.locator(
      `#${await archivedToggle.getAttribute("aria-controls")}`
    )
    const liveToggle = sectionArea.getByRole("button", {
      name: "Toggle Team Handbook",
    })
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "false")
    await expect(archivedToggle.locator("svg")).toHaveAttribute(
      "class",
      /size-3\.5.*transition-transform/
    )
    await expect(liveToggle.locator("svg")).toHaveAttribute(
      "class",
      /size-3\.5.*transition-transform/
    )
    await shot("01-section-archived-collapsed")
    if (shotDir) {
      await page
        .locator("[data-wiki-sidebar-scroll]")
        .screenshot({ path: `${shotDir}/10-alignment-sidebar.png` })
    }
    await archivedToggle.click()
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "true")
    await expect(archivedToggle.locator("svg")).toHaveClass(/rotate-90/)
    await expect(
      archived.getByRole("link", { name: "Legacy Onboarding Guide" })
    ).toBeVisible()
    await expect(sidebar.getByRole("button", { name: /^Restore/ })).toHaveCount(
      0
    )
    await shot("02-section-archived-expanded")
    const globalToggle = sidebar.getByRole("button", {
      name: "Toggle Archive",
      exact: true,
    })
    const global = page.locator(
      `#${await globalToggle.getAttribute("aria-controls")}`
    )
    await globalToggle.scrollIntoViewIfNeeded()
    await globalToggle.click()
    await expect(globalToggle.locator("svg")).toHaveClass(
      /size-3\.5.*transition-transform.*rotate-90/
    )
    await expect(
      global.getByRole("link", { name: "Loan Training Library" })
    ).toBeVisible()
    await global.locator("li").last().scrollIntoViewIfNeeded()
    await shot("03-global-archive")
    if (shotDir) {
      await page
        .locator("[data-wiki-sidebar-scroll]")
        .screenshot({ path: `${shotDir}/11-alignment-global.png` })
    }
    await global
      .getByRole("textbox", { name: "Search archive" })
      .fill("Compliance")
    await expect(global.getByText("Compliance Resources")).toBeVisible()
    await expect(global.getByText("Loan Training Library")).toHaveCount(0)
    await global.getByText("Compliance Resources").scrollIntoViewIfNeeded()
    await shot("04-global-archive-search")
    await global.getByRole("textbox", { name: "Search archive" }).fill("")
    await global.getByRole("textbox", { name: "Search archive" }).blur()
    await page.setViewportSize({ width: 390, height: 844 })
    await global.locator("li").last().scrollIntoViewIfNeeded()
    await shot("06-global-archive-mobile")
    await archived
      .getByRole("link", { name: "Retired Templates" })
      .scrollIntoViewIfNeeded()
    await shot("07-section-archived-mobile")
    await page.setViewportSize({ width: 1440, height: 900 })
    await archived
      .getByRole("link", { name: "Legacy Onboarding Guide" })
      .click()
    await expect(
      page.getByRole("heading", { name: "Legacy Onboarding Guide" })
    ).toBeVisible()
    await expect(
      page.getByText("This item is archived and is not visible in the Wiki.")
    ).toBeVisible()
    await shot("08-archived-page-header")
    await page.goto(`/wiki/canopy-wiki/${archived1.slug}/${archivedChild.slug}`)
    await expect(
      page.getByRole("heading", { name: "Old Training Course" })
    ).toBeVisible()
    await expect(
      page.getByText("Restore Loan Training Library first.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Restore Old Training Course" })
    ).toBeDisabled()
    await page.goto(sectionPath)
    if ((await globalToggle.getAttribute("aria-expanded")) === "false")
      await globalToggle.click()
    await global.getByRole("link", { name: "Loan Training Library" }).click()
    await expect(
      page.getByRole("heading", { name: "Loan Training Library" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Restore Loan Training Library" })
    ).toBeVisible()
    await shot("09-archived-section-header")
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(sectionPath)
    await expect(
      page
        .locator("[data-wiki-sidebar-scroll]")
        .getByRole("link", { name: "Team Handbook" })
    ).toBeVisible()
    await expect(page.getByText(/Archive \(/)).toHaveCount(0)
    await expect(page.getByText(/Archived \(/)).toHaveCount(0)
    await expect(page.getByText("Retired Templates")).toHaveCount(0)
    await expect(page.getByText("Legacy Onboarding Guide")).toHaveCount(0)
    await shot("05-non-manager-no-archive")
    await page.goto(oldPath)
    await expect(page.getByText("A practical guide for the team.")).toHaveCount(
      0
    )
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(oldPath)
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByText("This item is archived and is not visible in the Wiki.")
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Restore Legacy Onboarding Guide" })
      .click()
    await expect(
      page.getByText("A practical guide for the team.")
    ).toBeVisible()
    const { data: restoredPage } = await db
      .from("wiki_nodes")
      .select("status")
      .eq("id", old.id)
      .single()
    expect(restoredPage?.status).toBe("published")
    await page.goto(`/wiki/canopy-wiki/${archived1.slug}`)
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByText("This item is archived and is not visible in the Wiki.")
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Restore Loan Training Library" })
      .click()
    await expect(
      page.getByText("This item is archived and is not visible in the Wiki.")
    ).toBeHidden()
    await expect(
      page.getByRole("heading", { name: "Loan Training Library" })
    ).toBeVisible()
    const { data: restoredFolder } = await db
      .from("wiki_nodes")
      .select("status")
      .eq("id", archived1.id)
      .single()
    expect(restoredFolder?.status).toBe("published")
    await page.goto(livePath)
    await enableEditorMode(page)
    await page
      .getByRole("button", { name: "More actions for this page" })
      .click()
    await page.getByRole("menuitem", { name: "Archive page" }).click()
    const dialog = page.getByRole("dialog", { name: "Archive this page?" })
    await expect(dialog).toContainText("Archive in the sidebar")
    await dialog.getByRole("button", { name: "Archive", exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText("Page archived. Find it in Archive in the sidebar.")
    ).toBeVisible()
    await page.goto(livePath)
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByText("This item is archived and is not visible in the Wiki.")
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Restore Onboarding Checklist" })
      .click()
    await expect(
      page.getByText("A practical guide for the team.")
    ).toBeVisible()
  } finally {
    for (const id of ids) {
      const { error } = await db.from("wiki_nodes").delete().eq("id", id)
      if (error) throw error
    }
  }
})
