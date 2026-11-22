import { expect, test } from "@playwright/test"

import { openWikiAiCreate, openWikiPath, signInAsLocalDev } from "./helpers"

test("Wiki managers can start an AI Create from pasted text @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await openWikiPath(page, "Canopy Wiki", "Hub", "Reports")
  await openWikiAiCreate(page)
  await page.getByLabel("Paste text").fill("Review lock 123 before submitting.")
  await expect(page.getByRole("button", { name: "Create draft" })).toBeEnabled()
})
