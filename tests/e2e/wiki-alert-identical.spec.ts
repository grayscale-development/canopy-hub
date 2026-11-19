import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { mockMiloChatApi } from "./helpers"
import {
  createReviewedPage,
  serviceWiki,
  signInAsSeededUser,
} from "./wiki-reviewed-helpers"

test("an identical draft alert shows the recommendation and confirms before archiving", async ({
  page,
}) => {
  const stamp = randomUUID()
  const text = `Before closing ${stamp}, check approvals and record signed documents in the shared tracking system.`
  const block = (id: string) => ({
    id,
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
    children: [],
  })
  const canonical = await createReviewedPage({
    slug: `alert-keep-${stamp}`,
    title: "Closing Desk Checklist",
    paragraphs: [],
    extraBlocks: [block("keep")],
  })
  const copy = await createReviewedPage({
    slug: `alert-copy-${stamp}`,
    title: "Closing Checklist (copy)",
    paragraphs: [],
    extraBlocks: [block("copy")],
  })
  const supabase = serviceWiki()
  try {
    const draft = await supabase
      .from("wiki_nodes")
      .update({ status: "draft" })
      .eq("id", copy.id)
    if (draft.error) throw draft.error
    const alert = await supabase
      .from("wiki_alerts")
      .insert({
        page_id: copy.id,
        other_page_id: canonical.id,
        recommendation: {
          version: 2,
          kind: "identical",
          summary:
            "Closing Checklist (copy) is an exact copy of Closing Desk Checklist. Keep Closing Desk Checklist and archive the copy to maintain one source of truth.",
          excerpt: text,
          targetPageId: copy.id,
          baseRevisionId: copy.revisionId,
          canonicalPageId: canonical.id,
          canonicalRevisionId: canonical.revisionId,
          canonicalTitle: "Closing Desk Checklist",
          canonicalPath: canonical.path,
          blockId: "copy",
          changeNote: "Consolidated duplicate",
        },
      })
      .select("id")
      .single()
    if (alert.error || !alert.data)
      throw alert.error ?? new Error("Missing alert")
    await page.route("**/rest/v1/wiki_alerts?**", async (route) => {
      if (route.request().method() !== "GET") return route.continue()
      const url = new URL(route.request().url())
      url.searchParams.set("id", `eq.${alert.data.id}`)
      await route.continue({ url: url.toString() })
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockMiloChatApi(page)
    await signInAsSeededUser(page, "wiki-manager@canopy.test")
    await page.goto("/wiki")
    await page.getByRole("button", { name: /^Alerts/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Identical", { exact: true })).toBeVisible()
    await expect(
      dialog.getByText(/Closing Checklist \(copy\) is an exact copy/)
    ).toBeVisible()
    await expect(
      dialog.getByRole("link", { name: "Closing Checklist (copy) (Draft)" })
    ).toBeVisible()
    await dialog.getByText("Show duplicated text").click()
    await expect(dialog.getByText(text)).toBeVisible()
    await dialog.getByRole("button", { name: "Apply recommendation" }).click()
    const confirm = dialog.getByRole("group", { name: "Confirm archive" })
    await expect(confirm.getByText(/Archive Closing Checklist/)).toBeVisible()
    await confirm.getByRole("button", { name: "Cancel" }).click()
    expect(
      (
        await supabase
          .from("wiki_nodes")
          .select("status")
          .eq("id", copy.id)
          .single()
      ).data?.status
    ).toBe("draft")
    await dialog.getByRole("button", { name: "Apply recommendation" }).click()
    await confirm.getByRole("button", { name: "Archive page" }).click()
    await expect(dialog.getByText("No open alerts.")).toBeVisible()
    expect(
      (
        await supabase
          .from("wiki_nodes")
          .select("status")
          .eq("id", copy.id)
          .single()
      ).data?.status
    ).toBe("archived")
    expect(
      (
        await supabase
          .from("wiki_nodes")
          .select("status")
          .eq("id", canonical.id)
          .single()
      ).data?.status
    ).toBe("published")
    expect(
      (
        await supabase
          .from("wiki_alerts")
          .select("status")
          .eq("id", alert.data.id)
          .single()
      ).data?.status
    ).toBe("applied")
  } finally {
    const { error } = await supabase
      .from("wiki_nodes")
      .delete()
      .in("id", [canonical.id, copy.id])
    if (error) throw error
  }
})
