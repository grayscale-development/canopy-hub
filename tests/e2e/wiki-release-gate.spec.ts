import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import {
  createReport,
  readData,
  resolutionGuards,
} from "../../scripts/wiki-link-audit"
import {
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
  wikiPathForNode,
} from "./wiki-reviewed-helpers"

test("numeric routes, rewritten content, tags, history and permissions across both areas @smoke", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  const db = serviceWiki()
  const token = randomUUID()
  const ids: string[] = []
  let tagId: string | undefined
  let userId: string | undefined
  const add = async (parent: string, type: "folder" | "page", name: string) => {
    const { data, error } = await db
      .from("wiki_nodes")
      .insert({
        parent_id: parent,
        type,
        slug: `${name}-${token}`,
        title: `${name} ${token}`,
        status: "published",
      })
      .select("id,slug,title")
      .single()
    if (error) throw error
    ids.push(data.id)
    return data
  }
  try {
    const { data: roots, error } = await db
      .from("wiki_nodes")
      .select("id,slug,title")
      .is("parent_id", null)
      .in("slug", ["canopy-wiki", "learning-hub"])
    if (error) throw error
    expect(roots).toHaveLength(2)
    const canopy = roots!.find((root) => root.slug === "canopy-wiki")!
    const learning = roots!.find((root) => root.slug === "learning-hub")!
    const section = await add(canopy.id, "folder", "section")
    const group = await add(section.id, "folder", "group")
    const source = await add(group.id, "page", "release-notes")
    const otherSection = await add(learning.id, "folder", "learning-section")
    const otherGroup = await add(otherSection.id, "folder", "learning-group")
    const target = await add(otherGroup.id, "page", "target")
    const oldHref = `/wiki/${learning.slug}/${otherSection.slug}/${otherGroup.slug}/${target.slug}`
    const blocks = [
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            href: oldHref,
            content: [
              { type: "text", text: "Release destination", styles: {} },
            ],
          },
        ],
      },
    ]
    const revisions = await db
      .from("wiki_page_revisions")
      .insert([
        { node_id: source.id, blocks, plain_text: "Release destination" },
        {
          node_id: target.id,
          blocks: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Target content", styles: {} }],
            },
          ],
          plain_text: "Target content",
        },
      ])
      .select("id,node_id")
    if (revisions.error) throw revisions.error
    for (const revision of revisions.data) {
      const updated = await db
        .from("wiki_nodes")
        .update({ current_revision_id: revision.id })
        .eq("id", revision.node_id)
      if (updated.error) throw updated.error
    }
    const tag = await db
      .from("wiki_tags")
      .insert({ name: `Release ${token}` })
      .select("id,name")
      .single()
    if (tag.error) throw tag.error
    tagId = tag.data.id
    const assignment = await db
      .from("wiki_page_tags")
      .insert({ node_id: source.id, tag_id: tagId })
    if (assignment.error) throw assignment.error

    // Exercise the same preview and transaction as the release rewrite.
    const data = await readData(db)
    const report = createReport(data, "canopy.example")
    const linkedIds = new Set(
      report.rows
        .filter((row) => row.location === "wiki" && row.current)
        .map((row) => row.revision)
    )
    const linked = data.revisions
      .filter((revision) => linkedIds.has(revision.id))
      .map((revision) => ({
        node_id: revision.node_id,
        revision_id: revision.id,
        blocks: revision.blocks,
      }))
      .sort((a, b) => a.node_id.localeCompare(b.node_id))
    expect(report.changes.map((change) => change.node_id)).toEqual([source.id])
    const apply = await db.rpc("apply_wiki_link_rewrite", {
      p_guards: resolutionGuards(report.rows, data.nodes),
      p_linked_pages: linked,
      p_site_host: report.siteHost,
      p_changes: report.changes,
    })
    if (apply.error) throw apply.error

    const sourcePath = await wikiPathForNode(source.id)
    const targetPath = await wikiPathForNode(target.id)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    for (const node of [
      canopy,
      section,
      group,
      source,
      learning,
      otherSection,
      otherGroup,
      target,
    ]) {
      const nodePath = await wikiPathForNode(node.id)
      await page.goto(nodePath)
      await expect(page).toHaveURL(new RegExp(`${nodePath}$`))
      await expect(page.getByRole("main").last()).toContainText(node.title)
    }
    await page.goto(await wikiPathForNode(canopy.id))
    await page
      .getByRole("main")
      .last()
      .getByRole("link", { name: section.title, exact: true })
      .click()
    await page
      .getByRole("main")
      .last()
      .getByRole("link", { name: group.title, exact: true })
      .click()
    await page
      .getByRole("main")
      .last()
      .getByRole("button", { name: tag.data.name, exact: true })
      .click()
    await expect(
      page
        .getByRole("main")
        .last()
        .getByRole("link", { name: source.title, exact: true })
    ).toBeVisible()
    await page
      .getByRole("main")
      .last()
      .getByRole("link", { name: source.title, exact: true })
      .click()
    await expect(
      page.getByRole("navigation", { name: "breadcrumb" })
    ).toContainText(group.title)
    const link = page
      .getByRole("main")
      .last()
      .getByRole("link", { name: "Release destination" })
    await expect(link).toHaveAttribute("href", targetPath)
    const popupPromise = page.waitForEvent("popup")
    await link.click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(new RegExp(`${targetPath}$`))
    await expect(popup.getByRole("main").last()).toContainText(target.title)
    await popup.close()
    await page.goto(targetPath)
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`))
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${sourcePath}$`))
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`))
    const tab = await context.newPage()
    await tab.goto(sourcePath)
    await expect(tab.getByRole("main").last()).toContainText(source.title)
    await tab.close()
    await page.goto("/wiki/tags")
    await page.getByRole("textbox", { name: "Search tags" }).fill(tag.data.name)
    await page
      .getByRole("main")
      .last()
      .getByRole("link", { name: new RegExp(source.title) })
      .click()
    await expect(page).toHaveURL(new RegExp(`${sourcePath}$`))
    if (process.env.CANOPY_RELEASE_SHOTS) {
      mkdirSync(process.env.CANOPY_RELEASE_SHOTS, { recursive: true })
      await page.screenshot({
        path: path.join(process.env.CANOPY_RELEASE_SHOTS, "release-page.png"),
      })
    }

    await enableEditorMode(page)
    const sidebar = page.locator("[data-wiki-sidebar-scroll]")
    for (const node of [section, group]) {
      const oldPath = await wikiPathForNode(node.id)
      await sidebar
        .getByRole("button", { name: `Edit ${node.title}` })
        .click({ force: true })
      const dialog = page.getByRole("dialog", { name: /Edit (section|group)/ })
      await dialog
        .getByRole("textbox", { name: "Title" })
        .fill(`Renamed ${node.title}`)
      await dialog.getByRole("button", { name: "Save", exact: true }).click()
      await page.goto(oldPath)
      await expect(page).toHaveURL(new RegExp(`${oldPath}$`))
      await expect(page.getByRole("main").last()).toContainText(
        `Renamed ${node.title}`
      )
    }
    await page.goto(sourcePath)
    await expect(page.getByRole("main").last()).toContainText(source.title)

    const outsider = await db.auth.admin.createUser({
      email: `${token}@canopy.test`,
      password: "canopy-test-password",
      email_confirm: true,
    })
    if (outsider.error) throw outsider.error
    userId = outsider.data.user.id
    await signInAsSeededUser(page, `${token}@canopy.test`)
    await page.goto(sourcePath)
    await expect(page).toHaveURL(/\/home$/)
  } finally {
    if (userId) await db.auth.admin.deleteUser(userId)
    for (const id of [...ids].reverse())
      await db.from("wiki_nodes").delete().eq("id", id)
    if (tagId) await db.from("wiki_tags").delete().eq("id", tagId)
  }
})
