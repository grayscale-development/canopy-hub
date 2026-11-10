import { mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test("opens a current Wiki citation from an old indexed URL @smoke", async ({
  page,
}) => {
  await signInAsSeededUser(page, "wiki-manager@canopy.test")
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort()
  })
  await page.goto("/home")
  const reindex = await page.request.post("/api/wiki/reindex")
  expect(reindex.ok()).toBe(true)
  const search = await page.evaluate(async () => {
    const response = await fetch("/api/wiki/search?q=funding%20checklist")
    return response.json()
  })
  const result = search.results.find(
    (item: { title: string }) => item.title === "Funding Checklist"
  )
  expect(result?.url).toMatch(/^\/wiki\/(\d+\/)*\d+$/)

  // Fake only the AI response: the citation URL came from the real search API.
  await page.route("**/api/wiki/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        { type: "meta", threadId: "local-fixture" },
        { type: "token", token: "See the funding checklist." },
        {
          type: "done",
          threadId: "local-fixture",
          citations: [
            { title: result.title, url: result.url, snippet: result.snippet },
          ],
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(""),
    })
  )
  const headerSearch = page
    .locator("header")
    .getByRole("textbox", { name: "Ask Milo" })
  await headerSearch.fill("funding checklist")
  await headerSearch.press("Enter")
  const citation = page.getByRole("link", { name: /Funding Checklist/ })
  await expect(citation).toHaveAttribute("href", result.url)
  const shots = process.env.CANOPY_KNOWLEDGE_SHOTS
  if (shots) {
    mkdirSync(shots, { recursive: true })
    await page.screenshot({ path: path.join(shots, "citation.png") })
  }
  await citation.click()
  await expect(page).toHaveURL(new RegExp(`${result.url}$`))
  await expect(page.getByRole("main").last()).toContainText("Funding Checklist")
})
