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
    await expect(page.getByText(/Milo moved here/)).toBeVisible()
    await page.getByRole("button", { name: "Dismiss Milo tip" }).click()
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
    const source = panel.getByRole("link", { name: "Wiki", exact: true })
    await expect(source).toBeVisible()
    await source.click()
    await expect(page).toHaveURL(/\/wiki\/1$/)
    await expect(panel).toBeVisible()
    await page.reload()
    await expect(panel).toBeVisible()
    await expect(panel.getByText("Where is the Wiki?")).toBeVisible()
    await panel.getByRole("button", { name: "Close" }).click()
    await expect(launcher).toBeFocused()
    await expect(page.getByText(/Milo moved here/)).toHaveCount(0)
    await page.keyboard.press("Control+j")
    await expect(panel).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
  })
}
