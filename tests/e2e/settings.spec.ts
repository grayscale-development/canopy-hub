import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test("settings pages and redirects for a manager; viewer access remains gated", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await mockMiloChatApi(page)
  await signInAsSeededUser(page, "admin@canopy.test")
  const pages = [
    ["permissions", "Permissions"],
    ["requests", "Access requests"],
    ["milo", "Milo knowledge"],
    ["alerts", "Wiki alerts"],
    ["feedback", "Feedback"],
    ["data-sync", "Data syncs"],
  ] as const
  const shots = process.env.CANOPY_SETTINGS_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["phone", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    for (const [route, title] of pages) {
      await page.goto(`/settings/${route}`)
      const heading = page.getByRole("heading", {
        name: title,
        exact: true,
        level: 1,
      })
      await expect(heading).toBeVisible()
      const nav = page.getByRole("navigation", { name: "Settings sections" })
      if (device === "desktop") {
        await expect(
          nav.getByRole("link", { name: title, exact: true })
        ).toHaveAttribute("aria-current", "page")
        await expect(nav.getByRole("link")).toHaveText(
          pages.map(([, label]) => label)
        )
        expect((await nav.boundingBox())!.y).toBe(
          (await heading.boundingBox())!.y
        )
      } else {
        const select = page.getByRole("combobox", { name: "Settings section" })
        await expect(select).toHaveValue(route)
        await expect(select.locator("optgroup")).toHaveCount(0)
        await expect(select.locator("option")).toHaveText(
          pages.map(([, label]) => label)
        )
        expect((await heading.boundingBox())!.y).toBeLessThan(
          (await select.boundingBox())!.y
        )
      }
      if (route === "milo" || route === "data-sync") {
        await expect(
          page.getByRole("button", { name: "Refresh Status" })
        ).toBeEnabled()
      }
      if (route === "alerts") {
        await expect(
          page.getByText("Last successful run:", { exact: false })
        ).toBeVisible()
        await expect(
          page.getByRole("button", { name: "Run alerts now" })
        ).toBeDisabled()
        await expect(
          page.getByText("Alerts can't run in this environment.")
        ).toBeVisible()
      }
      if (shots)
        await page.screenshot({
          path: path.join(shots, `settings-${route}-${device}.png`),
          animations: "disabled",
          fullPage: true,
        })
    }
  }
  await page.goto("/settings/ai")
  await expect(page).toHaveURL(/\/settings\/feedback$/)
  await page.goto("/settings/advanced")
  await expect(page).toHaveURL(/\/settings\/data-sync$/)
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/settings\/permissions$/)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto("/settings/alerts")
  await expect(page).toHaveURL(/\/home$/)
  await expect(
    page.getByRole("button", { name: "Run alerts now" })
  ).toHaveCount(0)
  const settings = page.getByRole("button", { name: "Settings" })
  await expect(settings).toBeDisabled()
  await settings.locator("..").hover()
  await expect(
    page.getByText(
      'In order to perform this action, the "Access Settings" permission is required.'
    )
  ).toBeVisible()
  if (shots)
    await page.screenshot({
      path: path.join(shots, "settings-viewer-gate.png"),
      animations: "disabled",
    })
})
