import "server-only"

import { createHash } from "node:crypto"

import type { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import { replaceDuplicateBlock } from "@/lib/wiki-duplicate-resolution"
import { parseWikiAlertRecommendation } from "@/lib/wiki-alert-recommendation"

type Client = ReturnType<typeof createSupabaseAdminClient>

export function alertPageHash(revisionId: string) {
  return createHash("sha256").update(revisionId).digest("hex")
}

export function closedPairUnchanged(
  rows: {
    status: string
    page_id: string
    page_hash: string | null
    other_page_hash: string | null
  }[],
  pageId: string,
  pageHash: string,
  otherHash: string
) {
  return rows.some(
    (row) =>
      row.status !== "open" &&
      (row.page_id === pageId
        ? row.page_hash === pageHash && row.other_page_hash === otherHash
        : row.page_hash === otherHash && row.other_page_hash === pageHash)
  )
}

export async function scanWikiAlerts(supabase: Client) {
  const state = await supabase
    .from("wiki_alert_scan_state")
    .select("last_page_updated_at")
    .eq("singleton", true)
    .maybeSingle()
  if (state.error) throw state.error
  const watermark = state.data?.last_page_updated_at as
    | string
    | null
    | undefined
  const latest = await supabase
    .from("wiki_nodes")
    .select("updated_at")
    .eq("type", "page")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest.error) throw latest.error
  const maxUpdated = latest.data?.updated_at as string | undefined
  const newer = watermark
    ? await supabase
        .from("wiki_nodes")
        .select("id")
        .eq("type", "page")
        .eq("status", "published")
        .gt("updated_at", watermark)
        .limit(1)
    : null
  if (newer?.error) throw newer.error
  if (watermark && !newer?.data?.length) {
    const saved = await supabase
      .from("wiki_alert_scan_state")
      .upsert({ singleton: true, last_success_at: new Date().toISOString() })
    if (saved.error) throw saved.error
    console.info("Wiki alerts scan", {
      pages: 0,
      pairs: 0,
      written: 0,
      skipped: 0,
      skippedUnchanged: 1,
    })
    return { skipped: true, reason: "unchanged" }
  }

  const pages: {
    id: string
    title: string
    current_revision_id: string | null
  }[] = []
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("wiki_nodes")
      .select("id,title,current_revision_id")
      .eq("type", "page")
      .eq("status", "published")
      .order("id")
      .range(offset, offset + 999)
    if (watermark) query = query.gt("updated_at", watermark)
    if (maxUpdated) query = query.lte("updated_at", maxUpdated)
    const result = await query
    if (result.error) throw result.error
    pages.push(...(result.data ?? []))
    if ((result.data ?? []).length < 1000) break
  }
  let pairs = 0,
    written = 0,
    skipped = 0
  const seen = new Set<string>()
  for (const page of pages) {
    if (!page.current_revision_id) {
      skipped++
      continue
    }
    const detected = await detectWikiDuplicates(
      supabase,
      "alerts-job",
      page.id,
      undefined,
      false,
      true
    )
    if (!detected || detected.revisionId !== page.current_revision_id) {
      skipped++
      continue
    }
    const revision = await supabase
      .from("wiki_page_revisions")
      .select("blocks")
      .eq("id", detected.revisionId)
      .eq("node_id", page.id)
      .maybeSingle()
    if (revision.error) throw revision.error
    for (const passage of detected.passages) {
      for (const match of passage.matches) {
        const key = [page.id, match.pageId].sort().join(":")
        if (seen.has(key)) continue
        seen.add(key)
        pairs++
        const pageHash = alertPageHash(detected.revisionId)
        const otherHash = alertPageHash(match.revisionId)
        const rows: {
          id: string
          status: string
          page_id: string
          page_hash: string | null
          other_page_hash: string | null
        }[] = []
        for (let offset = 0; ; offset += 1000) {
          const existing = await supabase
            .from("wiki_alerts")
            .select("id,status,page_id,page_hash,other_page_hash")
            .in("page_id", [page.id, match.pageId])
            .in("other_page_id", [page.id, match.pageId])
            .order("id")
            .range(offset, offset + 999)
          if (existing.error) throw existing.error
          rows.push(...(existing.data ?? []))
          if ((existing.data ?? []).length < 1000) break
        }
        const open = rows.find((row) => row.status === "open")
        if (!open && closedPairUnchanged(rows, page.id, pageHash, otherHash)) {
          skipped++
          continue
        }
        const title = match.title
        const recommendation = {
          version: 1,
          summary: `Replace the duplicated passage on ${page.title} with a link to ${title}.`,
          targetPageId: page.id,
          baseRevisionId: detected.revisionId,
          canonicalPageId: match.pageId,
          canonicalTitle: title,
          canonicalPath: match.path,
          blockId: passage.blockId,
          changeNote: `Consolidated duplicate with ${title}`.slice(0, 1000),
        }
        if (
          !parseWikiAlertRecommendation(
            recommendation,
            page.id,
            match.pageId
          ) ||
          !replaceDuplicateBlock(
            revision.data?.blocks,
            passage.blockId,
            title,
            match.path
          )
        ) {
          skipped++
          continue
        }
        const values = {
          recommendation,
          page_hash: open && open.page_id !== page.id ? otherHash : pageHash,
          other_page_hash:
            open && open.page_id !== page.id ? pageHash : otherHash,
        }
        const saved = open
          ? await supabase
              .from("wiki_alerts")
              .update(values)
              .eq("id", open.id)
              .eq("status", "open")
              .select("id")
              .maybeSingle()
          : await supabase
              .from("wiki_alerts")
              .insert({
                ...values,
                page_id: page.id,
                other_page_id: match.pageId,
              })
              .select("id")
              .single()
        if (saved.error) throw saved.error
        if (saved.data) written++
        else skipped++
      }
    }
  }
  const saved = await supabase.from("wiki_alert_scan_state").upsert({
    singleton: true,
    last_success_at: new Date().toISOString(),
    ...(maxUpdated ? { last_page_updated_at: maxUpdated } : {}),
  })
  if (saved.error) throw saved.error
  console.info("Wiki alerts scan", {
    pages: pages.length,
    pairs,
    written,
    skipped,
    skippedUnchanged: 0,
  })
  return {
    skipped: false,
    pages: pages.length,
    pairs,
    written,
    skippedCount: skipped,
  }
}
