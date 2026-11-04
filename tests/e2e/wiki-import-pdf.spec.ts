import path from "node:path"

import { expect, test } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

test("Wiki managers can use AI Create with a text PDF @wiki", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  await page.getByRole("switch", { name: "Toggle wiki editor mode" }).click()
  await page.getByRole("button", { name: "AI Update" }).click()
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      path.join(process.cwd(), "tests/fixtures/wiki-import-cid-text.pdf")
    )
  await page.getByRole("button", { name: "Create draft" }).click()
  const copyButton = page.getByRole("button", { name: "Create a copy" })
  const duplicateShown = await copyButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (duplicateShown) await copyButton.click()
  await expect(page.getByText(/could not find readable text/i)).toHaveCount(0)
  await expect(page).toHaveURL(/\/wiki\/.+/, { timeout: 60_000 })
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("h1").first()).toContainText("Training Wiki")
  await expect(page.getByRole("table")).toHaveCount(2)
  await expect(page.getByText("-- 1 of 2 --")).toHaveCount(0)
})
