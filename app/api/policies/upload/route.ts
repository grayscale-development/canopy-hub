import { NextResponse } from "next/server"

import {
  buildEmployeeHandbookPolicyFileName,
  isEmployeeHandbookPolicyFile,
  POLICIES_BUCKET,
  POLICIES_MANAGE_PERMISSION,
  stripPolicyFileExtension,
} from "@/lib/policies"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { indexKnowledgeSource } from "@/lib/wiki-ai"
import { extractWikiDocumentText } from "@/lib/wiki-extract"

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
  const file = formData.get("file")
  const isHandbookValue = formData.get("is_handbook")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 })
  }

  const isHandbook =
    typeof isHandbookValue === "string" &&
    (isHandbookValue === "true" || isHandbookValue === "on")

  const handbookYearValue = formData.get("handbook_year")
  const handbookYear =
    typeof handbookYearValue === "string"
      ? Number.parseInt(handbookYearValue, 10)
      : Number.NaN

  if (isHandbook) {
    const isPdfName = file.name.toLowerCase().endsWith(".pdf")
    const isPdfMime = file.type === "application/pdf" || file.type === ""
    if (!isPdfName || !isPdfMime) {
      return NextResponse.json(
        { error: "Employee Handbook uploads must be PDF files." },
        { status: 400 }
      )
    }

    if (
      !Number.isFinite(handbookYear) ||
      handbookYear < 2000 ||
      handbookYear > 2100
    ) {
      return NextResponse.json(
        { error: "Invalid handbook year." },
        { status: 400 }
      )
    }
  }

  const targetFileName = isHandbook
    ? buildEmployeeHandbookPolicyFileName(handbookYear)
    : file.name.trim()

  if (!targetFileName) {
    return NextResponse.json(
      { error: "Invalid target file name." },
      { status: 400 }
    )
  }

  if (isHandbook) {
    const { data: files, error: listError } = await adminSupabase.storage
      .from(POLICIES_BUCKET)
      .list("", { limit: 1000 })
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 })
    }

    const oldHandbooks = (files ?? [])
      .map((entry) => entry.name)
      .filter(
        (name) => isEmployeeHandbookPolicyFile(name) && name !== targetFileName
      )

    if (oldHandbooks.length > 0) {
      const { error: removeError } = await adminSupabase.storage
        .from(POLICIES_BUCKET)
        .remove(oldHandbooks)
      if (removeError) {
        return NextResponse.json(
          { error: removeError.message },
          { status: 400 }
        )
      }
    }
  }

  const { error } = await adminSupabase.storage
    .from(POLICIES_BUCKET)
    .upload(targetFileName, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  let extractedText = ""
  try {
    extractedText = await extractWikiDocumentText(file)
  } catch {
    extractedText = ""
  }

  const title = stripPolicyFileExtension(targetFileName)
  try {
    await indexKnowledgeSource(adminSupabase, {
      sourceType: "document",
      sourceId: targetFileName,
      title,
      url: `/policies/open?file=${encodeURIComponent(targetFileName)}`,
      content:
        extractedText ||
        `${title} shared document. Content extraction unavailable.`,
      metadata: {
        fileName: targetFileName,
        contentType: file.type || "application/octet-stream",
      },
    })
  } catch (indexError) {
    console.error("Document knowledge indexing failed", indexError)
  }

  return NextResponse.json({ ok: true, fileName: targetFileName })
}
