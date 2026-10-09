import { NextResponse } from "next/server"

import { NEWSLETTER_BUCKET, parseNewsletterFileName } from "@/lib/newsletters"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { extractWikiDocumentText } from "@/lib/wiki-extract"
import { indexCuratedSiteKnowledge, indexKnowledgeSource } from "@/lib/wiki-ai"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"
import { indexWikiKnowledge } from "@/lib/wiki-index"

export const runtime = "nodejs"

async function extractStorageFileText({
  bucket,
  fileName,
  contentType,
}: {
  bucket: string
  fileName: string
  contentType: string
}) {
  const adminSupabase = createSupabaseAdminClient()
  const { data, error } = await adminSupabase.storage
    .from(bucket)
    .download(fileName)

  if (error || !data) {
    return ""
  }

  const file = new File([data], fileName, {
    type: contentType || data.type || "application/octet-stream",
  })

  try {
    return await extractWikiDocumentText(file)
  } catch {
    return ""
  }
}

export async function POST() {
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

  const adminSupabase = createSupabaseAdminClient()
  const curatedIndexedCount = await indexCuratedSiteKnowledge(adminSupabase)
  const wikiIndexedCount = await indexWikiKnowledge(adminSupabase)
  const { data: newsletterFiles } = await adminSupabase.storage
    .from(NEWSLETTER_BUCKET)
    .list("", { limit: 1000 })

  let indexedCount = 0

  for (const file of newsletterFiles ?? []) {
    const parsed = parseNewsletterFileName(file.name)
    if (!parsed) {
      continue
    }

    const text = await extractStorageFileText({
      bucket: NEWSLETTER_BUCKET,
      fileName: parsed.fileName,
      contentType: "application/pdf",
    })

    await indexKnowledgeSource(adminSupabase, {
      sourceType: "newsletter",
      sourceId: parsed.fileName,
      title: parsed.label,
      url: `/newsletters/open?file=${encodeURIComponent(parsed.fileName)}`,
      content:
        text ||
        `${parsed.label} company newsletter PDF. Content extraction unavailable.`,
      metadata: {
        fileName: parsed.fileName,
        month: parsed.month,
        year: parsed.year,
      },
    })
    indexedCount += 1
  }

  return NextResponse.json({
    ok: true,
    indexedCount: indexedCount + curatedIndexedCount + wikiIndexedCount,
    curatedIndexedCount,
    wikiIndexedCount,
    fileIndexedCount: indexedCount,
  })
}
