import { expect, test } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

test("Wiki managers can start a pasted-text import @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  await page.getByRole("switch", { name: "Toggle wiki editor mode" }).click()
  await page.getByRole("button", { name: "Import" }).first().click()
  await page
    .getByLabel("Or paste text")
    .fill("Review lock 123 before submitting.")
  await expect(page.getByRole("button", { name: "Create draft" })).toBeEnabled()
})
