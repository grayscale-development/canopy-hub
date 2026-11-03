import { expect, test } from "@playwright/test"

import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

test("protected app routes redirect signed-out users to login @smoke", async ({
  page,
}) => {
  await page.goto("/home")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Login to your account")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Continue as Dev" })
  ).toBeVisible()
})

test("department dashboards redirect signed-out users to login @smoke", async ({
  page,
}) => {
  await page.goto("/reports/processing")
  await expect(page).toHaveURL(/\/login$/)
  await page.goto("/reports/underwriting")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Login to your account")).toBeVisible()
})

test("local dev user can sign in and see the app shell @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)

  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible()
  const sidebar = page.locator('[data-sidebar="sidebar"]').first()
  await expect(
    sidebar.getByRole("link", { name: "Reports", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Canopy Wiki", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Learning Hub", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Nano Wiki", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Department Directory", exact: true })
  ).toBeVisible()
})

test("Nano Wiki shows a coming soon state @wiki @smoke", async ({ page }) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/nano-wiki")

  await expect(
    page.getByRole("main").getByText("Coming soon", { exact: true })
  ).toBeVisible()
  const sidebar = page.locator('[data-sidebar="sidebar"]').first()
  await expect(
    sidebar.getByRole("link", { name: "Nano Wiki", exact: true })
  ).toBeVisible()
})

test("Wiki repository page renders seeded content @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-wiki")

  await expect(page.getByText("Canopy Wiki").first()).toBeVisible()
  await expect(page.getByText("Hub").first()).toBeVisible()
  await expect(page.getByText("Operations").first()).toBeVisible()
})

test("Wiki repository landing reopens the last valid page @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)

  await page.goto("/wiki/canopy-wiki/hub/reports")
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true })
  ).toBeVisible()

  await page.goto("/wiki/canopy-wiki")
  await expect(page).toHaveURL(/\/wiki\/canopy-wiki\/hub\/reports$/)

  await page.evaluate(() => {
    window.localStorage.removeItem("wiki:last-page:canopy-wiki")
  })
  await page.goto("/wiki/canopy-wiki")
  await expect(page).toHaveURL(/\/wiki\/canopy-wiki\/hub\/home-dashboard$/)

  await page.evaluate(() => {
    window.localStorage.setItem(
      "wiki:last-page:canopy-wiki",
      JSON.stringify("canopy-wiki/not-present")
    )
  })
  await page.goto("/wiki/canopy-wiki")
  await expect(page).toHaveURL(/\/wiki\/canopy-wiki\/hub\/home-dashboard$/)
})

test("Ask Milo opens and streams a deterministic mocked answer @milo @smoke", async ({
  page,
}) => {
  await mockMiloChatApi(page)
  await signInAsLocalDev(page)

  const searchInput = page
    .locator("header")
    .getByRole("textbox", { name: "Ask Milo" })
  const dialog = page.getByRole("dialog", { name: "Ask Milo" })
  // The header search only responds to Enter once the page has hydrated, so
  // retry until the modal opens.
  await expect(async () => {
    await searchInput.fill("Where is the Wiki?")
    await searchInput.press("Enter")
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
  await expect(dialog.getByText("/wiki/canopy-wiki")).toBeVisible()
})
