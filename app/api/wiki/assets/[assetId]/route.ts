import { NextResponse, type NextRequest } from "next/server"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { indexWikiAsset } from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchWikiNodes,
  WIKI_MANAGE_PERMISSION,
  type WikiAssetRow,
} from "@/lib/wiki"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: asset, error } = await supabase
    .from("wiki_assets")
    .select("id,storage_bucket,storage_path,status")
    .eq("id", assetId)
    .eq("status", "active")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 })
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 60 * 10)

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Unable to open asset." },
      { status: 400 }
    )
  }

  return NextResponse.redirect(data.signedUrl)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManageWiki = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: WIKI_MANAGE_PERMISSION,
  })

  if (!canManageWiki) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    title?: unknown
    description?: unknown
    altText?: unknown
    status?: unknown
  } | null

  if (!payload) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    updated_by: user.id,
  }

  if ("title" in payload) {
    const title = typeof payload.title === "string" ? payload.title.trim() : ""
    updates.title = title || null
  }

  if ("description" in payload) {
    const description =
      typeof payload.description === "string" ? payload.description.trim() : ""
    updates.description = description || null
  }

  if ("altText" in payload) {
    const altText =
      typeof payload.altText === "string" ? payload.altText.trim() : ""
    updates.alt_text = altText || null
  }

  if ("status" in payload) {
    updates.status = payload.status === "archived" ? "archived" : "active"
  }

  const { data: asset, error } = await supabase
    .from("wiki_assets")
    .update(updates)
    .eq("id", assetId)
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const nodes = await fetchWikiNodes(supabase)
  const pageNode = nodes.find((item) => item.id === asset.node_id)
  if (pageNode) {
    await indexWikiAsset({
      supabase,
      asset: asset as WikiAssetRow,
      pageTitle: pageNode.title,
      pagePath: buildWikiPath(nodes, pageNode),
    })
  }

  return NextResponse.json({ ok: true, asset })
}
