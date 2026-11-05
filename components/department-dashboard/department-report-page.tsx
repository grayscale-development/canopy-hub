import { redirect } from "next/navigation"
import { randomUUID } from "node:crypto"

import { DepartmentDashboardView } from "@/components/department-dashboard/department-dashboard"
import {
  DEPARTMENT_DASHBOARDS,
  parseDepartmentDashboardQuery,
  type DepartmentId,
} from "@/lib/department-dashboard"
import { fetchDepartmentDashboard } from "@/lib/hub-data"
import { DEPARTMENT_DASHBOARD_EVENTS_VIEW_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
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
  const canViewEvents = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: DEPARTMENT_DASHBOARD_EVENTS_VIEW_PERMISSION,
  })
  const dashboardQuery = canViewEvents
    ? query
    : {
        ...query,
        eventMonth: null,
        eventWeek: null,
        eventName: null,
        page: 1,
      }

  let loadError: string | null = null
  let dashboard: Awaited<ReturnType<typeof fetchDepartmentDashboard>> | null =
    null

  try {
    dashboard = await fetchDepartmentDashboard({
      department,
      query: dashboardQuery,
      includeEvents: canViewEvents,
      referenceDate: new Date(),
    })
  } catch (error) {
    const referenceId = randomUUID().slice(0, 8)
    console.error("Department dashboard data load failed", {
      referenceId,
      department,
      error,
    })
    loadError = `Data load failed. Reference: ${referenceId}.`
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
          query={dashboardQuery}
          canViewEvents={canViewEvents}
        />
      </div>
    </main>
  )
}
