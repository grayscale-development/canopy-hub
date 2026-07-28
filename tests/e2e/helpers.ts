import { expect, type Page } from "@playwright/test"

export async function signInAsLocalDev(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: "Continue as Dev" }).click()
  await expect(page).toHaveURL(/\/home$/)
}

export async function mockMiloChatApi(page: Page) {
  await page.route("**/api/wiki/chat**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ threads: [] }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
      body: [
        'data: {"type":"meta","threadId":"e2e-thread"}',
        'data: {"type":"token","token":"Open "}',
        'data: {"type":"token","token":"/wiki/canopy-mortgage"}',
        'data: {"type":"done","threadId":"e2e-thread","userMessageId":"user-message","assistantMessageId":"assistant-message","citations":[{"title":"Wiki","url":"/wiki/canopy-mortgage","snippet":"Seeded Wiki source."}]}',
        "",
      ].join("\n\n"),
    })
  })

  await page.route("**/api/wiki/chat/flag", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    })
  })
}
