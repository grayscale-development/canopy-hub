import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip
dbDescribe("alerts scan duplicate detection", { timeout: 60_000 }, () => {
  const ids = [randomUUID(), randomUUID()]
  const fixture = randomUUID()
  let service: SupabaseClient
  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const nodes = await service
      .from("wiki_nodes")
      .insert(
        ids.map((id, index) => ({
          id,
          type: "page",
          status: "published",
          slug: `alert-scan-${fixture}-${index}`,
          title: `Alert scan ${index}`,
        }))
      )
    if (nodes.error) throw nodes.error
    for (const id of ids) {
      const text = `Fixture ${fixture} has an identical duplicate passage on both pages for alert detection.`
      const revision = await service
        .from("wiki_page_revisions")
        .insert({
          node_id: id,
          blocks: [
            {
              id: `block-${id}`,
              type: "paragraph",
              content: [{ type: "text", text, styles: {} }],
              children: [],
            },
          ],
          plain_text: text,
        })
        .select("id")
        .single()
      if (revision.error || !revision.data)
        throw revision.error ?? new Error("Missing revision")
      const updated = await service
        .from("wiki_nodes")
        .update({ current_revision_id: revision.data.id })
        .eq("id", id)
      if (updated.error) throw updated.error
    }
  })
  afterAll(async () => {
    if (service) {
      const result = await service.from("wiki_nodes").delete().in("id", ids)
      if (result.error) throw result.error
    }
  })
  it("finds fixture overlap using the service-role job path", async () => {
    const result = await detectWikiDuplicates(
      service,
      `job-${fixture}`,
      ids[0],
      undefined,
      false,
      true
    )
    expect(
      result?.passages
        .find((passage) => passage.blockId === `block-${ids[0]}`)
        ?.matches.some((match) => match.pageId === ids[1])
    ).toBe(true)
  })
})
