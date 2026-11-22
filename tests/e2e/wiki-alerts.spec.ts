import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("manager alerts and viewer access", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = randomUUID()
  const first = await createReviewedPage({
    slug: `alert-first-${stamp}`,
    title: "Closing checklist",
    paragraphs: ["First alert page"],
  })
  const second = await createReviewedPage({
    slug: `alert-second-${stamp}`,
    title: "Closing procedures",
    paragraphs: ["Second alert page"],
  })
  const supabase = serviceWiki()
  const shots = process.env.CANOPY_ALERT_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const shot = async (name: string) => {
    if (shots)
      await page.screenshot({
        path: path.join(shots, name),
        animations: "disabled",
      })
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: "light" })
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    const emptyRoute = async (route: import("@playwright/test").Route) =>
      route.fulfill({ json: [] })
    await page.route("**/rest/v1/wiki_alerts?**", emptyRoute)
    await page.goto("/wiki")
    const alertsButton = page.getByRole("button", { name: /^Alerts/ })
    await expect(alertsButton).toContainText("0")
    await alertsButton.click()
    await expect(page.getByText("No open alerts.")).toBeVisible()
    await shot("01-manager-alerts-empty-desktop.png")
    await page.getByRole("button", { name: "Close", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.unroute("**/rest/v1/wiki_alerts?**", emptyRoute)
    const { data: alert, error } = await supabase
      .from("wiki_alerts")
      .insert({
        page_id: first.id,
        other_page_id: second.id,
        recommendation: { summary: "These pages describe the same process." },
      })
      .select("id")
      .single()
    if (error || !alert) throw error ?? new Error("Failed to create alert")
    await alertsButton.click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByText("These pages describe the same process.")
    ).toBeVisible()
    await expect(
      dialog.getByRole("link", { name: "Closing checklist" })
    ).toHaveAttribute("href", first.path)
    await expect(
      dialog.getByRole("link", { name: "Closing procedures" })
    ).toHaveAttribute("href", second.path)
    await expect(
      dialog.getByRole("button", { name: "Apply recommendation" })
    ).toBeDisabled()
    await expect(
      dialog.getByText("This recommendation cannot be applied yet.")
    ).toBeVisible()
    await shot("02-manager-alerts-open-desktop.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(async () => {
        const bounds = await dialog.boundingBox()
        return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390
      })
      .toBe(true)
    await shot("03-manager-alerts-open-mobile.png")
    await page.setViewportSize({ width: 1440, height: 900 })
    await dialog.getByRole("link", { name: "Open and edit" }).click()
    await expect(page).toHaveURL(new RegExp(`${first.path}$`))
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(
      page.getByRole("switch", { name: "Toggle wiki editor mode" })
    ).toBeChecked()
    await expect(page.getByText("First alert page")).toBeVisible()
    await shot("04-manager-editor-desktop.png")
    await page.goto("/wiki")
    await alertsButton.click()
    await expect(
      dialog.getByText("These pages describe the same process.")
    ).toBeVisible()
    await dialog.getByRole("button", { name: "Dismiss" }).click()
    await expect(
      dialog.getByText("These pages describe the same process.")
    ).toHaveCount(0)
    const stored = await supabase
      .from("wiki_alerts")
      .select("status,dismissed_by,dismissed_at")
      .eq("id", alert.id)
      .single()
    expect(stored.data).toMatchObject({
      status: "dismissed",
      dismissed_by: expect.any(String),
      dismissed_at: expect.any(String),
    })
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(first.path)
    await expect(page.getByText("First alert page")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveCount(0)
    await shot("06-viewer-no-alerts-desktop.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveCount(0)
  } finally {
    const { error } = await supabase
      .from("wiki_nodes")
      .delete()
      .in("id", [first.id, second.id])
    if (error) throw error
  }
})
