import { expect, test } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

test("Switching wiki pages keeps the sidebars mounted @wiki", async ({ page }) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  const editorSwitch = page.getByRole("switch", { name: "Toggle wiki editor mode" })
  if ((await editorSwitch.getAttribute("aria-checked")) !== "true") await editorSwitch.click()
  const links = page.locator('aside a[href^="/wiki/canopy-wiki/hub/"]')
  await expect(links.first()).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as { __navMarker: string }).__navMarker = "alive"
    document.querySelector("aside")?.setAttribute("data-nav-marker", "1")
  })
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))
  const target = hrefs.find((h) => h && !h.endsWith("/hub/reports")) as string
  await page.locator(`aside a[href="${target}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(target.replace(/[/]/g, "\\/")))
  expect(await page.evaluate(() => (window as unknown as { __navMarker?: string }).__navMarker)).toBe("alive")
  await expect(page.locator("aside[data-nav-marker='1']")).toHaveCount(1)
  await expect(page.locator("h1").first()).toBeVisible()
})
