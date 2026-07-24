import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { DivisionBranchesDataTable } from "@/components/division/division-branches-data-table"
import { DivisionEmployeesTable } from "@/components/division/division-employees-table"
import { FilesTableWithDetails } from "@/components/file-viewer/files-table-with-details"
import { CanopyProductionChart } from "@/components/home/canopy-production-chart"
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
  fetchDivisionBranchSummary,
  fetchDivisionEmployees,
  fetchDivisionLast12MonthsSeries,
  fetchDivisionProfileById,
  fetchFileViewerFiles,
} from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const TAB_ITEMS = [
  { key: "home", label: "Home" },
  { key: "employees", label: "Employees" },
  { key: "pipeline", label: "Pipeline" },
] as const

type DivisionTabKey = (typeof TAB_ITEMS)[number]["key"]

function isDivisionTabKey(value: string): value is DivisionTabKey {
  return TAB_ITEMS.some((item) => item.key === value)
}

export const metadata = {
  title: "Division",
}

export default async function DivisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ divisionId: string }>
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
  const tab = rawTab && isDivisionTabKey(rawTab) ? rawTab : "home"
  const divisionId = decodeURIComponent(resolvedParams.divisionId)
  const division = await fetchDivisionProfileById(divisionId)

  const divisionName = division?.name ?? `Division ${divisionId}`

  const [last12MonthsSeries, branches, employees, pipelineRows] =
    await Promise.all([
      tab === "home"
        ? fetchDivisionLast12MonthsSeries({ divisionId })
        : Promise.resolve(null),
      tab === "home"
        ? fetchDivisionBranchSummary({ divisionId })
        : Promise.resolve([]),
      tab === "employees"
        ? fetchDivisionEmployees({ divisionId })
        : Promise.resolve([]),
      tab === "pipeline"
        ? fetchFileViewerFiles({
            entity: "division",
            entityId: divisionId,
            openPipelineOnly: true,
            limit: 500,
          })
        : Promise.resolve([]),
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
                <BreadcrumbPage>{divisionName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {divisionName}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 px-1">
            {TAB_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`/division/${encodeURIComponent(divisionId)}?tab=${item.key}`}
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
            <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Last 12 Months</h2>
                {last12MonthsSeries ? (
                  <div className="mt-4">
                    <CanopyProductionChart
                      labels={last12MonthsSeries.labels}
                      monthlyFundedCounts={
                        last12MonthsSeries.monthlyFundedCounts
                      }
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

              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Branches</h2>
                {branches.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No branch data found.
                  </p>
                ) : (
                  <DivisionBranchesDataTable rows={branches} />
                )}
              </div>
            </div>
          ) : null}

          {tab === "employees" ? (
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-xl font-semibold">Employees</h2>
              {employees.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No employee data found.
                </p>
              ) : (
                <DivisionEmployeesTable rows={employees} />
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
