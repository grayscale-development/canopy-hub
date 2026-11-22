import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

import { logAiAction } from "@/lib/ai-action-log"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  fetchWikiNodes,
  isUnarchivedWikiBranch,
  WIKI_MANAGE_PERMISSION,
} from "@/lib/wiki"
import { parseWikiAlertRecommendation } from "@/lib/wiki-alert-recommendation"
import { alertPageHash } from "@/lib/wiki-alert-scan"
import { replaceDuplicateBlock } from "@/lib/wiki-duplicate-resolution"
import { buildNumericWikiPath } from "@/lib/wiki-paths"
import { applyPreparedWikiPreview } from "@/lib/wiki-reviewed-revision"

const changed =
  "This page changed after you looked at it. Look again before saving."

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const permissions = await Promise.all(
    [BETA_1_PERMISSION, WIKI_MANAGE_PERMISSION].map((code) =>
      userHasPermissionCode({ supabase, userId: user.id, code })
    )
  )
  if (permissions.some((allowed) => !allowed))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== "string" || !body.id)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  const alert = await supabase
    .from("wiki_alerts")
    .select(
      "id,status,page_id,other_page_id,page_hash,other_page_hash,recommendation"
    )
    .eq("id", body.id)
    .maybeSingle()
  const row = alert.data
  if (alert.error || !row || row.status !== "open")
    return NextResponse.json(
      { error: "This alert is no longer available." },
      { status: 400 }
    )
  const recommendation = parseWikiAlertRecommendation(
    row.recommendation,
    row.page_id,
    row.other_page_id
  )
  if (!recommendation)
    return NextResponse.json(
      { error: "This recommendation cannot be applied." },
      { status: 400 }
    )
  const nodes = await fetchWikiNodes(supabase)
  const page = nodes.find(
    (node) => node.id === recommendation.targetPageId && node.type === "page"
  )
  const canonical = nodes.find(
    (node) => node.id === recommendation.canonicalPageId && node.type === "page"
  )
  const canonicalHash =
    row.page_id === recommendation.canonicalPageId
      ? row.page_hash
      : row.other_page_hash
  if (
    !page ||
    !canonical ||
    page.status === "archived" ||
    canonical.status === "archived" ||
    (recommendation.version === 2 &&
      canonical.current_revision_id !== recommendation.canonicalRevisionId) ||
    !canonical.current_revision_id ||
    (canonicalHash &&
      canonicalHash !== alertPageHash(canonical.current_revision_id)) ||
    !isUnarchivedWikiBranch(nodes, page) ||
    !isUnarchivedWikiBranch(nodes, canonical) ||
    page.current_revision_id !== recommendation.baseRevisionId ||
    canonical.title !== recommendation.canonicalTitle ||
    `/wiki/${buildNumericWikiPath(nodes, canonical)}` !==
      recommendation.canonicalPath
  )
    return NextResponse.json({ error: changed }, { status: 409 })
  if (recommendation.version === 2 && recommendation.kind === "identical") {
    if (body.confirmArchive !== true)
      return NextResponse.json(
        { error: "Confirm before archiving this page." },
        { status: 400 }
      )
    const archived = await supabase.rpc("apply_identical_wiki_alert", {
      p_alert_id: row.id,
    })
    if (archived.error) {
      if (archived.error.message.includes("stale"))
        return NextResponse.json({ error: changed }, { status: 409 })
      return NextResponse.json(
        { error: "Unable to archive this page. Please try again." },
        { status: 400 }
      )
    }
    revalidatePath("/wiki")
    await logAiAction(supabase, {
      type: "alert_apply",
      pageId: page.id,
      alertId: row.id,
    })
    return NextResponse.json({ ok: true, archived: true })
  }
  const revision = await supabase
    .from("wiki_page_revisions")
    .select("blocks")
    .eq("id", recommendation.baseRevisionId)
    .eq("node_id", page.id)
    .maybeSingle()
  if (revision.error || !revision.data)
    return NextResponse.json({ error: changed }, { status: 409 })
  const blocks = replaceDuplicateBlock(
    revision.data.blocks,
    recommendation.blockId,
    canonical.title,
    recommendation.canonicalPath
  )
  if (!blocks)
    return NextResponse.json(
      { error: "This recommendation cannot be applied." },
      { status: 400 }
    )
  // A non-null source archives that page in the reviewed-revision RPC. This is
  // a link replacement, so preserve the canonical page as the resolver does.
  const result = await applyPreparedWikiPreview({
    supabase,
    targetPage: page,
    sourcePageId: null,
    sourceRevisionId: null,
    blocks,
    changeNote: recommendation.changeNote,
  })
  if (!result.ok) return result
  const updated = await supabase
    .from("wiki_alerts")
    .update({
      status: "applied",
      applied_by: user.id,
      applied_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle()
  if (updated.error || !updated.data)
    return NextResponse.json(
      {
        error:
          "The page was saved, but the alert could not be marked applied. Refresh before trying again.",
      },
      { status: 500 }
    )
  await logAiAction(supabase, {
    type: "alert_apply",
    pageId: page.id,
    alertId: row.id,
  })
  return result
}
