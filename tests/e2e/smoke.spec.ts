import { expect, test } from "@playwright/test"

import { mockMiloChatApi, openWikiPath, signInAsLocalDev } from "./helpers"

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
  await openWikiPath(page, "Nano Wiki")

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
  await openWikiPath(page, "Canopy Wiki")

  await expect(page.getByText("Canopy Wiki").first()).toBeVisible()
  await expect(page.getByText("Hub").first()).toBeVisible()
  await expect(page.getByText("Operations").first()).toBeVisible()
})

test("Wiki folder URLs show their landing contents @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)

  await openWikiPath(page, "Canopy Wiki")
  await expect(page).toHaveURL(/\/wiki\/\d+$/)
  const main = page.getByRole("main")
  const landingCards = main.locator("div.grid")
  await expect(
    landingCards.getByRole("link", { name: "Hub", exact: true })
  ).toHaveAttribute("href", /\/wiki\/\d+\/\d+$/)

  await openWikiPath(page, "Canopy Wiki", "Hub")
  await expect(page).toHaveURL(/\/wiki\/\d+\/\d+$/)
  await expect(
    landingCards.getByRole("link", { name: "Home Dashboard", exact: true })
  ).toHaveAttribute("href", /\/wiki\/\d+\/\d+\/\d+$/)
  await expect(
    landingCards.getByRole("link", { name: "File Viewer" })
  ).toBeVisible()
  await expect(main.getByText("Filter by tag", { exact: true })).toHaveCount(0)
})

test("Wiki sidebar chevrons toggle without navigation and manager edit opens folder-only Move @wiki", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await openWikiPath(page, "Canopy Wiki", "Hub", "Home Dashboard")

  const wikiSidebar = page.locator("[data-wiki-sidebar-scroll]")
  await expect(
    page.getByRole("button", { name: "Create Section" })
  ).toHaveCount(0)
  await expect(
    wikiSidebar.getByRole("button", { name: "Edit Operations" })
  ).toHaveCount(0)
  await expect(
    wikiSidebar.getByRole("button", { name: "Add to Operations" })
  ).toHaveCount(0)
  await page.getByRole("switch", { name: "Toggle wiki editor mode" }).check()
  await expect(
    page.getByRole("button", { name: "Create Section" })
  ).toBeVisible()
  await expect(
    wikiSidebar.getByRole("button", { name: "Add to Operations" })
  ).toBeAttached()
  const operationsToggle = wikiSidebar.getByRole("button", {
    name: "Toggle Operations",
  })
  const initialUrl = page.url()

  await expect(operationsToggle).toHaveAttribute("aria-expanded", "true")
  await operationsToggle.click()
  await expect(operationsToggle).toHaveAttribute("aria-expanded", "false")
  await expect(page).toHaveURL(initialUrl)

  await operationsToggle.click()
  await expect(operationsToggle).toHaveAttribute("aria-expanded", "true")
  const operationsRow = operationsToggle.locator("..")
  await operationsRow.hover()
  await wikiSidebar.getByRole("button", { name: "Edit Operations" }).click()

  const editDialog = page.getByRole("dialog", { name: "Edit section" })
  await expect(editDialog).toBeVisible()
  await editDialog.getByRole("button", { name: "Move" }).click()

  const moveDialog = page.getByRole("dialog", { name: "Move Operations" })
  await expect(moveDialog).toBeVisible()
  await expect(
    moveDialog.getByRole("button", { name: "Canopy Wiki" })
  ).toBeVisible()
  await expect(
    moveDialog.getByRole("button", { name: "Operations", exact: true })
  ).toHaveCount(0)
  await expect(
    moveDialog.getByRole("button", { name: "Home Dashboard" })
  ).toHaveCount(0)
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
  await expect(dialog.getByText("/wiki/1")).toBeVisible()
})
