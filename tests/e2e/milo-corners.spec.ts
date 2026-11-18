import { randomUUID } from "node:crypto"
import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

async function capture(page: Page, info: TestInfo, name: string) {
  const body = await page.screenshot({ animations: "disabled" })
  await info.attach(name, { body, contentType: "image/png" })
}

async function noOverlap(
  first: import("@playwright/test").Locator,
  second: import("@playwright/test").Locator
) {
  await expect
    .poll(async () => {
      const a = await first.boundingBox()
      const b = await second.boundingBox()
      return (
        !!a &&
        !!b &&
        (a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y)
      )
    })
    .toBe(true)
}

test("drag, corner menu, reload and screenshots", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await mockMiloChatApi(page)
  let saved = "bottom-right"
  await page.route("**/api/milo/preferences", async (route) => {
    if (route.request().method() === "PUT")
      saved = route.request().postDataJSON().corner
    await route.fulfill({ json: { corner: saved } })
  })
  await signInAsSeededUser(page, "wiki-manager@canopy.test")
  await page.goto("/home")
  const launcher = page.getByRole("button", { name: "Ask Milo", exact: true })
  await expect(launcher).toBeVisible()
  const box = (await launcher.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(40, 100, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => saved).toBe("top-left")
  await expect(page.getByRole("dialog", { name: "Milo" })).toHaveCount(0)
  await expect
    .poll(async () => (await launcher.boundingBox())!.x)
    .toBeLessThan(40)
  await launcher.click()
  const panel = page.getByRole("dialog", { name: "Milo" })
  for (const [label, corner] of [
    ["Top left", "top-left"],
    ["Top right", "top-right"],
    ["Bottom left", "bottom-left"],
    ["Bottom right", "bottom-right"],
  ]) {
    await panel.getByRole("button", { name: "Move to corner" }).click()
    await page.getByRole("menuitemradio", { name: label }).focus()
    await page.keyboard.press("Enter")
    await expect.poll(() => saved).toBe(corner)
    const bounds = (await panel.boundingBox())!
    expect(
      corner.endsWith("left") ? bounds.x : 1440 - bounds.x - bounds.width
    ).toBeLessThan(30)
    if (corner.startsWith("top")) expect(bounds.y).toBeGreaterThanOrEqual(80)
    else expect(900 - bounds.y - bounds.height).toBeLessThan(30)
    await capture(page, info, `milo-${corner}`)
  }
  const header = panel.getByRole("heading", { name: "Milo" })
  const headBox = (await header.boundingBox())!
  await page.mouse.move(headBox.x + 5, headBox.y + 5)
  await page.mouse.down()
  await page.mouse.move(60, 100, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => saved).toBe("top-left")
  await page.reload()
  await expect(panel).toBeVisible()
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(30)
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await capture(page, info, "milo-dark-desktop")
  await page.setViewportSize({ width: 390, height: 844 })
  const phoneBounds = (await panel.boundingBox())!
  expect(phoneBounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
  await capture(page, info, "milo-home-mobile")
})

test("Save bar remains accessible on desktop and phone", async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const fixture = await createReviewedPage({
    slug: `milo-corners-${randomUUID()}`,
    title: "Milo corner fixture",
    paragraphs: ["Editor content for Milo"],
  })
  try {
    await mockMiloChatApi(page)
    await page.route("**/api/milo/preferences", (route) =>
      route.fulfill({ json: { corner: "bottom-right" } })
    )
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(fixture.path)
    await enableEditorMode(page)
    const editor = page.locator(
      ".wiki-blocknote-surface [contenteditable=true]"
    )
    await editor.click()
    await page.keyboard.type("Changed ")
    const bar = page.locator('[data-milo-avoid="bottom-right"]')
    await expect(bar).toBeVisible()
    const launcher = page.getByRole("button", { name: "Ask Milo", exact: true })
    await noOverlap(launcher, bar)
    await launcher.click()
    const panel = page.getByRole("dialog", { name: "Milo" })
    await noOverlap(panel, bar)
    await capture(page, info, "milo-save-bar-desktop")
    await page.setViewportSize({ width: 640, height: 900 })
    await panel.getByRole("button", { name: "Move to corner" }).click()
    await page.getByRole("menuitemradio", { name: "Bottom left" }).click()
    await noOverlap(panel, bar)
    await panel.getByRole("button", { name: "Move to corner" }).click()
    await page.getByRole("menuitemradio", { name: "Bottom right" }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await panel.getByRole("button", { name: "Close" }).click()
    await noOverlap(launcher, bar)
    await capture(page, info, "milo-save-bar-mobile")
    await launcher.click()
    await expect(panel).toBeVisible()
    await capture(page, info, "milo-fullscreen-mobile")
  } finally {
    const { error } = await serviceWiki()
      .from("wiki_nodes")
      .delete()
      .eq("id", fixture.id)
    if (error) throw error
  }
})

test("server preference survives a fresh browser context", async ({
  browser,
  page,
}) => {
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto("/home")
  const initial = await page.request.get("/api/milo/preferences")
  expect(initial.ok()).toBeTruthy()
  const original = (await initial.json()).corner
  const second = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })
  try {
    expect(
      (
        await page.request.put("/api/milo/preferences", {
          data: { corner: "top-right" },
        })
      ).ok()
    ).toBeTruthy()
    const otherPage = await second.newPage()
    await signInAsSeededUser(otherPage, "standard@canopy.test")
    await otherPage.goto("/home")
    await expect
      .poll(
        async () =>
          (await (await otherPage.request.get("/api/milo/preferences")).json())
            .corner
      )
      .toBe("top-right")
    const launcher = otherPage.getByRole("button", {
      name: "Ask Milo",
      exact: true,
    })
    await expect
      .poll(async () => (await launcher.boundingBox())!.y)
      .toBeLessThan(110)
  } finally {
    await page.request.put("/api/milo/preferences", {
      data: { corner: original },
    })
    await second.close()
  }
})
