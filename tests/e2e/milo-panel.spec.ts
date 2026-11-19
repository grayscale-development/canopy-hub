import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`floating Milo persists on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto("/login")
    await expect(
      page.getByRole("button", { name: "Ask Milo", exact: true })
    ).toHaveCount(0)
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/chat?threadId=**", (route) =>
      route.fulfill({
        json: {
          messages: [
            { id: "question", role: "user", content: "Where is the Wiki?" },
            {
              id: "answer",
              role: "assistant",
              content: "Open /wiki/1",
              citations: [
                {
                  title: "Wiki",
                  url: "/wiki/1",
                  snippet: "Seeded Wiki source.",
                },
              ],
            },
          ],
        },
      })
    )
    await signInAsLocalDev(page)
    await expect(
      page.locator("header").getByRole("textbox", { name: "Ask Milo" })
    ).toHaveCount(0)
    const tip = page.getByText(/Milo lives here now/)
    if (
      await page.evaluate(
        () => matchMedia("(hover: hover) and (pointer: fine)").matches
      )
    ) {
      await expect(tip).toBeVisible()
      const tipBox = (await tip.locator("..").boundingBox())!
      const launcherBox = (await page
        .getByRole("button", { name: "Ask Milo", exact: true })
        .boundingBox())!
      expect(tipBox.width).toBeLessThanOrEqual(280)
      expect(tipBox.x).toBeGreaterThanOrEqual(0)
      expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(viewport.width)
      expect(tipBox.y).toBeGreaterThanOrEqual(launcherBox.y)
      expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(
        launcherBox.y + launcherBox.height
      )
      await page.getByRole("button", { name: "Dismiss Milo tip" }).click()
    } else {
      await expect(tip).toHaveCount(0)
    }
    const launcher = page.getByRole("button", { name: "Ask Milo", exact: true })
    await expect(launcher).toHaveAttribute("aria-expanded", "false")
    await launcher.click()
    const panel = page.getByRole("dialog", { name: "Milo" })
    await expect(panel).toBeVisible()
    await expect(panel).not.toHaveAttribute("aria-modal", "true")
    const composer = panel.getByRole("textbox", { name: "Ask a follow-up" })
    await expect(composer).toBeFocused()
    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    if (viewport.name === "mobile") {
      expect(box!.x).toBe(0)
      expect(box!.y).toBe(0)
      expect(box!.width).toBe(viewport.width)
      expect(box!.height).toBe(viewport.height)
    } else {
      expect(box!.width).toBeLessThanOrEqual(400)
      expect(box!.height).toBeLessThanOrEqual(640)
      await expect(
        page.getByRole("heading", { name: /Welcome back/ })
      ).toBeVisible()
    }
    if (process.env.CANOPY_SHOTS_DIR)
      await page.screenshot({
        path: path.join(
          process.env.CANOPY_SHOTS_DIR,
          `milo-panel-${viewport.name}.png`
        ),
        animations: "disabled",
      })
    await composer.fill("Where is the Wiki?")
    await panel.getByRole("button", { name: "Send follow-up" }).click()
    const source = panel
      .getByRole("link", { name: "Wiki", exact: true })
      .first()
    await expect(source).toBeVisible()
    await source.click()
    await expect(page).toHaveURL(/\/wiki\/1$/)
    await expect(panel).toBeVisible()
    await page.reload()
    await expect(panel).toBeVisible()
    await expect(panel.getByText("Where is the Wiki?")).toBeVisible()
    await panel.getByRole("button", { name: "Close" }).click()
    await expect(launcher).toBeFocused()
    await expect(page.getByText(/Milo lives here now/)).toHaveCount(0)
    await page.keyboard.press("Control+j")
    await expect(panel).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
  })
}

test("coarse pointers never see or mark the tip", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      const media = original(query)
      if (query === "(hover: hover) and (pointer: fine)")
        Object.defineProperty(media, "matches", { value: false })
      return media
    }
  })
  await mockMiloChatApi(page)
  await signInAsLocalDev(page)
  await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByText(/Milo lives here now/)).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem("milo-moved-tip-seen"))
  ).toBeNull()
})

for (const viewport of [
  { width: 320, height: 844 },
  { width: 640, height: 450 },
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Milo fits ${viewport.width}px in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await mockMiloChatApi(page)
      await page.route("**/api/milo/preferences", (route) =>
        route.fulfill({ json: { position: null } })
      )
      await signInAsLocalDev(page)
      const launcher = page.getByRole("button", {
        name: "Ask Milo",
        exact: true,
      })
      await expect(launcher).toBeVisible()
      await expect
        .poll(() =>
          page
            .locator("main")
            .last()
            .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
        )
        .toBeGreaterThanOrEqual(72)
      await launcher.click()
      const panel = page.getByRole("dialog", { name: "Milo" })
      for (const name of ["New chat", "History", "Close"]) {
        const box = (await panel
          .getByRole("button", { name, exact: true })
          .boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      const suggestionButton = panel.getByRole("button", {
        name: "Where do I find the latest newsletter?",
      })
      await suggestionButton.scrollIntoViewIfNeeded()
      const suggestion = (await suggestionButton.boundingBox())!
      const composer = (await panel
        .getByRole("textbox", { name: "Ask a follow-up" })
        .boundingBox())!
      expect(suggestion.y + suggestion.height).toBeLessThan(composer.y)
      if (viewport.width < 640)
        expect(composer.y - suggestion.y - suggestion.height).toBeLessThan(50)
      const send = panel.getByRole("button", { name: "Send follow-up" })
      const contrast = await send.evaluate((el) => {
        const style = getComputedStyle(el)
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        const context = canvas.getContext("2d")!
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          const rgb = context.getImageData(0, 0, 1, 1).data
          return [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
            const channel = rgb[i] / 255
            return (
              sum +
              weight *
                (channel <= 0.04045
                  ? channel / 12.92
                  : ((channel + 0.055) / 1.055) ** 2.4)
            )
          }, 0)
        }
        const values = [
          luminance(style.color),
          luminance(style.backgroundColor),
        ].sort((a, b) => b - a)
        return (values[0] + 0.05) / (values[1] + 0.05)
      })
      expect(contrast).toBeGreaterThanOrEqual(3)
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)
      ).toBe(true)
      await panel.getByRole("button", { name: "History", exact: true }).click()
      await expect(panel.getByText("No chats yet.")).toBeVisible()
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)
      ).toBe(true)
    })
  }
}
