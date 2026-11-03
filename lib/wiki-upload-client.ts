"use client"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { WIKI_BUCKET } from "@/lib/wiki"

export type WikiAssetAction = "extract" | "transcribe" | "index"

type WikiUploadResponse = {
  ok?: boolean
  url?: string
  path?: string
  token?: string
  extractedText?: string
  asset?: {
    id?: string
    kind?: string
  }
  error?: string
}

export type DirectWikiUploadPayload = WikiUploadResponse & {
  url: string
  path: string
  token: string
  asset: {
    id: string
    kind?: string
  }
}

async function jsonResponse(response: Response) {
  return (await response.json().catch(() => null)) as WikiUploadResponse | null
}

export async function prepareDirectWikiUpload({
  file,
  nodeId,
}: {
  file: File
  nodeId: string
}): Promise<DirectWikiUploadPayload> {
  const response = await fetch("/api/wiki/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUpload: true,
      nodeId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }),
  })
  const payload = await jsonResponse(response)

  if (
    !response.ok ||
    !payload?.url ||
    !payload.path ||
    !payload.token ||
    !payload.asset?.id
  ) {
    throw new Error(payload?.error ?? "Upload failed.")
  }

  return payload as DirectWikiUploadPayload
}

export async function archiveWikiAsset(assetId: string) {
  await fetch(`/api/wiki/assets/${assetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "archived" }),
  }).catch(() => null)
}

export async function uploadWikiFileToStorage({
  file,
  upload,
}: {
  file: File
  upload: DirectWikiUploadPayload
}) {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.storage
    .from(WIKI_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "application/octet-stream",
    })

  if (error) {
    await archiveWikiAsset(upload.asset.id)
    throw new Error(error.message)
  }
}

export async function postWikiAssetAction(
  assetId: string,
  action: WikiAssetAction
) {
  const response = await fetch(`/api/wiki/assets/${assetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  })
  const payload = await jsonResponse(response)

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Asset processing failed.")
  }

  return payload
}
