import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  enableEditorMode,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("manager applies and dismisses alerts; viewer has no alerts", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const stamp = randomUUID()
  const first = await createReviewedPage({
    slug: `alert-apply-${stamp}`,
    title: "Closing checklist",
    paragraphs: [],
    extraBlocks: [
      {
        id: "duplicate-block",
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "The closing checklist includes the same details as the procedures.",
            styles: {},
          },
        ],
        children: [],
      },
    ],
  })
  const second = await createReviewedPage({
    slug: `alert-canonical-${stamp}`,
    title: "Closing procedures",
    paragraphs: ["Canonical closing procedures."],
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
    const inserted = await supabase
      .from("wiki_alerts")
      .insert({
        page_id: first.id,
        other_page_id: second.id,
        recommendation: {
          version: 1,
          summary:
            "Replace the duplicated checklist with a link to Closing procedures.",
          targetPageId: first.id,
          baseRevisionId: first.revisionId,
          canonicalPageId: second.id,
          canonicalTitle: "Closing procedures",
          canonicalPath: second.path,
          blockId: "duplicate-block",
          changeNote: "Consolidated duplicate with Closing procedures",
        },
      })
      .select("id")
      .single()
    if (inserted.error || !inserted.data)
      throw inserted.error ?? new Error("Unable to insert alert")
    const fixtureAlertIds = [inserted.data.id]
    await page.route("**/rest/v1/wiki_alerts?**", async (route) => {
      if (route.request().method() !== "GET") return route.continue()
      const url = new URL(route.request().url())
      url.searchParams.set("id", `in.(${fixtureAlertIds.join(",")})`)
      await route.continue({ url: url.toString() })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: "light" })
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto("/wiki")
    const alerts = page.getByRole("button", { name: /^Alerts/ })
    await expect(alerts).toContainText("1")
    await alerts.click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByText(
        "Replace the duplicated checklist with a link to Closing procedures."
      )
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Apply recommendation" })
    ).toBeEnabled()
    await shot("01-manager-alerts-apply-ready-desktop.png")
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(
      dialog.getByRole("button", { name: "Apply recommendation" })
    ).toBeVisible()
    await shot("02-manager-alerts-apply-ready-mobile.png")
    await page.setViewportSize({ width: 1440, height: 900 })
    await dialog.getByRole("button", { name: "Apply recommendation" }).click()
    await expect(
      dialog.getByText(
        "Replace the duplicated checklist with a link to Closing procedures."
      )
    ).toHaveCount(0)
    await expect(
      page.getByText(/Recommendation applied\. To undo/)
    ).toBeVisible()
    await shot("03-manager-apply-success-desktop.png")
    const applied = await supabase
      .from("wiki_alerts")
      .select("status")
      .eq("id", inserted.data.id)
      .single()
    expect(applied.data?.status).toBe("applied")
    await page.goto(first.path)
    const link = page.getByRole("link", { name: "See Closing procedures" })
    await expect(link).toHaveAttribute("href", second.path)
    await shot("04-manager-page-after-apply-desktop.png")
    const canonical = await supabase
      .from("wiki_nodes")
      .select("status")
      .eq("id", second.id)
      .single()
    expect(canonical.data?.status).toBe("published")
    const next = await supabase
      .from("wiki_alerts")
      .insert({ page_id: first.id, other_page_id: second.id })
      .select("id")
      .single()
    if (next.error || !next.data)
      throw next.error ?? new Error("Unable to insert dismissal fixture")
    fixtureAlertIds.push(next.data.id)
    await page.goto("/wiki")
    await alerts.click()
    await dialog.getByRole("button", { name: "Dismiss" }).click()
    await expect(dialog.getByText("No open alerts.")).toBeVisible()
    const dismissed = await supabase
      .from("wiki_alerts")
      .select("status")
      .eq("id", next.data.id)
      .single()
    expect(dismissed.data?.status).toBe("dismissed")
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(first.path)
    await expect(
      page.getByRole("link", { name: "See Closing procedures" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveCount(0)
    await shot("05-viewer-no-alerts-desktop.png")
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto(first.path)
    await enableEditorMode(page)
    const lastUpdated = page.getByRole("button", { name: /Last updated/ })
    await lastUpdated.scrollIntoViewIfNeeded()
    await lastUpdated.click()
    await page.getByRole("menuitem", { name: /Fixture/ }).click()
    const restore = page.getByRole("dialog", { name: /Version from/ })
    await restore.getByRole("button", { name: "Restore this version" }).click()
    await expect(restore).toBeHidden()
    await expect(
      page.getByText(
        "The closing checklist includes the same details as the procedures."
      )
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByText(
        "The closing checklist includes the same details as the procedures."
      )
    ).toBeVisible()
  } finally {
    const { error } = await supabase
      .from("wiki_nodes")
      .delete()
      .in("id", [first.id, second.id])
    if (error) throw error
  }
})
