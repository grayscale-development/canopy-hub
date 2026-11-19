import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
  setWikiEditorMode,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

async function useLocalServices(page: Page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort()
  })
  await mockMiloChatApi(page)
}

test("pasting a list followed by a heading leaves the editor responsive", async ({
  page,
}) => {
  const fixture = await createReviewedPage({
    slug: `paste-heading-${randomUUID()}`,
    title: "Paste heading fixture",
    paragraphs: Array.from({ length: 40 }, (_, i) => `Existing paragraph ${i}`),
  })
  try {
    await useLocalServices(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(fixture.path)
    await enableEditorMode(page)
    const editor = page.locator(".bn-editor[contenteditable=true]")
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press("Control+End")
    await editor.evaluate((element) => {
      const data = new DataTransfer()
      data.setData(
        "text/html",
        "<ul><li>Paste list</li></ul><h2>Paste heading</h2><p>After</p>"
      )
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
      )
    })

    const heading = editor.getByRole("heading", { name: "Paste heading" })
    await expect(heading).toBeVisible()
    await expect(heading).not.toHaveAttribute("id", "paste-heading")
    await expect(
      page.getByRole("button", { name: "Save Changes" })
    ).toBeEnabled()

    const main = page.getByRole("main").last()
    await main.evaluate((element) => {
      element.scrollTop = 0
      window.location.hash = "paste-heading"
    })
    await expect(heading).toBeInViewport()
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
  } finally {
    await serviceWiki().from("wiki_nodes").delete().eq("id", fixture.id)
  }
})

test("heading links scroll in view and editor modes", async ({ page }) => {
  const fixture = await createReviewedPage({
    slug: `heading-links-${randomUUID()}`,
    title: "Heading links fixture",
    paragraphs: [],
    extraBlocks: [
      { type: "heading", props: { level: 1 }, content: "Parent" },
      ...Array.from({ length: 40 }, (_, i) => ({
        type: "paragraph",
        content: `Spacer paragraph ${i}`,
      })),
      // A list right before a heading froze the editor when editor mode was turned on (#215).
      { type: "bulletListItem", content: "List item before target" },
      { type: "heading", props: { level: 2 }, content: "Target" },
      { type: "paragraph", content: "End of page" },
    ],
  })
  try {
    await useLocalServices(page)
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(`${fixture.path}#parent-target`)
    const main = page.getByRole("main").last()
    const target = page.locator(".wiki-blocknote-surface h2", {
      hasText: "Target",
    })
    await expect(target).toHaveAttribute("id", "parent-target")
    await expect(target).toBeInViewport()
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)

    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(fixture.path)
    await enableEditorMode(page)
    await expect(page.locator(".bn-editor[contenteditable=true]")).toBeVisible()
    await main.evaluate((element) => {
      element.scrollTop = 0
      window.location.hash = "parent-target"
    })
    await expect(target).toBeInViewport()
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)

    await page.reload()
    await expect(page.locator(".bn-editor[contenteditable=true]")).toBeVisible()
    await expect(target).toBeInViewport()
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)

    await setWikiEditorMode(page, false)
    await expect(target).toHaveAttribute("id", "parent-target")
  } finally {
    await serviceWiki().from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
