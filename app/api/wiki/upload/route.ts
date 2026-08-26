import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  extractWikiDocumentText,
  extractWikiVideoText,
} from "@/lib/wiki-extract"
import { indexWikiAsset } from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchWikiNodes,
  getWikiAssetKind,
  isPublishedWikiBranch,
  sanitizeWikiFileName,
  validateWikiUpload,
  WIKI_BUCKET,
  WIKI_MAX_UPLOAD_SIZE_BYTES,
  WIKI_MAX_UPLOAD_SIZE_LABEL,
  WIKI_MANAGE_PERMISSION,
  type WikiAssetRow,
} from "@/lib/wiki"

export const runtime = "nodejs"
export const maxDuration = 300

interface DirectWikiUploadRequest {
  directUpload?: unknown
  nodeId?: unknown
  fileName?: unknown
  fileSize?: unknown
  fileType?: unknown
  title?: unknown
  description?: unknown
  altText?: unknown
}

function getMetadataAssetKind(fileName: string, fileType: string) {
  return getWikiAssetKind(new File(["x"], fileName, { type: fileType }))
}

export async function POST(request: Request) {
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

  if (request.headers.get("content-type")?.includes("application/json")) {
    let payload: DirectWikiUploadRequest
    try {
      payload = (await request.json()) as DirectWikiUploadRequest
    } catch {
      return NextResponse.json(
        { error: "Invalid upload request." },
        { status: 400 }
      )
    }

    if (payload.directUpload !== true) {
      return NextResponse.json(
        { error: "Invalid upload request." },
        { status: 400 }
      )
    }

    const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : ""
    const fileNameValue =
      typeof payload.fileName === "string" ? payload.fileName.trim() : ""
    const fileType =
      typeof payload.fileType === "string" ? payload.fileType : ""
    const fileSize =
      typeof payload.fileSize === "number" ? payload.fileSize : Number.NaN

    if (!nodeId.trim()) {
      return NextResponse.json(
        { error: "Page ID is required." },
        { status: 400 }
      )
    }

    if (!fileNameValue) {
      return NextResponse.json({ error: "File is required." }, { status: 400 })
    }

    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > WIKI_MAX_UPLOAD_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          error: `Files must be ${WIKI_MAX_UPLOAD_SIZE_LABEL} or smaller.`,
        },
        { status: 400 }
      )
    }

    const kind = getMetadataAssetKind(fileNameValue, fileType)
    if (kind !== "video") {
      return NextResponse.json(
        { error: "Direct Wiki uploads are only supported for videos." },
        { status: 400 }
      )
    }

    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select(
        "id,parent_id,type,slug,title,status,sort_order,is_pinned,current_revision_id,created_by,updated_by,created_at,updated_at"
      )
      .eq("id", nodeId.trim())
      .eq("type", "page")
      .maybeSingle()

    if (nodeError) {
      return NextResponse.json({ error: nodeError.message }, { status: 400 })
    }

    if (!node) {
      return NextResponse.json(
        { error: "Wiki page not found." },
        { status: 404 }
      )
    }

    const adminSupabase = createSupabaseAdminClient()
    const assetId = crypto.randomUUID()
    const fileName = sanitizeWikiFileName(fileNameValue)
    const storagePath = `${nodeId.trim()}/${assetId}/${fileName}`
    const mimeType = fileType || "application/octet-stream"
    const title = typeof payload.title === "string" ? payload.title.trim() : ""
    const description =
      typeof payload.description === "string" ? payload.description.trim() : ""
    const altText =
      typeof payload.altText === "string" ? payload.altText.trim() : ""

    const { data: signedUpload, error: signedUploadError } =
      await adminSupabase.storage
        .from(WIKI_BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false })

    if (signedUploadError || !signedUpload?.token) {
      return NextResponse.json(
        { error: signedUploadError?.message ?? "Unable to prepare upload." },
        { status: 400 }
      )
    }

    const { data: asset, error: assetError } = await supabase
      .from("wiki_assets")
      .insert({
        id: assetId,
        node_id: nodeId.trim(),
        storage_bucket: WIKI_BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: fileSize,
        kind,
        title: title || null,
        description: description || null,
        alt_text: altText || null,
        extracted_text: null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
      )
      .single()

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      asset,
      url: `/api/wiki/assets/${assetId}`,
      path: signedUpload.path,
      token: signedUpload.token,
    })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  const nodeIdValue = formData.get("node_id")
  const titleValue = formData.get("title")
  const descriptionValue = formData.get("description")
  const altTextValue = formData.get("alt_text")
  const deferVideoProcessing = formData.get("defer_video_processing") === "1"

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
      "id,parent_id,type,slug,title,status,sort_order,is_pinned,current_revision_id,created_by,updated_by,created_at,updated_at"
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
  } else if (kind === "video" && !deferVideoProcessing) {
    try {
      extractedText = await extractWikiVideoText(file)
    } catch (error) {
      await adminSupabase.storage.from(WIKI_BUCKET).remove([storagePath])
      const message =
        error instanceof Error ? error.message : "Unable to transcribe video."
      return NextResponse.json({ error: message }, { status: 400 })
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

  if (!(kind === "video" && deferVideoProcessing)) {
    const nodes = await fetchWikiNodes(supabase)
    const pageNode = nodes.find((item) => item.id === nodeId) ?? node
    const pagePath = buildWikiPath(nodes, pageNode)
    await indexWikiAsset({
      supabase,
      asset: asset as WikiAssetRow,
      pageTitle: pageNode.title,
      pagePath,
      isPagePublished: isPublishedWikiBranch(nodes, pageNode),
    })
  }

  return NextResponse.json({
    ok: true,
    asset,
    url: `/api/wiki/assets/${assetId}`,
    extractedText,
  })
}
