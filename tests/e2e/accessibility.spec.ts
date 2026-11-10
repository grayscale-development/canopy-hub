import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { mockMiloChatApi, openWikiPath, signInAsLocalDev } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockMiloChatApi(page)
})

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

for (const colorScheme of ["light", "dark"] as const) {
  test(`default button has sufficient contrast in ${colorScheme} mode @a11y`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await signInAsLocalDev(page)
    if (colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/)
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/)
    }
    await page.goto("/wiki/1/999999999")
    const button = page.getByRole("button", { name: "Search", exact: true })
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute("data-variant", "default")
    const results = await new AxeBuilder({ page })
      .include('[data-slot="button"][type="submit"]')
      .withRules(["color-contrast"])
      .analyze()
    expect(results.violations).toEqual([])
    expect(
      results.passes.some((result) => result.id === "color-contrast")
    ).toBe(true)
  })
}
