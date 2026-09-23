import { type NextRequest, NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

interface WikiTagRow {
  id: string
  name: string
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

  const knowledgeResults = [...bySource.values()].slice(0, 8).map((row) => ({
    id: row.source_id,
    title: row.source_title || "Untitled",
    url: row.source_url || "/home",
    type: row.source_type,
    typeLabel: formatSourceType(row.source_type),
    snippet: compactSnippet(row.content),
  }))

  const { data: tagData } = canAccessBeta1
    ? await supabase
        .from("wiki_tags")
        .select("id,name")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(5)
    : { data: [] }

  const tagResults = ((tagData ?? []) as WikiTagRow[]).map((tag) => ({
    id: `wiki-tag-${tag.id}`,
    title: tag.name,
    url: `/wiki/tags?tag=${encodeURIComponent(tag.name)}#tag-${tag.name
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`,
    type: "wiki_tag",
    typeLabel: "Tag",
    snippet: "Browse Wiki pages with this tag.",
  }))

  return NextResponse.json({
    results: [...tagResults, ...knowledgeResults].slice(0, 8),
  })
}
