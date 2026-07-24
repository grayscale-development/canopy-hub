import { redirect } from "next/navigation"

import { FileQualityReport } from "@/components/file-quality/file-quality-report"
import {
  fetchFileQualityRollupsForMonth,
  getFileQualityMonthOptions,
} from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function getMonthParam(
  searchParams?: Record<string, string | string[] | undefined>
) {
  const raw = searchParams?.month
  if (Array.isArray(raw)) {
    return raw[0] ?? null
  }

  return raw ?? null
}

export const metadata = {
  title: "File Quality",
}

export default async function FileQualityViewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const resolvedSearchParams = (await searchParams) ?? {}
  const monthOptions = getFileQualityMonthOptions()
  const fallbackMonth = monthOptions[monthOptions.length - 1] ?? null
  if (!fallbackMonth) {
    throw new Error("Month options are unavailable.")
  }

  const requestedMonthKey = getMonthParam(resolvedSearchParams)
  const selectedMonth =
    monthOptions.find((month) => month.monthKey === requestedMonthKey) ??
    fallbackMonth

  let loadError: string | null = null
  let rollups: Awaited<
    ReturnType<typeof fetchFileQualityRollupsForMonth>
  > | null = null

  try {
    rollups = await fetchFileQualityRollupsForMonth({
      monthKey: selectedMonth.monthKey,
    })
  } catch {
    loadError = "Data load failed."
  }

  if (loadError || !rollups) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        {loadError ?? "Data load failed."}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1900px]">
        <FileQualityReport
          monthOptions={monthOptions}
          selectedMonth={selectedMonth}
          divisionRows={rollups.divisionRows}
          branchRows={rollups.branchRows}
          hasExpectedTouches={rollups.hasExpectedTouches}
          hasNetTouches={rollups.hasNetTouches}
          hasExpectedAndNetMetrics={rollups.hasExpectedAndNetMetrics}
          className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 md:px-6"
        />
      </div>
    </main>
  )
}
