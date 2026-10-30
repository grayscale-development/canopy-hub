import { redirect } from "next/navigation"

import { DepartmentDashboardView } from "@/components/department-dashboard/department-dashboard"
import {
  DEPARTMENT_DASHBOARDS,
  parseDepartmentDashboardQuery,
  type DepartmentId,
} from "@/lib/department-dashboard"
import { fetchDepartmentDashboard } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function DepartmentReportPage({
  department,
  searchParams,
}: {
  department: DepartmentId
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const config = DEPARTMENT_DASHBOARDS[department]
  const query = parseDepartmentDashboardQuery((await searchParams) ?? {})

  let loadError: string | null = null
  let dashboard: Awaited<ReturnType<typeof fetchDepartmentDashboard>> | null =
    null

  try {
    dashboard = await fetchDepartmentDashboard({
      department,
      query,
      referenceDate: new Date(),
    })
  } catch {
    loadError = "Data load failed."
  }

  if (loadError || !dashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        {loadError ?? "Data load failed."}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1900px] px-4 py-6 md:px-6">
        <DepartmentDashboardView
          config={config}
          dashboard={dashboard}
          query={query}
        />
      </div>
    </main>
  )
}
