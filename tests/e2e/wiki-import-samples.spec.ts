import path from "node:path"

import { expect, test } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

const samples = [
  "it-password-reset.docx",
  "lender-resources.docx",
  "post-closing-checklist.docx",
  "chenoa-deck.pdf",
  "rate-sheet.pdf",
  "it-password-reset-doc.pdf",
  "quick-tips.txt",
]

test("Wiki managers can use AI Create with every representative document sample @wiki", async ({
  page,
}) => {
  await signInAsLocalDev(page)

  for (const sample of samples) {
    await page.goto("/wiki/canopy-wiki/hub/reports")
    const editorSwitch = page.getByRole("switch", {
      name: "Toggle wiki editor mode",
    })
    // Editor mode persists between loads and restores after hydration, so
    // only toggle it when the AI Update button has not appeared on its own.
    const aiUpdateButton = page.getByRole("button", { name: "AI Update" })
    try {
      await aiUpdateButton.waitFor({ timeout: 4000 })
    } catch {
      await editorSwitch.click()
    }
    await page.getByRole("button", { name: "AI Update" }).click()
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        path.join(process.cwd(), "tests/fixtures/wiki-samples", sample)
      )
    await page.getByRole("button", { name: "Create draft" }).click()

    const copyButton = page.getByRole("button", { name: "Create a copy" })
    const duplicateShown = await copyButton
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (duplicateShown) await copyButton.click()

    await expect(
      page.getByText(/please try again|could not create/i)
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/wiki\/.+/, { timeout: 60_000 })
    const title = page.locator("h1").first()
    await expect(title).toBeVisible({ timeout: 30_000 })
    expect((await title.textContent())?.trim().length).toBeLessThanOrEqual(80)
  }
})
