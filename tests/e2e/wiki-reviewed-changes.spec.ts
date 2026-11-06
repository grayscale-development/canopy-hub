import { createClient } from "@supabase/supabase-js"
import { expect, test, type Page } from "@playwright/test"

import { signInAsLocalDev } from "./helpers"
import {
  createReviewedPage,
  currentRevisionId,
  enableEditorMode,
  ensureScreenshotDir,
  revisionTexts,
  screenshotDir,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test.describe.configure({ mode: "serial" })
test.setTimeout(120_000)

const lines = Array.from(
  { length: 40 },
  (_, index) => `Procedure step ${index + 1} stays in place.`
)
const changedLines = lines.map((line, index) =>
  index === 20 ? "Procedure step 21 now says LONGPAGE-TOKEN." : line
)
changedLines.push("Send the file")

test.beforeAll(() => {
  ensureScreenshotDir()
})

async function settle(locator: ReturnType<Page["locator"]>) {
  await locator.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true })
    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => undefined))
    )
  })
}

function waitForAppliedPreview(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/wiki/import") &&
      response.request().method() === "POST"
  )
}

async function openUpdate(page: Page) {
  await enableEditorMode(page)
  await page.getByRole("button", { name: "AI Update" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

test("a reader cannot open unpublished wiki history @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const reviewed = await createReviewedPage({
    slug: `reader-history-${stamp}`,
    title: `Reader history ${stamp}`,
    paragraphs: ["Reader current sentence READER-CURRENT."],
    olderParagraphs: ["Reader old sentence READER-OLD."],
  })
  await signInAsSeededUser(page, "standard@canopy.test")
  await page.goto(reviewed.path)
  await expect(
    page.getByRole("heading", { name: `Reader history ${stamp}` })
  ).toBeVisible()
  await expect(page.getByText("READER-CURRENT")).toBeVisible()
  await expect(page.getByText("READER-OLD")).toHaveCount(0)
  const date = page.getByText(/Last updated at/)
  await date.scrollIntoViewIfNeeded()
  await expect(date).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Last updated at/ })
  ).toHaveCount(0)
  await page.screenshot({
    path: `${screenshotDir}/footer-date-reader.png`,
    fullPage: true,
  })
  await expect(page.getByRole("menu")).toHaveCount(0)

  const { data: node, error: nodeError } = await serviceWiki()
    .from("wiki_nodes")
    .select("id,current_revision_id")
    .eq("id", reviewed.id)
    .single()
  expect(nodeError).toBeNull()
  const reader = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: readerSignInError } = await reader.auth.signInWithPassword({
    email: "standard@canopy.test",
    password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
  })
  expect(readerSignInError).toBeNull()
  const { data: readerHistory, error: readerHistoryError } = await reader
    .from("wiki_page_revisions")
    .select("id")
    .eq("node_id", node!.id)
  expect(readerHistoryError).toBeNull()
  expect(readerHistory?.map((revision) => revision.id)).toEqual([
    node?.current_revision_id,
  ])
  await page.goto(`${reviewed.path}?revision=${reviewed.olderRevisionId}`)
  await expect(page.getByText("READER-OLD")).toHaveCount(0)
  await expect(page.getByText("READER-CURRENT")).toBeVisible()
  const current = await currentRevisionId(reviewed.id)
  expect(current).toBe(reviewed.revisionId)
})

