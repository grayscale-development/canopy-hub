import { expect, test } from "@playwright/test"

import { mockMiloChatApi, signInAsLocalDev } from "./helpers"

test("protected app routes redirect signed-out users to login @smoke", async ({
  page,
}) => {
  await page.goto("/home")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Login to your account")).toBeVisible()
  await expect(page.getByRole("button", { name: "Continue as Dev" })).toBeVisible()
})

test("local dev user can sign in and see the app shell @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)

  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible()
  const sidebar = page.locator('[data-sidebar="sidebar"]').first()
  await expect(
    sidebar.getByRole("link", { name: "Reports", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Wiki", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByRole("link", { name: "Department Directory", exact: true })
  ).toBeVisible()
})

test("Wiki repository page renders seeded content @wiki @smoke", async ({
  page,
}) => {
  await signInAsLocalDev(page)
  await page.goto("/wiki/canopy-mortgage")

  await expect(page.getByText("Canopy Mortgage").first()).toBeVisible()
  await expect(page.getByText("Operations").first()).toBeVisible()
})

test("Ask Milo opens and streams a deterministic mocked answer @milo @smoke", async ({
  page,
}) => {
  await mockMiloChatApi(page)
  await signInAsLocalDev(page)

  await page.getByRole("button", { name: "Ask Milo" }).click()
  await page.getByPlaceholder("Ask Milo anything").fill("Where is the Wiki?")
  await page.keyboard.press("Enter")

  await expect(page.getByText("/wiki/canopy-mortgage")).toBeVisible()
  await expect(page.getByText("Wiki").last()).toBeVisible()
})
