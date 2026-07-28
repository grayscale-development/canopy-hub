import { NextResponse } from "next/server"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

interface KnowledgeSourceRow {
  source_type: string
  last_indexed_at: string | null
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canViewSettings, canEditPermissions] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: "settings.access",
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: "permissions.edit",
    }),
  ])

  if (!canViewSettings || !canEditPermissions) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("source_type,last_indexed_at")
    .order("source_type", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const bySourceType = new Map<
    string,
    { sourceType: string; sourceCount: number; lastIndexedAt: string | null }
  >()

  for (const row of (data ?? []) as KnowledgeSourceRow[]) {
    const current = bySourceType.get(row.source_type) ?? {
      sourceType: row.source_type,
      sourceCount: 0,
      lastIndexedAt: null,
    }

    current.sourceCount += 1
    if (
      row.last_indexed_at &&
      (!current.lastIndexedAt ||
        new Date(row.last_indexed_at).getTime() >
          new Date(current.lastIndexedAt).getTime())
    ) {
      current.lastIndexedAt = row.last_indexed_at
    }

    bySourceType.set(row.source_type, current)
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sources: [...bySourceType.values()].sort((left, right) =>
      left.sourceType.localeCompare(right.sourceType)
    ),
  })
}