test("editor mode opens history only from the footer date and restore appends a revision @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const reviewed = await createReviewedPage({
    slug: `restore-history-${stamp}`,
    title: `Restore history ${stamp}`,
    paragraphs: ["Current restore sentence RESTORE-NOW."],
    olderParagraphs: ["Older restore sentence RESTORE-OLD."],
  })
  await signInAsLocalDev(page)
  await page.goto(reviewed.path)
  const plainDate = page.getByText(/Last updated at/)
  await plainDate.scrollIntoViewIfNeeded()
  await expect(
    page.getByRole("button", { name: /Last updated at/ })
  ).toHaveCount(0)
  await page.screenshot({
    path: `${screenshotDir}/footer-date-view-mode.png`,
    fullPage: true,
  })

  await enableEditorMode(page)
  const dateButton = page.getByRole("button", { name: /Last updated at/ })
  await dateButton.scrollIntoViewIfNeeded()
  await dateButton.click()
  const versionMenu = page.getByRole("menu")
  await expect(versionMenu).toBeVisible()
  await expect(
    page.getByRole("combobox", { name: "Page versions" })
  ).toHaveCount(0)
  await settle(versionMenu)
  await page.screenshot({
    path: `${screenshotDir}/footer-version-history.png`,
    fullPage: true,
  })

  const before = await revisionTexts(reviewed.id)
  await page.getByRole("menuitem", { name: /Initial draft/ }).click()
  await expect(page.getByText("1 change", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Restore this version" }).click()
  const dialog = page.getByRole("dialog", { name: "Restore this version?" })
  await expect(dialog).toBeVisible()
  await settle(dialog)
  await page.screenshot({
    path: `${screenshotDir}/restore-confirm.png`,
    fullPage: true,
  })
  await dialog.getByRole("button", { name: "Restore this version" }).click()
  await expect(page.getByText("RESTORE-OLD").first()).toBeVisible()
  await page.reload()
  await expect(page.getByText("RESTORE-OLD").first()).toBeVisible()

  const after = await revisionTexts(reviewed.id)
  expect(after.length).toBe(before.length + 1)
  expect(
    after.some((revision) => revision.change_note?.startsWith("Restored from"))
  ).toBe(true)
  expect(
    after.some((revision) => revision.plain_text.includes("RESTORE-OLD"))
  ).toBe(true)
  expect(
    after.some((revision) => revision.plain_text.includes("RESTORE-NOW"))
  ).toBe(true)
  expect(await currentRevisionId(reviewed.id)).not.toBe(reviewed.revisionId)
  expect(await currentRevisionId(reviewed.id)).not.toBe(
    reviewed.olderRevisionId
  )
})

test("a long reviewed replacement shows non-text changes and persists after reload @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const reviewed = await createReviewedPage({
    slug: `long-review-${stamp}`,
    title: "Long review sample",
    paragraphs: lines,
  })
  await signInAsLocalDev(page)
  await page.goto(reviewed.path)
  await openUpdate(page)
  await page.getByRole("switch", { name: "Replace existing content" }).click()
  await page
    .getByLabel("Or paste text")
    .fill(
      `${changedLines.join("\n\n")}\n\n[Send the file](https://example.com/new-guide)\n\n![Reviewed chart](https://example.com/chart.png)\n\n| Fee | Amount |\n| --- | --- |\n| Review | 125 |`
    )
  await page.getByRole("button", { name: "See what will change" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("LONGPAGE-TOKEN")).toBeVisible()
  await expect(dialog.getByText("Fee")).toBeVisible()
  await expect(dialog.getByText(/picture/i)).toBeVisible()
  await expect(dialog.getByText(/table/i)).toBeVisible()
  await expect(dialog.getByText(/link/i)).toBeVisible()
  await settle(dialog)
  await page.screenshot({
    path: `${screenshotDir}/long-page-update-preview.png`,
    fullPage: true,
  })
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/wiki/import") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("apply_preview")
  )
  await dialog.getByRole("button", { name: "Replace page" }).click()
  expect((await savedResponse).status()).toBe(200)
  await expect(dialog).toBeHidden()
  await expect(page.getByText("LONGPAGE-TOKEN").first()).toBeVisible()
  await page.reload()
  await expect(page.getByText("LONGPAGE-TOKEN").first()).toBeVisible()
  await expect(page.getByText("Fee").first()).toBeVisible()
  const saved = await revisionTexts(reviewed.id)
  const currentId = await currentRevisionId(reviewed.id)
  const current = saved.find((revision) => revision.id === currentId)
  expect(current?.plain_text).toContain("LONGPAGE-TOKEN")
  expect(current?.plain_text).toContain("Fee")
  expect(saved.some((revision) => revision.id === reviewed.revisionId)).toBe(
    true
  )
  const { data: currentRow } = await serviceWiki()
    .from("wiki_page_revisions")
    .select("blocks")
    .eq("id", current?.id ?? "")
    .single()
  const savedTypes = JSON.stringify(currentRow?.blocks)
  expect(savedTypes).toContain('"type":"table"')
  expect(savedTypes).toContain('"type":"image"')
  expect(savedTypes).toContain("https://example.com/new-guide")
})

