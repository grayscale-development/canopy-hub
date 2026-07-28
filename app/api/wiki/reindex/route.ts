import { NextResponse } from "next/server"

import { NEWSLETTER_BUCKET, parseNewsletterFileName } from "@/lib/newsletters"
import { userHasPermissionCode } from "@/lib/permissions"
import { POLICIES_BUCKET, stripPolicyFileExtension } from "@/lib/policies"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { extractWikiDocumentText } from "@/lib/wiki-extract"
import { indexCuratedSiteKnowledge, indexKnowledgeSource } from "@/lib/wiki-ai"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"

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

  const canManageWiki = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: WIKI_MANAGE_PERMISSION,
  })

  if (!canManageWiki) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const curatedIndexedCount = await indexCuratedSiteKnowledge(supabase)

  const adminSupabase = createSupabaseAdminClient()
  const [{ data: newsletterFiles }, { data: policyFiles }] = await Promise.all([
    adminSupabase.storage.from(NEWSLETTER_BUCKET).list("", { limit: 1000 }),
    adminSupabase.storage.from(POLICIES_BUCKET).list("", { limit: 1000 }),
  ])

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

    await indexKnowledgeSource(supabase, {
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

  for (const file of policyFiles ?? []) {
    if (!file.name?.trim()) {
      continue
    }

    const title = stripPolicyFileExtension(file.name)
    const lowerName = file.name.toLowerCase()
    const contentType = lowerName.endsWith(".pdf")
      ? "application/pdf"
      : lowerName.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : lowerName.endsWith(".txt") || lowerName.endsWith(".md")
          ? "text/plain"
          : "application/octet-stream"

    const text = await extractStorageFileText({
      bucket: POLICIES_BUCKET,
      fileName: file.name,
      contentType,
    })

    await indexKnowledgeSource(supabase, {
      sourceType: "document",
      sourceId: file.name,
      title,
      url: `/policies/open?file=${encodeURIComponent(file.name)}`,
      content:
        text || `${title} shared document. Content extraction unavailable.`,
      metadata: {
        fileName: file.name,
        contentType,
      },
    })
    indexedCount += 1
  }

  return NextResponse.json({
    ok: true,
    indexedCount: indexedCount + curatedIndexedCount,
    curatedIndexedCount,
    fileIndexedCount: indexedCount,
  })
}
