import path from "node:path"

import { expect, test } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

test("Wiki managers can import a text PDF into a draft @wiki", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  await page.getByRole("switch", { name: "Toggle wiki editor mode" }).click()
  await page.getByRole("button", { name: "Import" }).first().click()
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "tests/fixtures/wiki-import-cid-text.pdf"))
  await page.getByRole("button", { name: "Create draft" }).click()
  await expect(page.getByText(/could not find readable text/i)).toHaveCount(0)
  await expect(page).toHaveURL(/\/wiki\/.+/, { timeout: 60_000 })
  await expect(page.getByText(/Training Wiki/i).first()).toBeVisible({ timeout: 30_000 })
})
