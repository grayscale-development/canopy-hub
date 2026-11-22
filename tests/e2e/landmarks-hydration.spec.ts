import { expect, test } from "@playwright/test"

import { mockMiloChatApi } from "./helpers"
import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test.describe("phone settings hydration", () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })

  test("hydrates every settings section without an HTML mismatch", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "admin@canopy.test")
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    for (const section of [
      "permissions",
      "requests",
      "milo",
      "alerts",
      "feedback",
      "data-sync",
    ]) {
      await page.goto(`/settings/${section}`)
      await expect(
        page.getByRole("combobox", { name: "Settings section" })
      ).toHaveValue(section)
      await expect(page.locator("main")).toHaveCount(1)
      await page.getByRole("button", { name: "Toggle Sidebar" }).click()
      await expect(page.getByRole("dialog")).toBeVisible()
    }
    expect(
      errors.filter((error) => /hydration|react error #418/i.test(error))
    ).toEqual([])
  })
})

test("representative routes have one main landmark", async ({ page }) => {
  test.setTimeout(120_000)
  await mockMiloChatApi(page)
  await page.goto("/login")
  await expect(page.locator("main")).toHaveCount(1)
  await signInAsSeededUser(page, "admin@canopy.test")
  for (const route of [
    "/",
    "/home",
    "/wiki",
    "/wiki/1/999999999",
    "/reports",
    "/newsletters",
    "/settings/permissions",
    "/people",
    "/file-viewer",
    "/branches",
    "/department-directory",
    "/pipeline",
    "/nonexistent-canopy-route",
  ]) {
    await page.goto(route)
    await expect(page.locator("main")).toHaveCount(1)
  }
})
