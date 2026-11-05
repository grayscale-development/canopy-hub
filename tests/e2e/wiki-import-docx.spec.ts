import path from "node:path"

import { expect, test } from "@playwright/test"

import { openWikiAiCreate, signInAsLocalDev } from "./helpers"

test("Wiki managers can use AI Create with a structured DOCX and embedded images @wiki", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  await openWikiAiCreate(page)
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      path.join(process.cwd(), "tests/fixtures/wiki-import-escrow.docx")
    )
  await page.getByRole("button", { name: "Create draft" }).click()
  const copyButton = page.getByRole("button", { name: "Create a copy" })
  const duplicateShown = await copyButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (duplicateShown) {
    await copyButton.click()
  }

  await expect(page).toHaveURL(/\/wiki\/.+/, { timeout: 60_000 })
  await expect(
    page.getByRole("heading", { name: "GENERAL GUIDELINES" })
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText(/The maximum term for an escrow withhold/i).first()
  ).toBeVisible()
  await expect(
    page.getByText(/Repair Estimate from Builder or Contractor/i).first()
  ).toBeVisible()
  await expect(page.locator("img.bn-visual-media")).toHaveCount(4)
})
