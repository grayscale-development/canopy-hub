import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchWikiNodes, WIKI_MANAGE_PERMISSION } from "@/lib/wiki"
import { replaceDuplicateBlock } from "@/lib/wiki-duplicate-resolution"
import { buildNumericWikiPath, parseWikiPath } from "@/lib/wiki-paths"
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
  if (
    !body ||
    [
      "nodeId",
      "revisionId",
      "blockId",
      "targetId",
      "targetRevisionId",
      "targetTitle",
      "targetPath",
    ].some(
      (key) =>
        typeof body[key] !== "string" ||
        !body[key] ||
        (key !== "targetTitle" && body[key].length > 2048)
    ) ||
    body.nodeId === body.targetId
  ) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const nodes = await fetchWikiNodes(supabase)
  const page = nodes.find(
    (node) => node.id === body.nodeId && node.type === "page"
  )
  const target = nodes.find(
    (node) => node.id === body.targetId && node.type === "page"
  )
  if (
    !page ||
    !target ||
    page.status === "archived" ||
    target.status === "archived"
  )
    return NextResponse.json({ error: "Page not found." }, { status: 404 })
  const targetSegments = buildNumericWikiPath(nodes, target).split("/")
  if (
    page.current_revision_id !== body.revisionId ||
    target.current_revision_id !== body.targetRevisionId ||
    !parseWikiPath(targetSegments) ||
    target.title !== body.targetTitle ||
    `/wiki/${targetSegments.join("/")}` !== body.targetPath
  ) {
    return NextResponse.json({ error: changed }, { status: 409 })
  }
  const { data: revision, error } = await supabase
    .from("wiki_page_revisions")
    .select("blocks")
    .eq("id", body.revisionId)
    .eq("node_id", page.id)
    .maybeSingle()
  if (error || !revision)
    return NextResponse.json({ error: changed }, { status: 409 })
  const blocks = replaceDuplicateBlock(
    revision.blocks,
    body.blockId,
    target.title,
    body.targetPath
  )
  if (!blocks) return NextResponse.json({ error: changed }, { status: 409 })

  return applyPreparedWikiPreview({
    supabase,
    targetPage: page,
    sourcePageId: null,
    sourceRevisionId: null,
    blocks,
    changeNote: `Consolidated duplicate with ${target.title}`,
  })
}
