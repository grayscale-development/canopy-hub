import { redirect } from "next/navigation"

import { SpecialistsPointsReport } from "@/components/points-specialists/specialists-points-report"
import { fetchPointsSpecialistsSummary } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Specialists Points",
}

function parseSelectedOrgIds(
  searchParams?: Record<string, string | string[] | undefined>
) {
  const rawValue = searchParams?.pa_org
  const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []
  const uniqueValues = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ]
  if (uniqueValues.length !== 1) {
    return []
  }
  return uniqueValues
}

export default async function SpecialistsPointsViewPage({
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
  const selectedOrgIds = parseSelectedOrgIds(resolvedSearchParams)

  let loadError: string | null = null
  let summary: Awaited<
    ReturnType<typeof fetchPointsSpecialistsSummary>
  > | null = null

  try {
    summary = await fetchPointsSpecialistsSummary({
      referenceDate: new Date(),
      paOrgIds: selectedOrgIds,
    })
  } catch {
    loadError = "Data load failed."
  }

  if (loadError || !summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        {loadError ?? "Data load failed."}
      </main>
    )
  }

  const allOrgIds = summary.orgOptions.map((option) => option.id)
  const validSelectedOrgIds = selectedOrgIds.filter((id) =>
    allOrgIds.includes(id)
  )

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto h-full w-full max-w-[1900px]">
        <SpecialistsPointsReport
          summary={summary}
          validSelectedOrgIds={validSelectedOrgIds}
          className="flex h-full min-w-0 flex-col gap-4 px-4 py-6 md:px-6"
        />
      </div>
    </main>
  )
}
