import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { FilesTableWithDetails } from "@/components/file-viewer/files-table-with-details"
import { CanopyProductionChart } from "@/components/home/canopy-production-chart"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  fetchEmployeeLast12MonthsSeries,
  fetchEmployeePointsSummary,
  fetchEmployeeProfileById,
  fetchFileViewerFiles,
} from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const TAB_ITEMS = [
  { key: "home", label: "Home" },
  { key: "pipeline", label: "Pipeline" },
  { key: "points", label: "Points" },
  { key: "bridge", label: "Bridge" },
] as const

type EmployeeTabKey = (typeof TAB_ITEMS)[number]["key"]

function isEmployeeTabKey(value: string): value is EmployeeTabKey {
  return TAB_ITEMS.some((item) => item.key === value)
}

function valueOrDash(value: string | null | undefined) {
  if (!value?.trim()) {
    return "—"
  }
  return value
}

function formatDate(value: string | null) {
  if (!value) {
    return "—"
  }
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

const POINTS_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

export const metadata = {
  title: "Employee",
}

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const resolvedParams = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const rawTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab
  const tab = rawTab && isEmployeeTabKey(rawTab) ? rawTab : "home"
  const employeeId = decodeURIComponent(resolvedParams.employeeId)
  const profile = await fetchEmployeeProfileById(employeeId)
  const employeeName = profile?.displayName ?? `Employee ${employeeId}`
  const initials = employeeName
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  const [last12MonthsSeries, pipelineRows, pointsSummary] = await Promise.all([
    tab === "home"
      ? fetchEmployeeLast12MonthsSeries({ employeeId })
      : Promise.resolve(null),
    tab === "pipeline"
      ? fetchFileViewerFiles({
          employeeId,
          openPipelineOnly: true,
          limit: 500,
        })
      : Promise.resolve([]),
    tab === "points"
      ? fetchEmployeePointsSummary({ employeeId })
      : Promise.resolve(null),
  ])

  return (
    <SidebarProvider>
      <AppSidebar activePath="/home" />
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
                <BreadcrumbLink asChild>
                  <Link href="/home">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{employeeName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="rounded-xl border bg-card p-6 text-card-foreground">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar className="size-16">
                <AvatarImage
                  src={profile?.profilePhotoUrl ?? undefined}
                  alt={employeeName}
                />
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-3xl font-semibold tracking-tight">
                  {employeeName}
                </h1>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Role
                    </p>
                    <p className="mt-1">{valueOrDash(profile?.role)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Email
                    </p>
                    <p className="mt-1">{valueOrDash(profile?.email)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Phone Number
                    </p>
                    <p className="mt-1">{valueOrDash(profile?.phoneNumber)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      LOS ID
                    </p>
                    <p className="mt-1">{valueOrDash(profile?.losId)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Processing Org
                    </p>
                    <p className="mt-1">
                      {profile?.processingOrgs.length
                        ? profile.processingOrgs.join(", ")
                        : "—"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Underwriting Org
                    </p>
                    <p className="mt-1">
                      {profile?.underwritingOrgs.length
                        ? profile.underwritingOrgs.join(", ")
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 px-1">
            {TAB_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`/employee/${encodeURIComponent(employeeId)}?tab=${item.key}`}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  tab === item.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted/50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {tab === "home" ? (
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-xl font-semibold">Last 12 Months</h2>
              {last12MonthsSeries ? (
                <div className="mt-4">
                  <CanopyProductionChart
                    labels={last12MonthsSeries.labels}
                    monthlyFundedCounts={last12MonthsSeries.monthlyFundedCounts}
                    monthlyFundedVolumes={
                      last12MonthsSeries.monthlyFundedVolumes
                    }
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Data load failed.
                </p>
              )}
            </div>
          ) : null}

          {tab === "pipeline" ? (
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-xl font-semibold">Pipeline</h2>
              {pipelineRows.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No pipeline files found.
                </p>
              ) : (
                <div className="mt-4">
                  <FilesTableWithDetails rows={pipelineRows} />
                </div>
              )}
            </div>
          ) : null}

          {tab === "points" ? (
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-xl font-semibold">Points</h2>
              {!pointsSummary ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Data load failed.
                </p>
              ) : pointsSummary.rows.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No points data found.
                </p>
              ) : (
                <>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Source: {pointsSummary.source === "new" ? "New" : "Old"} |
                    Total points in loaded rows:{" "}
                    <span className="font-mono text-foreground tabular-nums">
                      {POINTS_FORMATTER.format(pointsSummary.totalPoints)}
                    </span>
                  </p>
                  <div className="mt-3 max-w-full overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">
                            Event Date
                          </th>
                          <th className="px-4 py-2.5 font-medium">Event</th>
                          <th className="px-4 py-2.5 text-right font-medium">
                            Points
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointsSummary.rows.map((row, index) => (
                          <tr
                            key={`${row.eventDate ?? "none"}-${row.event ?? "event"}-${index}`}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {formatDate(row.eventDate)}
                            </td>
                            <td className="px-4 py-2.5">
                              {valueOrDash(row.event)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {POINTS_FORMATTER.format(row.points)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {tab === "bridge" ? (
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-xl font-semibold">Bridge</h2>
            </div>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
