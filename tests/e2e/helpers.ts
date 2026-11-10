import { expect, type Page } from "@playwright/test"

export async function signInAsLocalDev(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: "Continue as Dev" }).click()
  await expect(page).toHaveURL(/\/home$/)
}

export async function openWikiPath(page: Page, ...titles: string[]) {
  await page.goto("/wiki")
  for (const title of titles) {
    const link = page
      .getByRole("main")
      .last()
      .getByRole("link", { name: title, exact: true })
    const href = await link.getAttribute("href")
    expect(href).toMatch(/^\/wiki\/\d+(?:\/\d+)*$/)
    const target = new URL(href!, page.url()).toString()
    await expect(async () => {
      if (page.url() !== target) await link.click()
      await expect(page).toHaveURL(target, { timeout: 3000 })
    }).toPass({ timeout: 20_000 })
  }
}

export async function openWikiAiCreate(page: Page) {
  const editMode = page.getByRole("switch", { name: "Toggle wiki editor mode" })
  if (!(await editMode.isChecked())) await editMode.check()
  const trigger = page.getByRole("button", { name: "Add to Hub" })
  const item = page.getByRole("menuitem", { name: "AI Create" })
  await expect(trigger).toBeVisible()
  await expect(async () => {
    if (!(await item.isVisible())) await trigger.click()
    await expect(item).toBeVisible()
  }).toPass()
  await item.click()
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
        'data: {"type":"token","token":"/wiki/1"}',
        'data: {"type":"done","threadId":"e2e-thread","userMessageId":"user-message","assistantMessageId":"assistant-message","citations":[{"title":"Wiki","url":"/wiki/1","snippet":"Seeded Wiki source."}]}',
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
