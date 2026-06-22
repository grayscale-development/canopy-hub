import { NextResponse } from "next/server"

import {
  buildNewsletterFileName,
  NEWSLETTER_BUCKET,
  NEWSLETTER_MAX_UPLOAD_SIZE_BYTES,
  NEWSLETTER_MAX_UPLOAD_SIZE_LABEL,
  NEWSLETTER_MONTHS,
  type NewsletterMonth,
} from "@/lib/newsletters"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function isNewsletterMonth(value: string): value is NewsletterMonth {
  return NEWSLETTER_MONTHS.includes(value as NewsletterMonth)
}

interface NewsletterUploadRequest {
  fileName?: unknown
  fileSize?: unknown
  fileType?: unknown
  month?: unknown
  year?: unknown
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canUpload = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "newsletters.upload",
  })

  if (!canUpload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let payload: NewsletterUploadRequest
  try {
    payload = (await request.json()) as NewsletterUploadRequest
  } catch {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 }
    )
  }

  const fileName =
    typeof payload.fileName === "string" ? payload.fileName.trim() : ""
  const fileType = typeof payload.fileType === "string" ? payload.fileType : ""
  const fileSize =
    typeof payload.fileSize === "number" ? payload.fileSize : Number.NaN
  const monthValue = typeof payload.month === "string" ? payload.month : ""
  const yearValue = typeof payload.year === "string" ? payload.year : ""

  if (!fileName) {
    return NextResponse.json({ error: "File is required." }, { status: 400 })
  }

  const isPdfName = fileName.toLowerCase().endsWith(".pdf")
  const isPdfMime = fileType === "application/pdf" || fileType === ""
  if (!isPdfName || !isPdfMime) {
    return NextResponse.json(
      { error: "Only PDF files are allowed." },
      { status: 400 }
    )
  }

  if (
    !Number.isFinite(fileSize) ||
    fileSize <= 0 ||
    fileSize > NEWSLETTER_MAX_UPLOAD_SIZE_BYTES
  ) {
    return NextResponse.json(
      {
        error: `PDF files must be ${NEWSLETTER_MAX_UPLOAD_SIZE_LABEL} or smaller.`,
      },
      { status: 400 }
    )
  }

  if (typeof monthValue !== "string" || !isNewsletterMonth(monthValue)) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 })
  }

  if (!yearValue) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 })
  }

  const year = Number.parseInt(yearValue, 10)
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 })
  }

  const targetFileName = buildNewsletterFileName(monthValue, year)
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

  const { data, error } = await adminSupabase.storage
    .from(NEWSLETTER_BUCKET)
    .createSignedUploadUrl(targetFileName, { upsert: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    fileName: targetFileName,
    path: data.path,
    token: data.token,
  })
}
