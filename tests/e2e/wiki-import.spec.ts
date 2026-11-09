import { expect, test } from "@playwright/test"

import { openWikiAiCreate, signInAsLocalDev } from "./helpers"

test("Wiki managers can start an AI Create from pasted text @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki/hub/reports")
  await openWikiAiCreate(page)
  await page.getByLabel("Paste text").fill("Review lock 123 before submitting.")
  await expect(page.getByRole("button", { name: "Create draft" })).toBeEnabled()
})
