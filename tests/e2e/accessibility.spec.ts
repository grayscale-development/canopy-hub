import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { openWikiPath, signInAsLocalDev } from "./helpers"

async function expectNoSeriousAccessibilityViolations(
  pageUrl: string,
  page: Page
) {
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

test("numeric wiki routes have no serious accessibility violations @a11y @smoke", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signInAsLocalDev(page)
  await page.goto("/wiki")
  await expectNoSeriousAccessibilityViolations("/wiki", page)
  await openWikiPath(page, "Canopy Wiki", "Operations", "Closing")
  await expectNoSeriousAccessibilityViolations("numeric folder", page)
  await openWikiPath(
    page,
    "Canopy Wiki",
    "Operations",
    "Closing",
    "Funding Checklist"
  )
  await expectNoSeriousAccessibilityViolations("numeric page", page)
  await page.goto("/wiki/1/999999999")
  await expectNoSeriousAccessibilityViolations("unknown numeric page", page)
})
