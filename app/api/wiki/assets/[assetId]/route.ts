import { NextResponse, type NextRequest } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { extractWikiVideoText } from "@/lib/wiki-extract"
import { indexWikiAsset } from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchWikiNodes,
  isPublishedWikiBranch,
  WIKI_MANAGE_PERMISSION,
  type WikiAssetRow,
} from "@/lib/wiki"

export const runtime = "nodejs"
export const maxDuration = 300

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

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  if (!canAccessBeta1) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  const [canAccessBeta1, canManageWiki] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])

  if (!canAccessBeta1 || !canManageWiki) {
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
      isPagePublished: isPublishedWikiBranch(nodes, pageNode),
    })
  }

  return NextResponse.json({ ok: true, asset })
}

export async function POST(
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

  const [canAccessBeta1, canManageWiki] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])

  if (!canAccessBeta1 || !canManageWiki) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    action?: unknown
  } | null
  const action = typeof payload?.action === "string" ? payload.action : ""

  const { data: asset, error: assetError } = await supabase
    .from("wiki_assets")
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .eq("id", assetId)
    .maybeSingle()

  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 400 })
  }

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 })
  }

  if (action === "transcribe") {
    if (asset.kind !== "video") {
      return NextResponse.json(
        { error: "Only video assets can be transcribed." },
        { status: 400 }
      )
    }

    const adminSupabase = createSupabaseAdminClient()
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path)

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: downloadError?.message ?? "Unable to read video file." },
        { status: 400 }
      )
    }

    let extractedText = ""
    try {
      const file = new File([fileData], asset.file_name, {
        type: asset.mime_type || "application/octet-stream",
      })
      extractedText = await extractWikiVideoText(file)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to transcribe video."
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { data: updatedAsset, error: updateError } = await supabase
      .from("wiki_assets")
      .update({
        extracted_text: extractedText || null,
        updated_by: user.id,
      })
      .eq("id", assetId)
      .select(
        "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
      )
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      asset: updatedAsset,
      extractedText,
    })
  }

  if (action === "index") {
    const nodes = await fetchWikiNodes(supabase)
    const pageNode = nodes.find((item) => item.id === asset.node_id)
    if (!pageNode) {
      return NextResponse.json(
        { error: "Wiki page not found." },
        { status: 404 }
      )
    }

    await indexWikiAsset({
      supabase,
      asset: asset as WikiAssetRow,
      pageTitle: pageNode.title,
      pagePath: buildWikiPath(nodes, pageNode),
      isPagePublished: isPublishedWikiBranch(nodes, pageNode),
    })

    return NextResponse.json({ ok: true, asset })
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 })
}