test("cancel leaves the revision untouched and a reviewed file save persists @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const reviewed = await createReviewedPage({
    slug: `file-review-${stamp}`,
    title: "File review sample",
    paragraphs: ["Original file page."],
  })
  await signInAsLocalDev(page)
  await page.goto(reviewed.path)
  await openUpdate(page)
  await page
    .getByLabel("Or paste text")
    .fill("Cancelled sentence CANCEL-TOKEN.")
  await page.getByRole("button", { name: "See what will change" }).click()
  await expect(page.getByText("CANCEL-TOKEN")).toBeVisible()
  await page.getByRole("button", { name: "Back" }).click()
  await expect(
    page.getByRole("button", { name: "See what will change" })
  ).toBeVisible()
  await page.reload()
  expect(await currentRevisionId(reviewed.id)).toBe(reviewed.revisionId)
  await expect(page.getByText("CANCEL-TOKEN")).toHaveCount(0)

  await openUpdate(page)
  await page.setInputFiles('input[type="file"]', {
    name: "notes-reviewed.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Reviewed file sentence FILE-TOKEN."),
  })
  await page.getByRole("button", { name: "See what will change" }).click()
  await expect(page.getByText("FILE-TOKEN")).toBeVisible()
  const savedFile = waitForAppliedPreview(page)
  await page.getByRole("button", { name: "Update page" }).click()
  expect((await savedFile).status()).toBe(200)
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText("FILE-TOKEN").first()).toBeVisible()
  await page.reload()
  await expect(page.getByText("FILE-TOKEN").first()).toBeVisible()
  await page.screenshot({
    path: `${screenshotDir}/persisted-file-update.png`,
    fullPage: true,
  })
  const saved = await revisionTexts(reviewed.id)
  expect(
    saved.some((revision) => revision.plain_text.includes("FILE-TOKEN"))
  ).toBe(true)
  expect(
    saved.some((revision) => revision.plain_text === "Original file page.")
  ).toBe(true)
  const { data: assets } = await serviceWiki()
    .from("wiki_assets")
    .select("file_name")
    .eq("node_id", reviewed.id)
  expect(assets?.map((asset) => asset.file_name)).toContain(
    "notes-reviewed.txt"
  )
})

test("a stale or tampered preview is refused without a new revision @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const reviewed = await createReviewedPage({
    slug: `stale-review-${stamp}`,
    title: "Stale review sample",
    paragraphs: ["Original stale page."],
  })
  await signInAsLocalDev(page)
  await page.goto(reviewed.path)
  await openUpdate(page)
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/wiki/import") &&
      response.request().method() === "POST"
  )
  await page.getByLabel("Or paste text").fill("Tampered sentence TAMPER-TOKEN.")
  await page.getByRole("button", { name: "See what will change" }).click()
  const payload = await (await previewResponse).json()
  const tampered = String(payload.signedPreview).replace("Tampered", "Swapped")
  const refused = await page.request.post("/api/wiki/import", {
    multipart: {
      apply_preview: "1",
      target_page_id: reviewed.id,
      mode: "update",
      signed_preview: tampered,
      preview_signature: payload.previewSignature,
    },
  })
  expect(refused.status()).toBe(400)
  expect(await currentRevisionId(reviewed.id)).toBe(reviewed.revisionId)

  const { data: concurrent, error } = await serviceWiki()
    .from("wiki_page_revisions")
    .insert({
      node_id: reviewed.id,
      blocks: [{ type: "paragraph", content: "Concurrent edit BETA." }],
      plain_text: "Concurrent edit BETA.",
      change_note: "Concurrent",
    })
    .select("id")
    .single()
  if (error || !concurrent)
    throw error ?? new Error("Concurrent revision failed.")
  const { error: pointerError } = await serviceWiki()
    .from("wiki_nodes")
    .update({ current_revision_id: concurrent.id })
    .eq("id", reviewed.id)
  if (pointerError) throw pointerError

  const staleSave = waitForAppliedPreview(page)
  await page.getByRole("button", { name: "Update page" }).click()
  expect((await staleSave).status()).toBe(409)
  await expect(page.getByText(/changed after you looked at it/i)).toBeVisible()
  await page.reload()
  await expect(page.getByText("Concurrent edit BETA.")).toBeVisible()
  await expect(page.getByText("TAMPER-TOKEN")).toHaveCount(0)
  const texts = await revisionTexts(reviewed.id)
  expect(
    texts.some((revision) => revision.plain_text.includes("TAMPER-TOKEN"))
  ).toBe(false)
  expect(await currentRevisionId(reviewed.id)).toBe(concurrent.id)
})

