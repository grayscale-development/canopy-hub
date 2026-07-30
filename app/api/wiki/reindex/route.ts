import { NextResponse } from "next/server"

import { NEWSLETTER_BUCKET, parseNewsletterFileName } from "@/lib/newsletters"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { extractWikiDocumentText } from "@/lib/wiki-extract"
import {
  indexCuratedSiteKnowledge,
  indexKnowledgeSource,
  indexWikiAsset,
  indexWikiPage,
} from "@/lib/wiki-ai"
import {
  buildWikiPath,
  fetchCurrentRevision,
  isPublishedWikiBranch,
  WIKI_MANAGE_PERMISSION,
  type SupabaseWikiClient,
  type WikiAssetRow,
  type WikiNodeRow,
} from "@/lib/wiki"

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

async function fetchWikiNodesForIndex(supabase: SupabaseWikiClient) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select(
      "id,parent_id,type,slug,title,status,sort_order,current_revision_id,created_by,updated_by,created_at,updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WikiNodeRow[]
}

async function indexWikiKnowledge(supabase: SupabaseWikiClient) {
  const nodes = await fetchWikiNodesForIndex(supabase)
  const pageNodes = nodes.filter((node) => node.type === "page")
  let indexedCount = 0

  for (const node of pageNodes) {
    const path = buildWikiPath(nodes, node)
    const revision = await fetchCurrentRevision(supabase, node)
    const isPagePublished = isPublishedWikiBranch(nodes, node)

    await indexWikiPage({
      supabase,
      node,
      revision,
      path,
      isPublished: isPagePublished,
    })
    indexedCount += isPagePublished ? 1 : 0
  }

  if (!pageNodes.length) {
    return indexedCount
  }

  const { data: assets, error } = await supabase
    .from("wiki_assets")
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .in(
      "node_id",
      pageNodes.map((node) => node.id)
    )

  if (error) {
    throw new Error(error.message)
  }

  const pagesById = new Map(pageNodes.map((node) => [node.id, node]))
  for (const asset of (assets ?? []) as WikiAssetRow[]) {
    const pageNode = pagesById.get(asset.node_id)
    if (!pageNode) {
      continue
    }

    const isPagePublished = isPublishedWikiBranch(nodes, pageNode)
    await indexWikiAsset({
      supabase,
      asset,
      pageTitle: pageNode.title,
      pagePath: buildWikiPath(nodes, pageNode),
      isPagePublished,
    })
    indexedCount += asset.status === "active" && isPagePublished ? 1 : 0
  }

  return indexedCount
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

  const curatedIndexedCount = await indexCuratedSiteKnowledge(supabase)
  const wikiIndexedCount = await indexWikiKnowledge(supabase)

  const adminSupabase = createSupabaseAdminClient()
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

  return NextResponse.json({
    ok: true,
    indexedCount: indexedCount + curatedIndexedCount + wikiIndexedCount,
    curatedIndexedCount,
    wikiIndexedCount,
    fileIndexedCount: indexedCount,
  })
}
