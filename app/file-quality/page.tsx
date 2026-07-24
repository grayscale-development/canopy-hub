import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { FileQualityReport } from "@/components/file-quality/file-quality-report"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
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

export default async function FileQualityPage({
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

  return (
    <SidebarProvider>
      <AppSidebar activePath="/reports" />
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
                <BreadcrumbPage>File Quality</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        {loadError || !rollups ? (
          <div className="p-4">
            <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
              {loadError ?? "Data load failed."}
            </div>
          </div>
        ) : (
          <FileQualityReport
            monthOptions={monthOptions}
            selectedMonth={selectedMonth}
            divisionRows={rollups.divisionRows}
            branchRows={rollups.branchRows}
            hasExpectedTouches={rollups.hasExpectedTouches}
            hasNetTouches={rollups.hasNetTouches}
            hasExpectedAndNetMetrics={rollups.hasExpectedAndNetMetrics}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
