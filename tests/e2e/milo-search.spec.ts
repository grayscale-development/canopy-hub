import path from "node:path"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi, signInAsLocalDev } from "./helpers"
import { serviceWiki, signInAsSeededUser } from "./wiki-reviewed-helpers"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  for (const beta of [true, false]) {
    test(`@wiki-reviewed Milo search ${beta ? "beta" : "search-only"} on ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      let userId: string | undefined
      const db = beta ? undefined : serviceWiki()
      let chatRequests = 0
      try {
        if (beta) {
          await mockMiloChatApi(page)
          await signInAsLocalDev(page)
        } else {
          const email = `milo-search-${crypto.randomUUID()}@canopy.test`
          const created = await db!.auth.admin.createUser({
            email,
            password: "canopy-test-password",
            email_confirm: true,
          })
          if (created.error) throw created.error
          userId = created.data.user.id
          await signInAsSeededUser(page, email)
          await page.route("**/api/wiki/chat**", async (route) => {
            chatRequests++
            await route.abort()
          })
          await page.goto("/home")
        }
        await page.route("**/api/wiki/search?**", async (route) =>
          route.fulfill({
            json: {
              results: beta
                ? [
                    {
                      id: "wiki",
                      title: "Wiki",
                      type: "wiki_page",
                      url: "/wiki/1",
                      snippet: "Wiki page",
                    },
                    {
                      id: "people",
                      title: "People",
                      type: "employee",
                      url: "/people",
                      snippet: "Directory",
                    },
                  ]
                : [
                    {
                      id: "people",
                      title: "People",
                      type: "employee",
                      url: "/people",
                      snippet: "Directory",
                    },
                  ],
            },
          })
        )
        await page
          .getByRole("button", { name: "Ask Milo", exact: true })
          .click()
        const panel = page.getByRole("dialog", {
          name: beta ? "Milo" : "Search",
        })
        const input = panel.getByRole("textbox", {
          name: beta
            ? "Ask a follow-up"
            : "Search people, branches and documents",
        })
        await input.fill(beta ? "wiki" : "people")
        const list = panel.getByRole("listbox", { name: "Search results" })
        await expect(list).toBeVisible()
        await expect(
          panel
            .getByRole("status")
            .filter({ hasText: /search results available/ })
        ).toHaveCount(1)
        if (process.env.CANOPY_SHOTS_DIR)
          await page.screenshot({
            path: path.join(
              process.env.CANOPY_SHOTS_DIR,
              `milo-search-${beta ? "beta" : "search-only"}-${viewport.name}.png`
            ),
            animations: "disabled",
          })
        await input.press("ArrowDown")
        await expect(input).toHaveAttribute("aria-activedescendant", /.+/)
        await input.press("Enter")
        await expect(page).toHaveURL(beta ? /\/wiki\/1$/ : /\/people$/)
        await expect(panel).toBeVisible()
        if (!beta) {
          await expect(panel).not.toContainText("Forbidden")
          await expect(
            panel.getByRole("button", { name: "Attach a file" })
          ).toHaveCount(0)
          expect(chatRequests).toBe(0)
        }
      } finally {
        if (userId) await db!.auth.admin.deleteUser(userId)
      }
    })
  }
}
