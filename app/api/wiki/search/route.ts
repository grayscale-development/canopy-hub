import { type NextRequest, NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { wikiTagDirectoryUrl, type WikiTagRow } from "@/lib/wiki"
import { resolveWikiKnowledgeRows } from "@/lib/wiki-knowledge-urls"
import { matchSemanticWikiTags } from "@/lib/wiki-tag-embeddings"
import { rankWikiTags } from "@/lib/wiki-tag-similarity"

export const runtime = "nodejs"

const WIKI_SEARCH_SOURCE_TYPES = [
  "newsletter",
  "report",
  "support",
  "site",
  "employee",
  "branch",
]

const BETA_SEARCH_SOURCE_TYPES = ["wiki_page", "wiki_asset"]

interface KnowledgeSearchRow {
  chunk_id: string
  source_id: string
  source_type: string
  source_title: string
  source_url: string | null
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

function compactSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 260)
}

function formatSourceType(value: string) {
  switch (value) {
    case "wiki_page":
      return "Wiki"
    case "wiki_asset":
      return "Asset"
    case "newsletter":
      return "Newsletter"
    case "report":
      return "Report"
    case "support":
      return "Support"
    case "site":
      return "Hub"
    case "employee":
      return "Person"
    case "branch":
      return "Branch"
    default:
      return "Knowledge"
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""

  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  const { data, error } = await supabase.rpc("match_knowledge_chunks_keyword", {
    search_query: query,
    match_count: 12,
    source_types: canAccessBeta1
      ? [...WIKI_SEARCH_SOURCE_TYPES, ...BETA_SEARCH_SOURCE_TYPES]
      : WIKI_SEARCH_SOURCE_TYPES,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as KnowledgeSearchRow[]
  const bySource = new Map<string, KnowledgeSearchRow>()

  for (const row of rows) {
    if (
      !canAccessBeta1 &&
      (row.source_url?.startsWith("/wiki") || row.source_id === "wiki")
    ) {
      continue
    }

    const existing = bySource.get(row.source_id)
    if (!existing || row.similarity > existing.similarity) {
      bySource.set(row.source_id, row)
    }
  }

  const selectedRows = await resolveWikiKnowledgeRows(supabase, [
    ...bySource.values(),
  ])
  const knowledgeResults = selectedRows.slice(0, 8).map((row) => ({
    id: row.source_id,
    title: row.source_title || "Untitled",
    url: row.source_url || "/home",
    type: row.source_type,
    typeLabel: formatSourceType(row.source_type),
    snippet: compactSnippet(row.content),
  }))

  const candidates: WikiTagRow[] = []
  let semantic: WikiTagRow[] = []
  if (canAccessBeta1) {
    const semanticPromise = matchSemanticWikiTags(supabase, query)
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: tagError } = await supabase
        .from("wiki_tags")
        .select("id,name,scope,section_id")
        .order("id")
        .range(offset, offset + pageSize - 1)
      if (tagError) break
      candidates.push(...((page ?? []) as WikiTagRow[]))
      if (!page || page.length < pageSize) break
    }
    semantic = await semanticPromise
  }
  const sectionIds = [
    ...new Set(
      candidates.flatMap((tag) => (tag.section_id ? [tag.section_id] : []))
    ),
  ]
  const { data: sections, error: sectionError } = sectionIds.length
    ? await supabase
        .from("milo_wiki_nodes")
        .select("id,title")
        .in("id", sectionIds)
    : { data: [], error: null }
  if (sectionError)
    return NextResponse.json({ error: sectionError.message }, { status: 500 })
  const sectionNames = new Map(
    (sections ?? []).map((section) => [section.id, section.title])
  )
  const visible = candidates.filter(
    (tag) =>
      tag.scope === "global" ||
      (tag.section_id && sectionNames.has(tag.section_id))
  )
  const semanticCandidates = semantic.flatMap((tag) => {
    const candidate = visible.find((item) => item.id === tag.id)
    return candidate ? [candidate] : []
  })
  const tagResults = rankWikiTags(query, visible, semanticCandidates)
    .slice(0, 5)
    .map(({ tag, reason }) => ({
      id: `wiki-tag-${tag.id}`,
      title: tag.name,
      url: wikiTagDirectoryUrl(tag),
      type: "wiki_tag",
      typeLabel: "Tag",
      snippet: [
        tag.scope === "global" ? "Global" : sectionNames.get(tag.section_id!),
        reason,
      ]
        .filter(Boolean)
        .join(" · "),
    }))

  return NextResponse.json({
    results: [...tagResults, ...knowledgeResults].slice(0, 8),
  })
}
