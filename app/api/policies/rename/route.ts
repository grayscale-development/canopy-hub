import { NextResponse } from "next/server"

import {
  buildPolicyFileName,
  getPolicyFileExtension,
  POLICIES_BUCKET,
  POLICIES_MANAGE_PERMISSION,
  sanitizePolicyDisplayName,
  stripPolicyFileExtension,
} from "@/lib/policies"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { archiveKnowledgeSource, indexKnowledgeSource } from "@/lib/wiki-ai"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  let adminSupabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    adminSupabase = createSupabaseAdminClient()
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Missing admin Supabase configuration.",
      },
      { status: 500 }
    )
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManage = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: POLICIES_MANAGE_PERMISSION,
  })

  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await request.formData()
  const oldFileName = String(formData.get("old_file_name") ?? "").trim()
  const newDisplayNameRaw = String(formData.get("new_display_name") ?? "")
  const newDisplayName = sanitizePolicyDisplayName(newDisplayNameRaw)

  if (!oldFileName) {
    return NextResponse.json(
      { error: "Select a policy first." },
      { status: 400 }
    )
  }
  if (!newDisplayName) {
    return NextResponse.json(
      { error: "New name is required." },
      { status: 400 }
    )
  }

  const { data: files, error: listError } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .list("", { limit: 1000 })
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 })
  }

  const sourceFileName =
    (files ?? [])
      .map((file) => file.name)
      .find((fileName) => fileName.trim() === oldFileName) ??
    (files ?? [])
      .map((file) => file.name)
      .find(
        (fileName) =>
          fileName.trim().toLowerCase() === oldFileName.toLowerCase()
      ) ??
    ""

  if (!sourceFileName) {
    return NextResponse.json(
      { error: "Policy file could not be found. Refresh and try again." },
      { status: 404 }
    )
  }

  const extension = getPolicyFileExtension(sourceFileName)
  const newFileName = buildPolicyFileName({
    displayName: newDisplayName,
    extension,
  })

  const normalizedOldDisplayName =
    stripPolicyFileExtension(sourceFileName).toLowerCase()
  if (normalizedOldDisplayName === newDisplayName.toLowerCase()) {
    return NextResponse.json({ ok: true, fileName: sourceFileName })
  }

  async function updateKnowledgeIndex() {
    try {
      await archiveKnowledgeSource({
        supabase: adminSupabase,
        sourceType: "document",
        sourceId: sourceFileName,
      })
      await indexKnowledgeSource(adminSupabase, {
        sourceType: "document",
        sourceId: newFileName,
        title: stripPolicyFileExtension(newFileName),
        url: `/policies/open?file=${encodeURIComponent(newFileName)}`,
        content: `${stripPolicyFileExtension(newFileName)} shared document. Full text will be refreshed by the knowledge reindex job.`,
        metadata: {
          fileName: newFileName,
          renamedFrom: sourceFileName,
        },
      })
    } catch (indexError) {
      console.error("Document knowledge rename failed", indexError)
    }
  }

  const { error } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .move(sourceFileName, newFileName)

  if (!error) {
    await updateKnowledgeIndex()
    return NextResponse.json({ ok: true, fileName: newFileName })
  }

  const shouldTryCopyFallback = /not found/i.test(error.message)
  if (!shouldTryCopyFallback) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { error: copyError } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .copy(sourceFileName, newFileName)
  if (copyError) {
    return NextResponse.json({ error: copyError.message }, { status: 400 })
  }

  const { error: removeError } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .remove([sourceFileName])
  if (removeError) {
    return NextResponse.json(
      {
        error: `Policy copied to "${newFileName}" but original could not be removed: ${removeError.message}`,
      },
      { status: 400 }
    )
  }

  await updateKnowledgeIndex()
  return NextResponse.json({ ok: true, fileName: newFileName })
}
