import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { mockMiloChatApi, openWikiPath } from "./helpers"
import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test("wiki has a clean console and remembers the sidebar", async ({ page }) => {
  test.setTimeout(120_000)
  const messages: string[] = []
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      messages.push(`${page.url()} ${message.type()}: ${message.text()}`)
    }
  })
  page.on("pageerror", (error) =>
    messages.push(`${page.url()} pageerror: ${error.message}`)
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: "light" })
  await mockMiloChatApi(page)
  await signInAsSeededUser(page, "wiki-manager@canopy.test")
  await page.goto("/wiki")
  const sidebar = page.locator('[data-slot="sidebar"][data-state]')
  const toggle = page.locator('[data-slot="sidebar-trigger"]')
  await expect(
    page.getByRole("link", { name: "Canopy Wiki", exact: true }).last()
  ).toBeVisible()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await toggle.click()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  const collapsedResponse = await page.reload()
  expect(await collapsedResponse!.text()).toMatch(
    /data-state="collapsed" data-collapsible="icon"[^>]*data-slot="sidebar"/
  )
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await expect(sidebar.locator('[data-slot="sidebar-gap"]')).toHaveCSS(
    "width",
    "64px"
  )

  const shotDir = process.env.CANOPY_91_SHOTS
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true })
    await page.screenshot({
      path: path.join(shotDir, "01-sidebar-collapsed.png"),
      caret: "initial",
    })
  }

  await toggle.click()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await page.reload()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await expect(sidebar.locator('[data-slot="sidebar-gap"]')).toHaveCSS(
    "width",
    "280px"
  )
  if (shotDir) {
    await page.screenshot({
      path: path.join(shotDir, "02-sidebar-expanded.png"),
      caret: "initial",
    })
  }

  await openWikiPath(
    page,
    "Canopy Wiki",
    "Operations",
    "Closing",
    "Funding Checklist"
  )
  await expect(page.locator(".bn-container").first()).toBeVisible()
  await toggle.click()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/wiki")
  await openWikiPath(
    page,
    "Canopy Wiki",
    "Operations",
    "Closing",
    "Funding Checklist"
  )
  await expect(page.locator(".bn-container").first()).toBeVisible()
  expect(messages).toEqual([])
})
