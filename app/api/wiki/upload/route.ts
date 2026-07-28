import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { extractWikiDocumentText } from "@/lib/wiki-extract"
import { indexWikiAsset } from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchWikiNodes,
  getWikiAssetKind,
  sanitizeWikiFileName,
  validateWikiUpload,
  WIKI_BUCKET,
  WIKI_MANAGE_PERMISSION,
  type WikiAssetRow,
} from "@/lib/wiki"

export const runtime = "nodejs"

export async function POST(request: Request) {
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

  const formData = await request.formData()
  const file = formData.get("file")
  const nodeIdValue = formData.get("node_id")
  const titleValue = formData.get("title")
  const descriptionValue = formData.get("description")
  const altTextValue = formData.get("alt_text")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 })
  }

  const nodeId = typeof nodeIdValue === "string" ? nodeIdValue.trim() : ""
  if (!nodeId) {
    return NextResponse.json({ error: "Page ID is required." }, { status: 400 })
  }

  const validationError = validateWikiUpload(file)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const kind = getWikiAssetKind(file)
  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 }
    )
  }

  const { data: node, error: nodeError } = await supabase
    .from("wiki_nodes")
    .select(
      "id,parent_id,type,slug,title,status,sort_order,current_revision_id,created_by,updated_by,created_at,updated_at"
    )
    .eq("id", nodeId)
    .eq("type", "page")
    .maybeSingle()

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 400 })
  }

  if (!node) {
    return NextResponse.json({ error: "Wiki page not found." }, { status: 404 })
  }

  const assetId = crypto.randomUUID()
  const fileName = sanitizeWikiFileName(file.name)
  const storagePath = `${nodeId}/${assetId}/${fileName}`
  const mimeType = file.type || "application/octet-stream"

  const adminSupabase = createSupabaseAdminClient()
  const { error: uploadError } = await adminSupabase.storage
    .from(WIKI_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  let extractedText = ""
  if (kind === "document") {
    try {
      extractedText = await extractWikiDocumentText(file)
    } catch (error) {
      extractedText = ""
      console.error("Wiki document extraction failed", error)
    }
  }

  const title = typeof titleValue === "string" ? titleValue.trim() : ""
  const description =
    typeof descriptionValue === "string" ? descriptionValue.trim() : ""
  const altText = typeof altTextValue === "string" ? altTextValue.trim() : ""

  const { data: asset, error: assetError } = await supabase
    .from("wiki_assets")
    .insert({
      id: assetId,
      node_id: nodeId,
      storage_bucket: WIKI_BUCKET,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: file.size,
      kind,
      title: title || null,
      description: description || null,
      alt_text: altText || null,
      extracted_text: extractedText || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .single()

  if (assetError) {
    await adminSupabase.storage.from(WIKI_BUCKET).remove([storagePath])
    return NextResponse.json({ error: assetError.message }, { status: 400 })
  }

  const nodes = await fetchWikiNodes(supabase)
  const pageNode = nodes.find((item) => item.id === nodeId) ?? node
  const pagePath = buildWikiPath(nodes, pageNode)
  await indexWikiAsset({
    supabase,
    asset: asset as WikiAssetRow,
    pageTitle: pageNode.title,
    pagePath,
  })

  return NextResponse.json({
    ok: true,
    asset,
    url: `/api/wiki/assets/${assetId}`,
  })
}
