import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"

async function expectNoSeriousAccessibilityViolations(pageUrl: string, page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  )

  expect(serious, `${pageUrl} serious/critical axe violations`).toEqual([])
}

test("login page has no serious accessibility violations @a11y", async ({
  page,
}) => {
  await page.goto("/login")
  await expectNoSeriousAccessibilityViolations("/login", page)
})

test("home shell has no serious accessibility violations @a11y", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await expectNoSeriousAccessibilityViolations("/home", page)
})
