import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import { scanWikiAlerts } from "@/lib/wiki-alert-scan"
import { parseWikiAlertRecommendation } from "@/lib/wiki-alert-recommendation"
import { replaceDuplicateBlock } from "@/lib/wiki-duplicate-resolution"

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
    const nodes = await service.from("wiki_nodes").insert(
      ids.map((id, index) => ({
        id,
        type: "page",
        status: index === 0 ? "draft" : "published",
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
  it("finds identical pages including a draft in either direction using the service-role job path", async () => {
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
    const reverse = await detectWikiDuplicates(
      service,
      `job-${fixture}`,
      ids[1],
      undefined,
      false,
      true
    )
    expect(reverse?.passages[0].matches).toContainEqual(
      expect.objectContaining({
        pageId: ids[0],
        classification: "identical",
        page: expect.objectContaining({ status: "draft" }),
      })
    )
  })

  it("writes an applicable alert for an edited fixture and skips the next unchanged scan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    try {
      const text = `Fixture ${fixture} has an identical duplicate passage on both pages for alert detection.`
      const revision = await service
        .from("wiki_page_revisions")
        .insert({
          node_id: ids[0],
          blocks: [
            {
              id: `block-${ids[0]}`,
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
      const edit = await service
        .from("wiki_nodes")
        .update({ current_revision_id: revision.data.id })
        .eq("id", ids[0])
      if (edit.error) throw edit.error

      // Scope the job to its own fixtures; the real singleton watermark is
      // shared by all CI database tests, so keep this test's state in memory.
      let scanState: Record<string, unknown> | null = null
      const stateQuery = {
        select: () => stateQuery,
        eq: () => stateQuery,
        update: (values: Record<string, unknown>) => {
          scanState = { ...scanState, ...values }
          return stateQuery
        },
        insert: (values: Record<string, unknown>) => {
          scanState = { ...values }
          return stateQuery
        },
        maybeSingle: async () => ({ data: scanState, error: null }),
      }
      const client = {
        from: (table: string) => {
          if (table === "wiki_alert_scan_state") return stateQuery
          if (table === "wiki_nodes")
            return {
              select: (columns: string) =>
                service.from(table).select(columns).in("id", ids),
            }
          return service.from(table)
        },
        rpc: service.rpc.bind(service),
      } as unknown as Parameters<typeof scanWikiAlerts>[0]

      const first = await scanWikiAlerts(client)
      expect(first).toMatchObject({ skipped: false, written: 1 })
      const alert = await service
        .from("wiki_alerts")
        .select("page_id,other_page_id,recommendation")
        .in("page_id", ids)
        .in("other_page_id", ids)
        .eq("status", "open")
        .single()
      if (alert.error || !alert.data)
        throw alert.error ?? new Error("Missing alert")
      const recommendation = parseWikiAlertRecommendation(
        alert.data.recommendation,
        alert.data.page_id,
        alert.data.other_page_id
      )
      expect(recommendation).not.toBeNull()
      const targetRevision = await service
        .from("wiki_page_revisions")
        .select("blocks")
        .eq("id", recommendation!.baseRevisionId)
        .single()
      if (targetRevision.error || !targetRevision.data)
        throw targetRevision.error ?? new Error("Missing target revision")
      expect(
        replaceDuplicateBlock(
          targetRevision.data.blocks,
          recommendation!.blockId,
          recommendation!.canonicalTitle,
          recommendation!.canonicalPath
        )
      ).not.toBeNull()
      const watermark = scanState?.["last_page_updated_at"]
      expect(watermark).toBeTruthy()
      expect(await scanWikiAlerts(client)).toEqual({
        skipped: true,
        reason: "unchanged",
      })
      expect(scanState?.["last_page_updated_at"]).toBe(watermark)
      const manual = await scanWikiAlerts(client, { full: true })
      expect(manual).toMatchObject({
        skipped: false,
        pages: 2,
        opened: 0,
        updated: 1,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
