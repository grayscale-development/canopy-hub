import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { PointsSpecialistsPaOrgFilter } from "@/components/points-specialists/pa-org-filter"
import { PointsSummaryChart } from "@/components/points-specialists/points-summary-chart"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { fetchPointsSpecialistsSummary } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
})

const POINTS_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const metadata = {
  title: "Points Specialists",
}

function parseSelectedOrgIds(
  searchParams?: Record<string, string | string[] | undefined>
) {
  const rawValue = searchParams?.pa_org
  const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []
  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (uniqueValues.length !== 1) {
    return []
  }
  return uniqueValues
}

function formatIsoDate(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return isoDate
  }
  return DATE_FORMATTER.format(parsed)
}

export default async function PointsSpecialistsPage({
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
  let summary: Awaited<ReturnType<typeof fetchPointsSpecialistsSummary>> | null = null

  try {
    summary = await fetchPointsSpecialistsSummary({
      referenceDate: new Date(),
      paOrgIds: selectedOrgIds,
    })
  } catch {
    loadError = "Data load failed."
  }

  const allOrgIds = summary?.orgOptions.map((option) => option.id) ?? []
  const validSelectedOrgIds = selectedOrgIds.filter((id) => allOrgIds.includes(id))
  const isAllOrgsSelected =
    validSelectedOrgIds.length === 0 || validSelectedOrgIds.length === allOrgIds.length
  const monthlyRows = summary
    ? summary.monthlySummary.filter((row) => row.totalPoints !== 0)
    : []
  const weeklyRows = summary
    ? summary.weeklySummary.filter((row) => row.totalPoints !== 0)
    : []

  return (
    <SidebarProvider>
      <AppSidebar activePath="/points-specialists" />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Points Specialists</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 px-1 py-2">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Points Specialists</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monthly and weekly specialist points trends, top users, and PA org totals.
              </p>
            </div>
            {summary ? (
              <PointsSpecialistsPaOrgFilter
                options={summary.orgOptions}
                selectedIds={validSelectedOrgIds}
              />
            ) : null}
          </div>

          {loadError || !summary ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
              {loadError ?? "Data load failed."}
            </div>
          ) : (
            <>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Points Summary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatIsoDate(summary.windowStartIso)} - {formatIsoDate(summary.windowEndIso)}
                </p>
                <div className="mt-4">
                  <PointsSummaryChart rows={monthlyRows} />
                </div>
              </div>

              <div
                className={`grid items-start gap-4 ${
                  isAllOrgsSelected ? "xl:grid-cols-3" : "xl:grid-cols-2"
                }`}
              >
                <div className="rounded-xl border bg-card p-6 text-card-foreground">
                  <h2 className="text-xl font-semibold">By Week</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Weekly totals from {formatIsoDate(summary.windowStartIso)} through{" "}
                    {formatIsoDate(summary.windowEndIso)}.
                  </p>
                  <div className="mt-4 max-w-full overflow-hidden rounded-lg border">
                    <table className="w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">
                            Week Start
                          </th>
                          <th className="px-3 py-2.5 font-medium">
                            Week End
                          </th>
                          <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                            Total Points
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-3 py-6 text-center text-sm text-muted-foreground"
                            >
                              No points found for this filter.
                            </td>
                          </tr>
                        ) : (
                          weeklyRows.map((row) => (
                            <tr key={row.weekStartIso} className="border-b last:border-0">
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {formatIsoDate(row.weekStartIso)}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {formatIsoDate(row.weekEndIso)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                                {POINTS_FORMATTER.format(row.totalPoints)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-6 text-card-foreground">
                  <h2 className="text-xl font-semibold">Top 20 Users</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total points in the selected date window.
                  </p>
                  <div className="mt-4 max-w-full overflow-hidden rounded-lg border">
                    <table className="w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium whitespace-nowrap">User ID</th>
                          <th className="px-3 py-2.5 font-medium">Name</th>
                          <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                            Total Points
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topUsers.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-3 py-6 text-center text-sm text-muted-foreground"
                            >
                              No users found for this filter.
                            </td>
                          </tr>
                        ) : (
                          summary.topUsers.map((row) => (
                            <tr key={row.userId} className="border-b last:border-0">
                              <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                                {row.userId}
                              </td>
                              <td className="px-3 py-2.5 break-words">
                                <Link
                                  href={`/employee/${encodeURIComponent(row.userId)}`}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {row.userName}
                                </Link>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                                {POINTS_FORMATTER.format(row.totalPoints)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {isAllOrgsSelected ? (
                  <div className="rounded-xl border bg-card p-6 text-card-foreground">
                    <h2 className="text-xl font-semibold">By PA Org</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Total points by PA org for the selected date window.
                    </p>
                    <div className="mt-4 max-w-full overflow-hidden rounded-lg border">
                      <table className="w-full table-fixed text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                            <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                              PA Org ID
                            </th>
                            <th className="px-3 py-2.5 font-medium">
                              PA Org Name
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                              Total Points
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.byPaOrg.length === 0 ? (
                            <tr>
                              <td
                                colSpan={3}
                                className="px-3 py-6 text-center text-sm text-muted-foreground"
                              >
                                No PA org data found.
                              </td>
                            </tr>
                          ) : (
                            summary.byPaOrg.map((row) => (
                              <tr key={row.paOrgId} className="border-b last:border-0">
                                <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                                  {row.paOrgId}
                                </td>
                                <td className="px-3 py-2.5 break-words">
                                  {row.paOrgName}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                                  {POINTS_FORMATTER.format(row.totalPoints)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
