import { NextResponse } from "next/server"

import {
  ADVANCED_SETTINGS_ACCESS_PERMISSION,
  SETTINGS_ACCESS_PERMISSION,
} from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

interface SourceConfigRow {
  id: string
  source_key: string
  target_table: string
  is_enabled: boolean
}

interface SyncRunRow {
  id: string
  source_config_id: string | null
  source_key: string
  started_at: string
  completed_at: string | null
  status: "running" | "success" | "failed" | "partial"
  row_count: number | null
  inserted_count: number
  updated_count: number
  skipped_count: number
  error_message: string | null
  response_metadata: Record<string, unknown> | null
}

function getNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canViewSettings, canAccessAdvancedSettings] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: SETTINGS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    }),
  ])

  if (!canViewSettings || !canAccessAdvancedSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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

  const rawAdminSupabase = adminSupabase.schema("raw")

  const [{ data: sources, error: sourcesError }, { data: runs, error: runsError }] =
    await Promise.all([
      adminSupabase
        .from("source_configs")
        .select("id,source_key,target_table,is_enabled")
        .order("source_key", { ascending: true }),
      rawAdminSupabase
        .from("sync_runs")
        .select(
          [
            "id",
            "source_config_id",
            "source_key",
            "started_at",
            "completed_at",
            "status",
            "row_count",
            "inserted_count",
            "updated_count",
            "skipped_count",
            "error_message",
            "response_metadata",
          ].join(",")
        )
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(100),
    ])

  if (sourcesError) {
    return NextResponse.json({ error: sourcesError.message }, { status: 500 })
  }

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 })
  }

  const latestRunBySourceConfigId = new Map<string, SyncRunRow>()
  for (const run of ((runs ?? []) as unknown) as SyncRunRow[]) {
    const sourceConfigId = run.source_config_id
    if (!sourceConfigId || latestRunBySourceConfigId.has(sourceConfigId)) {
      continue
    }
    latestRunBySourceConfigId.set(sourceConfigId, run)
  }

  const sourceStatuses = ((sources ?? []) as SourceConfigRow[]).map((source) => {
    const latestRun = latestRunBySourceConfigId.get(source.id) ?? null
    const responseMetadata = latestRun?.response_metadata ?? {}
    const totalRows = getNumber(responseMetadata.totalRows)
    const fetchedRows = getNumber(responseMetadata.fetchedRows)
    const startAt = getNumber(responseMetadata.startAt)
    const nextStartAt = getNumber(responseMetadata.nextStartAt)
    const rowCount = latestRun?.row_count ?? null
    const progressPercent =
      totalRows && rowCount !== null
        ? Math.max(0, Math.min(100, Math.round((rowCount / totalRows) * 100)))
        : null

    return {
      sourceConfigId: source.id,
      sourceKey: source.source_key,
      targetTable: source.target_table,
      isEnabled: source.is_enabled,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            startedAt: latestRun.started_at,
            completedAt: latestRun.completed_at,
            rowCount,
            insertedCount: latestRun.inserted_count,
            updatedCount: latestRun.updated_count,
            skippedCount: latestRun.skipped_count,
            errorMessage: latestRun.error_message,
            totalRows,
            fetchedRows,
            startAt,
            nextStartAt,
            hasMore: responseMetadata.hasMore === true,
            progressPercent,
          }
        : null,
    }
  })

  return NextResponse.json({
    sources: sourceStatuses,
    generatedAt: new Date().toISOString(),
  })
}
