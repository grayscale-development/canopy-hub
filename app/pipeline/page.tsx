import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { FilesTableWithDetails } from "@/components/file-viewer/files-table-with-details"
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
import { type PipelineViewKey, fetchPipelineFilesForUser } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const PIPELINE_VIEWS: Array<{
  key: PipelineViewKey
  label: string
  description: string
}> = [
  {
    key: "active",
    label: "Active Files",
    description:
      "Classification is Active and you are the Loan Officer or Processor.",
  },
  {
    key: "new-applications",
    label: "New Applications",
    description:
      "Last Status is an application-stage status and you are the Loan Officer or Processor.",
  },
  {
    key: "upcoming-closings",
    label: "Upcoming Closings",
    description:
      "Estimated closing date is within the next 30 days and you are the Loan Officer or Processor.",
  },
]

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
})

export const metadata = {
  title: "Pipeline",
}

function parseViewParam(
  searchParams?: Record<string, string | string[] | undefined>
): PipelineViewKey {
  const raw = searchParams?.view
  const value = Array.isArray(raw) ? raw[0] : raw
  if (
    value === "active" ||
    value === "new-applications" ||
    value === "upcoming-closings"
  ) {
    return value
  }

  return "active"
}

function startOfToday(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export default async function PipelinePage({
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
  const selectedView = parseViewParam(resolvedSearchParams)
  const selectedViewMeta =
    PIPELINE_VIEWS.find((view) => view.key === selectedView) ??
    PIPELINE_VIEWS[0]

  const windowStart = startOfToday()
  const windowEnd = addDays(windowStart, 30)

  let loadError: string | null = null
  let files: Awaited<ReturnType<typeof fetchPipelineFilesForUser>> = []

  try {
    files = await fetchPipelineFilesForUser({
      userId: user.id,
      view: selectedView,
      referenceDate: windowStart,
      limit: 5000,
    })
  } catch {
    loadError = "Data load failed."
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/pipeline" />
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
                <BreadcrumbPage>Pipeline</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          </div>

          <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground">
            <div className="mb-4 flex flex-wrap gap-2">
              {PIPELINE_VIEWS.map((view) => {
                const isActive = view.key === selectedView
                return (
                  <Link
                    key={view.key}
                    href={`/pipeline?view=${view.key}`}
                    className={[
                      "inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted/60",
                    ].join(" ")}
                  >
                    {view.label}
                  </Link>
                )
              })}
            </div>

            <p className="mb-1 text-sm text-muted-foreground">
              {selectedViewMeta.description}
            </p>
            {selectedView === "upcoming-closings" ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Date window: {DATE_FORMATTER.format(windowStart)} -{" "}
                {DATE_FORMATTER.format(windowEnd)}.
              </p>
            ) : null}

            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No files found for this view.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Showing {files.length} file{files.length === 1 ? "" : "s"}.
                </p>
                <FilesTableWithDetails rows={files} />
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
