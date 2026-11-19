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

test("drag freely, persist, resize and use the keyboard", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await mockMiloChatApi(page)
  let saved: { x: number; y: number } | null = null
  await page.route("**/api/milo/preferences", async (route) => {
    if (route.request().method() === "PUT")
      saved = route.request().postDataJSON().position
    await route.fulfill({ json: { position: saved } })
  })
  await signInAsSeededUser(page, "wiki-manager@canopy.test")
  await page.goto("/home")
  const launcher = page.getByRole("button", { name: "Ask Milo", exact: true })
  await launcher.click()
  const panel = page.getByRole("dialog", { name: "Milo" })
  await expect(
    panel.getByRole("button", { name: "Move to corner" })
  ).toHaveCount(0)
  const title = panel.getByRole("heading", { name: "Milo" })
  const before = await page.evaluate(() => ({
    scroll: window.scrollY,
    selection: window.getSelection()?.toString(),
  }))
  const box = (await title.boundingBox())!
  await page.mouse.move(box.x + 5, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x - 350, box.y - 100, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => saved).not.toBeNull()
  const after = await page.evaluate(() => ({
    scroll: window.scrollY,
    selection: window.getSelection()?.toString(),
  }))
  expect(after).toEqual(before)
  const moved = (await panel.boundingBox())!
  expect(moved.x).toBeGreaterThanOrEqual(10)
  expect(moved.y).toBeGreaterThanOrEqual(10)
  expect(moved.x).toBeLessThan(800)
  const input = panel.getByRole("textbox", { name: "Ask a follow-up" })
  await input.focus()
  const savedBeforeKey = JSON.stringify(saved)
  await page.keyboard.press("Alt+ArrowRight")
  await expect.poll(() => JSON.stringify(saved)).not.toBe(savedBeforeKey)
  await expect
    .poll(async () => (await panel.boundingBox())!.x)
    .toBeGreaterThan(moved.x + 20)
  const persisted = (await panel.boundingBox())!
  await page.reload()
  await expect(panel).toBeVisible()
  await expect
    .poll(async () => Math.abs((await panel.boundingBox())!.x - persisted.x))
    .toBeLessThan(2)
  await page.setViewportSize({ width: 800, height: 600 })
  await expect
    .poll(async () => {
      const r = (await panel.boundingBox())!
      return (
        r.x >= 9.9 &&
        r.y >= 9.9 &&
        r.x + r.width <= 790.1 &&
        r.y + r.height <= 590.1
      )
    })
    .toBe(true)
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await capture(page, info, "milo-dark-desktop")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(390)
  expect(await panel.boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  })
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
      route.fulfill({ json: { position: null } })
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
    await page.setViewportSize({ width: 640, height: 450 })
    await noOverlap(panel, bar)
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
  const original = (await initial.json()).position
  const second = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })
  try {
    expect(
      (
        await page.request.put("/api/milo/preferences", {
          data: { position: { x: 1, y: 0 } },
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
            .position
      )
      .toEqual({ x: 1, y: 0 })
    const launcher = otherPage.getByRole("button", {
      name: "Ask Milo",
      exact: true,
    })
    await expect
      .poll(async () => (await launcher.boundingBox())!.y)
      .toBeLessThan(110)
  } finally {
    await page.request.put("/api/milo/preferences", {
      data: { position: original },
    })
    await second.close()
  }
})

test("touch dragging the phone launcher does not open Milo or move the page", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CDP touch input requires Chromium")
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMiloChatApi(page)
  let position: { x: number; y: number } | null = null
  await page.route("**/api/milo/preferences", async (route) => {
    if (route.request().method() === "PUT")
      position = route.request().postDataJSON().position
    await route.fulfill({ json: { position } })
  })
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto("/home")
  const launcher = page.getByRole("button", { name: "Ask Milo", exact: true })
  await expect(launcher).toBeVisible()
  const box = (await launcher.boundingBox())!
  const scroll = await page.evaluate(() => window.scrollY)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 20, y: box.y + 20 }],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 100, y: 250 }],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect.poll(() => position).not.toBeNull()
  await expect(page.getByRole("dialog", { name: "Milo" })).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll)
  await expect
    .poll(async () => (await launcher.boundingBox())!.x)
    .toBeLessThan(150)
  await cdp.detach()
})
