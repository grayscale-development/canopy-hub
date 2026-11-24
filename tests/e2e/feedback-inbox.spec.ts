import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"

import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("a viewer submits feedback from a wiki page and a manager resolves it", async ({
  page,
}) => {
  const admin = serviceWiki()
  const message = `Broken link ${randomUUID()}`
  const fixture = await createReviewedPage({
    slug: `feedback-${randomUUID()}`,
    title: "Feedback test page",
    paragraphs: ["Synthetic page."],
  })
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto(fixture.path)
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
    await page.getByRole("button", { name: "Submit Feedback" }).click()
    const form = page.getByRole("dialog", { name: "Send feedback" })
    await expect(
      form.getByRole("switch", { name: "Includes a link to this page" })
    ).toBeChecked()
    await expect(form.getByRole("combobox")).toHaveCount(0)
    await form.getByLabel("Message").fill(message)
    await form.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText("Thanks, we read every message.")).toBeVisible()
    await expect(form).toBeHidden()

    await signInAsSeededUser(page, "admin@canopy.test")
    await page.goto("/settings/feedback")
    const item = page.locator("article").filter({ hasText: message })
    await page.getByLabel("Type").selectOption("other")
    await expect(item.getByText("Other", { exact: true })).toBeVisible()
    await expect(
      item.getByRole("link", { name: /^Sent from \// })
    ).toHaveAttribute("href", fixture.path)
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await item.getByRole("button", { name: "Copy link" }).click()
    await expect(page.getByText("Link copied")).toBeVisible()
    const copiedLink = await page.evaluate(() => navigator.clipboard.readText())
    expect(copiedLink).toContain(`?item=`)
    await page.goto(new URL(copiedLink).pathname + new URL(copiedLink).search)
    const linkedDetail = page.getByRole("dialog", { name: "Other" })
    await expect(linkedDetail.getByText(message)).toBeVisible()
    await linkedDetail.getByRole("button", { name: "Close" }).click()
    await item.getByRole("button").click()
    const detail = page.getByRole("dialog", { name: "Other" })
    await expect(detail.getByText(message)).toBeVisible()
    await detail.getByRole("button", { name: "Mark resolved" }).click()
    await expect(item).toHaveCount(0)
    await page.getByRole("button", { name: "Resolved", exact: true }).click()
    await expect(item).toBeVisible()
    await item.getByRole("button").click()
    await detail.getByRole("button", { name: "Looks good" }).click()
    await page.getByRole("button", { name: "Done", exact: true }).click()
    await expect(item).toBeVisible()
    await item.getByRole("button").click()
    await detail.getByRole("button", { name: "Reopen" }).click()
    await expect(item).toHaveCount(0)
  } finally {
    await admin.from("feedback_items").delete().eq("message", message)
    await admin.from("wiki_nodes").delete().eq("id", fixture.id)
  }
})
