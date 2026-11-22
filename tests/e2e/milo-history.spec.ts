import { expect, test } from "@playwright/test"
import {
  ensureScreenshotDir,
  screenshotDir,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

for (const [label, width, height, colorScheme] of [
  ["desktop-light", 1280, 800, "light"],
  ["desktop-dark", 1280, 800, "dark"],
  ["phone-light", 390, 844, "light"],
  ["phone-dark", 390, 844, "dark"],
] as const) {
  test(`Milo history fits and can open and delete chats: ${label}`, async ({
    page,
    baseURL,
  }) => {
    const target = new URL(baseURL ?? "http://127.0.0.1:3000")
    if (
      target.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(target.hostname)
    )
      throw new Error("Local app required")
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme })
    await signInAsSeededUser(page, "standard@canopy.test")
    await page.goto("/home")
    await page.evaluate(() => localStorage.removeItem("milo-active-thread"))
    await page.route("**/api/wiki/chat**", async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() === "DELETE")
        return route.fulfill({ json: { ok: true } })
      if (url.searchParams.has("threadId"))
        return route.fulfill({
          json: {
            messages: [
              { id: "question", role: "user", content: "A saved question" },
            ],
          },
        })
      return route.fulfill({
        json: {
          threads: [
            {
              id: "first",
              title: "How do I find the latest closing checklist?",
              updatedAt: new Date().toISOString(),
            },
            {
              id: "second",
              title:
                "A long conversation title that needs to fit neatly within the panel without overflowing",
              updatedAt: new Date(Date.now() - 172800000).toISOString(),
            },
          ],
        },
      })
    })
    await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
    const panel = page.getByRole("dialog", { name: "Milo" })
    await panel.getByRole("button", { name: "History" }).click()
    await expect(
      panel.getByRole("heading", { name: "Recent chats" })
    ).toBeVisible()
    await expect(
      panel.getByRole("button", { name: /^How do I find/ })
    ).toBeVisible()
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true
    )
    ensureScreenshotDir()
    await page.screenshot({
      path: `${screenshotDir}/milo-history-${label}.png`,
      animations: "disabled",
    })
    await panel.getByRole("button", { name: /^How do I find/ }).click()
    await expect(panel.getByText("A saved question")).toBeVisible()
    await panel.getByRole("button", { name: "History" }).click()
    await panel
      .getByRole("button", {
        name: "Delete chat How do I find the latest closing checklist?",
      })
      .click()
    await panel.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(panel.getByText("Chat deleted.")).toBeVisible()
    await expect(
      panel.getByRole("button", { name: /^How do I find/ })
    ).toHaveCount(0)
    await panel.getByRole("button", { name: "Back" }).click()
    await expect(panel.getByText(/How can I help/)).toBeVisible()
  })
}
