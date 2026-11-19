import { expect, test } from "@playwright/test"
import { signInAsSeededUser } from "./wiki-reviewed-helpers"

test("send and streaming follow the bottom until the reader scrolls up", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (
        typeof input !== "string" ||
        input !== "/api/wiki/chat" ||
        init?.method !== "POST"
      )
        return original(input, init)
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              const send = (data: object) =>
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
                )
              send({
                type: "meta",
                threadId: "fake-stream",
                userMessageId: "user",
              })
              window.addEventListener("test-milo-token", (event) =>
                send({
                  type: "token",
                  token: (event as CustomEvent<string>).detail,
                })
              )
            },
          }),
          { headers: { "content-type": "text/event-stream" } }
        )
      )
    }
  })
  await page.route("**/api/wiki/chat**", (route) =>
    route.fulfill({ json: { threads: [], messages: [] } })
  )
  await page.route("**/api/milo/preferences", (route) =>
    route.fulfill({ json: { position: null } })
  )
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto("/home")
  await page.evaluate(() => localStorage.removeItem("milo-active-thread"))
  await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Milo" })
  const scroll = panel.getByRole("region", { name: "Chat messages" })
  await panel
    .getByRole("textbox", { name: "Ask a follow-up" })
    .fill("Tell me more")
  await panel.getByRole("button", { name: "Send follow-up" }).click()
  await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible()
  const token = (text: string) =>
    page.evaluate(
      (value) =>
        window.dispatchEvent(
          new CustomEvent("test-milo-token", { detail: value })
        ),
      text
    )
  await token(
    ("A long answer with useful information. ".repeat(30) + "\n\n").repeat(5) +
      "First chunk"
  )
  await expect(panel.getByText(/First chunk/)).toBeVisible()
  const distance = () =>
    scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
  await expect.poll(distance).toBeLessThan(2)
  expect(
    await scroll.evaluate(
      (el) => (el as HTMLElement).offsetWidth - el.clientWidth
    )
  ).toBe(0)
  const thumb = panel.locator(".milo-scrollbar-thumb")
  await expect(thumb).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await scroll.hover()
  await expect(thumb).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await page.mouse.wheel(0, -500)
  await expect(
    panel.getByRole("button", { name: "Jump to latest" })
  ).toBeVisible()
  const before = await scroll.evaluate((el) => el.scrollTop)
  await token("\n\nSecond chunk while reading")
  await expect(panel.getByText(/Second chunk while reading/)).toBeAttached()
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0)
  await panel.getByRole("button", { name: "Jump to latest" }).click()
  await expect.poll(distance).toBeLessThan(2)
  await token("\n\nThird chunk while pinned")
  await expect(panel.getByText(/Third chunk while pinned/)).toBeAttached()
  await expect.poll(distance).toBeLessThan(2)
})

test("opening a saved chat starts at its latest message", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route("**/api/milo/preferences", (route) =>
    route.fulfill({ json: { position: null } })
  )
  await page.route("**/api/wiki/chat**", (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({
      json: url.searchParams.has("threadId")
        ? {
            messages: Array.from({ length: 25 }, (_, i) => ({
              id: `saved-${i}`,
              role: "user",
              content: `Saved message ${i}`,
            })),
          }
        : {
            threads: [
              {
                id: "saved",
                title: "Saved conversation",
                updatedAt: new Date().toISOString(),
              },
            ],
          },
    })
  })
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto("/home")
  await page.evaluate(() => localStorage.removeItem("milo-active-thread"))
  await page.getByRole("button", { name: "Ask Milo", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Milo" })
  await panel.getByRole("button", { name: "History" }).click()
  await panel.getByRole("button", { name: /^Saved conversation/ }).click()
  await expect(panel.getByText("Saved message 24")).toBeVisible()
  const scroll = panel.getByRole("region", { name: "Chat messages" })
  await expect
    .poll(() =>
      scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
    )
    .toBeLessThan(2)
})
