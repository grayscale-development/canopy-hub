import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { FileViewerFilters } from "@/components/file-viewer/file-viewer-filters"
import { FilesTableWithDetails } from "@/components/file-viewer/files-table-with-details"
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
import {
  applyFileViewerFilters,
  parseFileViewerFilters,
  sanitizeFileViewerFilters,
  type FileViewerFilter,
} from "@/lib/file-viewer-filters"
import { type LeaderboardEntityKey, fetchFileViewerFiles } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const MAX_FILE_VIEWER_ROWS = 5000
const ENTITY_FIELD_MAP: Record<
  | "divisionId"
  | "branchId"
  | "loanOfficerId"
  | "processorId"
  | "underwriterId"
  | "underwritingOrgId",
  LeaderboardEntityKey
> = {
  divisionId: "division",
  branchId: "branch",
  loanOfficerId: "loanOfficer",
  processorId: "processor",
  underwriterId: "underwriter",
  underwritingOrgId: "underwritingOrg",
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const mdYMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!mdYMatch) {
    return null
  }

  const month = mdYMatch[1].padStart(2, "0")
  const day = mdYMatch[2].padStart(2, "0")
  const year = mdYMatch[3]
  return `${year}-${month}-${day}`
}

function applyDateBounds(
  operator: FileViewerFilter["operator"],
  normalizedDate: string,
  start: string | undefined,
  end: string | undefined
) {
  let nextStart = start
  let nextEnd = end

  if (operator === "on" || operator === "onOrAfter") {
    if (!nextStart || normalizedDate > nextStart) {
      nextStart = normalizedDate
    }
  }
  if (operator === "on" || operator === "onOrBefore") {
    if (!nextEnd || normalizedDate < nextEnd) {
      nextEnd = normalizedDate
    }
  }
  if (operator === "after") {
    if (!nextStart || normalizedDate >= nextStart) {
      nextStart = normalizedDate
    }
  }
  if (operator === "before") {
    if (!nextEnd || normalizedDate <= nextEnd) {
      nextEnd = normalizedDate
    }
  }

  return { start: nextStart, end: nextEnd }
}

function deriveServerPreFilters(filters: FileViewerFilter[]) {
  let entity: LeaderboardEntityKey | undefined
  let entityId: string | null | undefined
  let closedDateStart: string | undefined
  let closedDateEnd: string | undefined
  let fundedDateStart: string | undefined
  let fundedDateEnd: string | undefined

  for (const filter of filters) {
    if (filter.field in ENTITY_FIELD_MAP && filter.operator === "equals") {
      const mappedEntity =
        ENTITY_FIELD_MAP[filter.field as keyof typeof ENTITY_FIELD_MAP]
      const normalizedValue = filter.value.trim()
      if (!normalizedValue) {
        continue
      }
      if (entity && mappedEntity !== entity) {
        continue
      }
      entity = mappedEntity
      entityId = normalizedValue
      continue
    }

    if (filter.field !== "closedDate" && filter.field !== "fundedDate") {
      continue
    }

    const normalizedDate = normalizeDateValue(filter.value)
    if (!normalizedDate) {
      continue
    }

    if (filter.field === "closedDate") {
      const next = applyDateBounds(
        filter.operator,
        normalizedDate,
        closedDateStart,
        closedDateEnd
      )
      closedDateStart = next.start
      closedDateEnd = next.end
      continue
    }

    const next = applyDateBounds(
      filter.operator,
      normalizedDate,
      fundedDateStart,
      fundedDateEnd
    )
    fundedDateStart = next.start
    fundedDateEnd = next.end
  }

  return {
    entity,
    entityId,
    closedDateStart,
    closedDateEnd,
    fundedDateStart,
    fundedDateEnd,
  }
}

export const metadata = {
  title: "File Viewer",
}

export default async function FileViewerPage({
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
  const parsedFilters = parseFileViewerFilters(resolvedSearchParams)
  const initialFilters = sanitizeFileViewerFilters(parsedFilters)
  const serverPreFilters = deriveServerPreFilters(initialFilters)

  let loadError: string | null = null
  let files: Awaited<ReturnType<typeof fetchFileViewerFiles>> = []

  try {
    files = await fetchFileViewerFiles({
      entity: serverPreFilters.entity,
      entityId: serverPreFilters.entityId,
      closedDateStart: serverPreFilters.closedDateStart,
      closedDateEnd: serverPreFilters.closedDateEnd,
      fundedDateStart: serverPreFilters.fundedDateStart,
      fundedDateEnd: serverPreFilters.fundedDateEnd,
      limit: MAX_FILE_VIEWER_ROWS,
    })
  } catch {
    loadError = "Data load failed."
  }

  const filteredFiles = applyFileViewerFilters(files, initialFilters)
  const activeFilterCount = initialFilters.length

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
                <BreadcrumbPage>File Viewer</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              File Viewer
            </h1>
          </div>

          <div className="min-w-0 rounded-xl border bg-card p-6 text-card-foreground">
            <FileViewerFilters initialFilters={initialFilters} />

            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : filteredFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No files were found for this selection.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Showing {filteredFiles.length} file
                  {filteredFiles.length === 1 ? "" : "s"}
                  {activeFilterCount > 0
                    ? ` with ${activeFilterCount} active filter${
                        activeFilterCount === 1 ? "" : "s"
                      }.`
                    : ` from the latest ${MAX_FILE_VIEWER_ROWS.toLocaleString()} loaded rows.`}
                </p>
                <FilesTableWithDetails rows={filteredFiles} />
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
