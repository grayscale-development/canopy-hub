import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { SpecialistsPointsReport } from "@/components/points-specialists/specialists-points-report"
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

  const allOrgIds = summary?.orgOptions.map((option) => option.id) ?? []
  const validSelectedOrgIds = selectedOrgIds.filter((id) =>
    allOrgIds.includes(id)
  )

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
                <BreadcrumbPage>Specialists Points</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        {loadError || !summary ? (
          <div className="p-4">
            <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
              {loadError ?? "Data load failed."}
            </div>
          </div>
        ) : (
          <SpecialistsPointsReport
            summary={summary}
            validSelectedOrgIds={validSelectedOrgIds}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
