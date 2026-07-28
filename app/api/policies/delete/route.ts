import { NextResponse } from "next/server"

import { POLICIES_BUCKET, POLICIES_MANAGE_PERMISSION } from "@/lib/policies"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { archiveKnowledgeSource } from "@/lib/wiki-ai"

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
  const fileName = String(formData.get("file_name") ?? "").trim()

  if (!fileName) {
    return NextResponse.json(
      { error: "Select a document first." },
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
      .find((candidate) => candidate.trim() === fileName) ??
    (files ?? [])
      .map((file) => file.name)
      .find(
        (candidate) => candidate.trim().toLowerCase() === fileName.toLowerCase()
      ) ??
    ""

  if (!sourceFileName) {
    return NextResponse.json(
      { error: "Document file could not be found. Refresh and try again." },
      { status: 404 }
    )
  }

  const { error } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .remove([sourceFileName])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  try {
    await archiveKnowledgeSource({
      supabase: adminSupabase,
      sourceType: "document",
      sourceId: sourceFileName,
    })
  } catch (indexError) {
    console.error("Document knowledge archive failed", indexError)
  }

  return NextResponse.json({ ok: true })
}
