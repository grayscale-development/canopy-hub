import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import { serviceWiki, signInAsSeededUser } from "./wiki-reviewed-helpers"
import { wikiTagDirectoryUrl } from "@/lib/wiki"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`@wiki-reviewed Milo links a returned tag on ${viewport.name}`, async ({
    page,
  }) => {
    const admin = serviceWiki()
    const name = `Milo Tag ${Date.now()} ${viewport.name}`
    const { data: tag, error } = await admin
      .from("wiki_tags")
      .insert({
        name,
        scope: "global",
        section_id: null,
      })
      .select("id,name,scope,section_id")
      .single()
    if (error || !tag) throw error ?? new Error("Tag creation failed")
    const url = wikiTagDirectoryUrl(tag)
    try {
      const assigned = await admin.from("wiki_page_tags").insert({
        tag_id: tag.id,
        node_id: "10000000-0000-4000-8000-000000000004",
      })
      if (assigned.error) throw assigned.error
      await page.setViewportSize(viewport)
      await signInAsSeededUser(page, "wiki-manager@canopy.test")
      await mockMiloChatApi(page)
      await page.route("**/api/wiki/chat", async (route) => {
        if (route.request().method() !== "POST") return route.fallback()
        const events = [
          { type: "meta", threadId: "e2e-thread" },
          { type: "token", token: `${name} is useful. ${name} has pages.` },
          {
            type: "done",
            threadId: "e2e-thread",
            citations: [
              {
                title: `Tag: ${name} (Global)`,
                url,
                snippet: "Accessible pages: Funding Checklist",
              },
            ],
          },
        ]
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
        })
      })
      await page.goto("/home")
      await page.evaluate(() => localStorage.clear())
      await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
      const panel = page.getByRole("dialog", { name: "Milo" })
      const composer = panel.getByRole("textbox", { name: "Ask a follow-up" })
      await composer.fill("Tell me about this tag")
      await composer.press("Enter")
      const link = panel.getByRole("link", { name, exact: true })
      await expect(link).toHaveCount(1)
      await expect(link).toHaveAttribute("href", url)
      await expect(panel.getByLabel("Sources")).toHaveCount(0)
      await link.click()
      await expect(page).toHaveURL(
        new RegExp(`/wiki/tags\\?tag=${encodeURIComponent(name)}`)
      )
      await expect(panel).toBeVisible()
      await panel.getByRole("button", { name: "Close" }).click()
      const row = page
        .locator("tr")
        .filter({ has: page.getByRole("button", { name, exact: true }) })
      await expect(
        row.getByRole("button", { name, exact: true })
      ).toHaveAttribute("aria-expanded", "true")
      await expect(
        page.getByRole("link", { name: "Funding Checklist" })
      ).toBeVisible()
      if (viewport.name === "desktop") {
        await page.goto("/wiki")
        const tagsLink = page.getByRole("link", { name: "Tags", exact: true })
        await expect(tagsLink).toHaveAttribute("href", "/wiki/tags")
        await tagsLink.click()
        await expect(page).toHaveURL(/\/wiki\/tags$/)
        await expect(
          page.getByRole("heading", { name: "Tags", exact: true })
        ).toBeVisible()
      }
    } finally {
      await admin.from("wiki_page_tags").delete().eq("tag_id", tag.id)
      await admin.from("wiki_tags").delete().eq("id", tag.id)
    }
  })
}

test("@wiki-reviewed users without beta access never see or request Milo", async ({
  page,
}) => {
  const admin = serviceWiki()
  const email = `milo-no-beta-${crypto.randomUUID()}@canopy.test`
  const created = await admin.auth.admin.createUser({
    email,
    password: "canopy-test-password",
    email_confirm: true,
  })
  if (created.error) throw created.error
  try {
    let miloRequests = 0
    page.on("request", (request) => {
      if (/\/api\/(?:milo\/preferences|wiki\/chat)/.test(request.url()))
        miloRequests++
    })
    await signInAsSeededUser(page, email)
    await page.goto("/home")
    await expect(
      page.getByRole("button", { name: "Ask Milo", exact: true })
    ).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Ask Milo" })).toHaveCount(0)
    await page.keyboard.press("Control+j")
    await expect(page.getByRole("dialog", { name: /Milo|Search/ })).toHaveCount(
      0
    )
    await expect(page.getByText("Forbidden")).toHaveCount(0)
    expect(miloRequests).toBe(0)
  } finally {
    await admin.auth.admin.deleteUser(created.data.user.id)
  }
})
