import { mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test("rates a Milo answer on desktop and narrow screens", async ({ page }) => {
  test.setTimeout(120_000)
  const shots = process.env.CANOPY_MILO_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  for (const [label, width, height, email] of [
    ["desktop", 1440, 900, "wiki-manager@canopy.test"],
    ["narrow", 390, 844, "standard@canopy.test"],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme: "light" })
    await signInAsSeededUser(page, email)
    await page.goto("/wiki/999999999")
    await page.evaluate(() => sessionStorage.clear())
    await mockMiloChatApi(page)
    await page.route("**/api/wiki/chat/rating", async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } })
    })
    await page
      .getByRole("textbox", { name: "Search with Milo" })
      .fill("Where is the wiki?")
    await page
      .getByRole("main")
      .last()
      .getByRole("button", { name: "Search" })
      .click()
    const dialog = page.getByRole("dialog", { name: "Ask Milo" })
    const up = dialog.getByRole("button", {
      name: "Helpful answer",
      exact: true,
    })
    const down = dialog.getByRole("button", {
      name: "Unhelpful answer",
      exact: true,
    })
    await expect(up).toBeVisible()
    await up.click()
    await expect(up).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByText("Thanks for your feedback")).toBeVisible()
    await down.click()
    await expect(down).toHaveAttribute("aria-pressed", "true")
    if (shots)
      await page.screenshot({
        animations: "disabled",
        path: path.join(
          shots,
          label === "desktop" ? "01-rating-desktop.png" : "02-rating-narrow.png"
        ),
      })
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    await page.evaluate(() => sessionStorage.clear())
    await page.unrouteAll({ behavior: "wait" })
  }
})