test("AI merge archives the source only after the target save and keeps its history @wiki-reviewed", async ({
  page,
}) => {
  const stamp = Date.now()
  const source = await createReviewedPage({
    slug: `merge-source-${stamp}`,
    title: `Merge Source ${stamp}`,
    paragraphs: ["Add the source sentence SAMPLE-MERGE."],
  })
  const target = await createReviewedPage({
    slug: `merge-target-${stamp}`,
    title: `Merge Target ${stamp}`,
    paragraphs: ["Keep the target sentence."],
  })
  const { error: olderError } = await serviceWiki()
    .from("wiki_page_revisions")
    .insert({
      node_id: source.id,
      blocks: [{ type: "paragraph", content: "Original source history." }],
      plain_text: "Original source history.",
      change_note: "Original source history",
    })
  if (olderError) throw olderError
  const { error: assetError } = await serviceWiki()
    .from("wiki_assets")
    .insert({
      node_id: source.id,
      storage_bucket: "Wiki",
      storage_path: `${source.id}/source-note.txt`,
      file_name: "source-note.txt",
      mime_type: "text/plain",
      size_bytes: 12,
      kind: "document",
    })
  if (assetError) throw assetError

  await signInAsLocalDev(page)
  await page.goto(source.path)
  await enableEditorMode(page)
  await page.getByRole("button", { name: `Merge Source ${stamp}` }).click()
  const editDialog = page.getByRole("dialog", { name: "Edit Wiki Item" })
  await editDialog.getByRole("button", { name: "Move" }).click()
  const moveDialog = page.getByRole("dialog", {
    name: `Move Merge Source ${stamp}`,
  })
  await moveDialog.getByRole("button", { name: "Canopy Wiki" }).click()
  await moveDialog.getByRole("button", { name: "Operations" }).click()
  await moveDialog.getByRole("button", { name: "Closing" }).click()
  await moveDialog
    .getByRole("button", { name: `Merge Target ${stamp}` })
    .click()
  await moveDialog
    .getByRole("button", { name: "AI Merge into this page" })
    .click()
  const confirm = page.getByRole("dialog", { name: "Merge pages?" })
  await expect(confirm).toContainText("archives")
  await expect(confirm).not.toContainText(/delete/i)
  await expect(confirm.getByText("SAMPLE-MERGE")).toBeVisible()
  await settle(confirm)
  await page.screenshot({
    path: `${screenshotDir}/merge-confirm.png`,
    fullPage: true,
  })
  await confirm.getByRole("button", { name: "Cancel" }).click()
  const { data: stillPublished } = await serviceWiki()
    .from("wiki_nodes")
    .select("status,current_revision_id")
    .eq("id", source.id)
    .single()
  expect(stillPublished?.status).toBe("published")
  expect(await currentRevisionId(target.id)).toBe(target.revisionId)

  await moveDialog
    .getByRole("button", { name: "AI Merge into this page" })
    .click()
  const confirmAgain = page.getByRole("dialog", { name: "Merge pages?" })
  await expect(confirmAgain.getByText("SAMPLE-MERGE")).toBeVisible()
  const merged = waitForAppliedPreview(page)
  await confirmAgain
    .getByRole("button", { name: "AI Merge and archive" })
    .click()
  expect((await merged).status()).toBe(200)
  await expect(confirmAgain).toBeHidden()
  await page.goto(target.path)
  await expect(page.getByText("SAMPLE-MERGE").first()).toBeVisible()
  await expect(
    page.getByText("Keep the target sentence.").first()
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText("SAMPLE-MERGE").first()).toBeVisible()

  const { data: archived } = await serviceWiki()
    .from("wiki_nodes")
    .select("status")
    .eq("id", source.id)
    .single()
  expect(archived?.status).toBe("archived")
  const sourceHistory = await revisionTexts(source.id)
  expect(
    sourceHistory.some(
      (revision) => revision.plain_text === "Original source history."
    )
  ).toBe(true)
  expect(
    sourceHistory.some((revision) =>
      revision.plain_text.includes("SAMPLE-MERGE")
    )
  ).toBe(true)
  const { data: assets } = await serviceWiki()
    .from("wiki_assets")
    .select("file_name")
    .eq("node_id", source.id)
  expect(assets).toEqual([{ file_name: "source-note.txt" }])
  const targetHistory = await revisionTexts(target.id)
  expect(
    targetHistory.some((revision) =>
      revision.plain_text.includes("SAMPLE-MERGE")
    )
  ).toBe(true)
  expect(
    targetHistory.some((revision) => revision.id === target.revisionId)
  ).toBe(true)
})
