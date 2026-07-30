import Link from "next/link"
import { redirect } from "next/navigation"

import { AutoScrollArea } from "@/components/ui/auto-scroll-area"
import {
  fetchCurrentMonthBranchSummary,
  fetchCurrentMonthDivisionSummary,
  fetchCurrentMonthLoanOfficerSummary,
  fetchCurrentMonthProcessorSummary,
  fetchCurrentMonthUnderwriterSummary,
  fetchCurrentMonthUnderwritingOrgSummary,
  type LeaderboardEntityKey,
} from "@/lib/hub-data"
import type { FileViewerFilterField } from "@/lib/file-viewer-filters"
import type { FileViewerFilterOperator } from "@/lib/file-viewer-filters"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type FileViewerUrlFilter = {
  field: FileViewerFilterField
  operator: FileViewerFilterOperator
  value: string
}

type LeaderboardRow = {
  id: string | null
  name: string
  fileCount: number
  totalVolume: number
  rowHref?: string
  fileViewerHref: string
}

const TOP_ROW_COUNT = 20

const ENTITY_FILTER_FIELD: Record<LeaderboardEntityKey, FileViewerFilterField> =
  {
    division: "division",
    branch: "branch",
    loanOfficer: "loanOfficer",
    processor: "processor",
    underwriter: "underwriter",
    underwritingOrg: "underwritingOrg",
  }
const ENTITY_ID_FILTER_FIELD: Record<
  LeaderboardEntityKey,
  FileViewerFilterField
> = {
  division: "divisionId",
  branch: "branchId",
  loanOfficer: "loanOfficerId",
  processor: "processorId",
  underwriter: "underwriterId",
  underwritingOrg: "underwritingOrgId",
}

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function toTopByPerformance<
  T extends { fileCount: number; totalVolume: number; name: string },
>(rows: T[]) {
  return [...rows]
    .sort((a, b) => {
      if (b.fileCount !== a.fileCount) {
        return b.fileCount - a.fileCount
      }
      if (b.totalVolume !== a.totalVolume) {
        return b.totalVolume - a.totalVolume
      }
      return a.name.localeCompare(b.name)
    })
    .slice(0, TOP_ROW_COUNT)
}

function toFileViewerHrefFromFilters(filters: FileViewerUrlFilter[]) {
  if (filters.length === 0) {
    return "/file-viewer"
  }

  const params = new URLSearchParams()
  for (const filter of filters) {
    params.append("ff", filter.field)
    params.append("fo", filter.operator)
    params.append("fv", filter.value)
  }

  return `/file-viewer?${params.toString()}`
}

function toFileViewerHref({
  entity,
  entityId,
  label,
  closedDateStart,
  closedDateEnd,
}: {
  entity: LeaderboardEntityKey
  entityId: string | null
  label: string
  closedDateStart?: string
  closedDateEnd?: string
}) {
  const filters: FileViewerUrlFilter[] = []
  const entityIdField = ENTITY_ID_FILTER_FIELD[entity]
  const entityField = ENTITY_FILTER_FIELD[entity]
  if (entityId?.trim()) {
    filters.push({
      field: entityIdField,
      operator: "equals",
      value: entityId,
    })
  } else if (label.trim()) {
    filters.push({
      field: entityField,
      operator: "equals",
      value: label,
    })
  }
  if (closedDateStart) {
    filters.push({
      field: "closedDate",
      operator: "onOrAfter",
      value: closedDateStart,
    })
  }
  if (closedDateEnd) {
    filters.push({
      field: "closedDate",
      operator: "onOrBefore",
      value: closedDateEnd,
    })
  }

  return toFileViewerHrefFromFilters(filters)
}

function LeaderboardTableCard({
  title,
  subtitle,
  rows,
  emptyLabel,
}: {
  title: string
  subtitle: string
  rows: LeaderboardRow[]
  emptyLabel: string
}) {
  const renderRows = () =>
    rows.map((row, index) => (
      <tr
        key={`${row.id ?? row.name}-${index}`}
        className="border-b last:border-0"
      >
        <td className="w-10 px-2 py-2 text-center font-mono text-xs font-semibold text-muted-foreground tabular-nums">
          {index + 1}
        </td>
        <td className="px-2 py-2">
          {row.rowHref ? (
            <Link
              href={row.rowHref}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <span className="truncate">{row.name}</span>
            </Link>
          ) : (
            <span className="block truncate text-sm">{row.name}</span>
          )}
        </td>
        <td className="w-[70px] px-2 py-2 text-right font-mono text-base tabular-nums">
          <Link
            href={row.fileViewerHref}
            className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            {INTEGER_FORMATTER.format(row.fileCount)}
          </Link>
        </td>
        <td
          className="w-[118px] px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums"
          title={CURRENCY_FORMATTER.format(row.totalVolume)}
        >
          {CURRENCY_FORMATTER.format(row.totalVolume)}
        </td>
      </tr>
    ))

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card p-4 text-card-foreground md:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <AutoScrollArea
            className="leaderboard-scroll-viewport min-h-0 flex-1"
            pixelsPerSecond={36}
          >
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted text-left text-muted-foreground">
                  <th className="w-10 px-2 py-2 text-center font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="w-[70px] px-2 py-2 text-right font-medium">
                    Files
                  </th>
                  <th className="w-[118px] px-2 py-2 text-right font-medium">
                    $
                  </th>
                </tr>
              </thead>
              <tbody>{renderRows()}</tbody>
            </table>
          </AutoScrollArea>
        </div>
      )}
    </section>
  )
}

export function generateMetadata() {
  const currentDate = new Date()
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(currentDate)

  return {
    title: `${monthLabel} Leaderboard`,
  }
}

export default async function MonthLeaderboardViewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const referenceDate = new Date()
  const leaderboardYear = referenceDate.getFullYear()
  const leaderboardMonthIndex = referenceDate.getMonth()
  const leaderboardMonthNumber = String(leaderboardMonthIndex + 1).padStart(
    2,
    "0"
  )
  const leaderboardMonthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(referenceDate)
  const leaderboardMonthLabel = `${leaderboardMonthName} ${leaderboardYear}`
  const leaderboardMonthEndDay = new Date(
    leaderboardYear,
    leaderboardMonthIndex + 1,
    0
  ).getDate()
  const leaderboardClosedStart = `${leaderboardYear}-${leaderboardMonthNumber}-01`
  const leaderboardClosedEnd = `${leaderboardYear}-${leaderboardMonthNumber}-${String(
    leaderboardMonthEndDay
  ).padStart(2, "0")}`

  const [
    divisionResult,
    branchResult,
    loanOfficerResult,
    processorResult,
    underwriterResult,
    underwritingOrgResult,
  ] = await Promise.allSettled([
    fetchCurrentMonthDivisionSummary(),
    fetchCurrentMonthBranchSummary(),
    fetchCurrentMonthLoanOfficerSummary(),
    fetchCurrentMonthProcessorSummary(),
    fetchCurrentMonthUnderwriterSummary(),
    fetchCurrentMonthUnderwritingOrgSummary(),
  ])

  const divisionRows =
    divisionResult.status === "fulfilled"
      ? toTopByPerformance(
          divisionResult.value.map((row) => ({
            id: row.divisionId,
            name: row.divisionName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            rowHref: row.divisionId
              ? `/division/${encodeURIComponent(row.divisionId)}`
              : undefined,
            fileViewerHref: toFileViewerHref({
              entity: "division",
              entityId: row.divisionId,
              label: row.divisionName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  const branchRows =
    branchResult.status === "fulfilled"
      ? toTopByPerformance(
          branchResult.value.map((row) => ({
            id: row.branchId,
            name: row.branchName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            rowHref: row.branchId
              ? `/branch/${encodeURIComponent(row.branchId)}`
              : undefined,
            fileViewerHref: toFileViewerHref({
              entity: "branch",
              entityId: row.branchId,
              label: row.branchName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  const loanOfficerRows =
    loanOfficerResult.status === "fulfilled"
      ? toTopByPerformance(
          loanOfficerResult.value.map((row) => ({
            id: row.loanOfficerId,
            name: row.loanOfficerName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            rowHref: row.loanOfficerId
              ? `/employee/${encodeURIComponent(row.loanOfficerId)}`
              : undefined,
            fileViewerHref: toFileViewerHref({
              entity: "loanOfficer",
              entityId: row.loanOfficerId,
              label: row.loanOfficerName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  const processorRows =
    processorResult.status === "fulfilled"
      ? toTopByPerformance(
          processorResult.value.map((row) => ({
            id: row.processorId,
            name: row.processorName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            rowHref: row.processorId
              ? `/employee/${encodeURIComponent(row.processorId)}`
              : undefined,
            fileViewerHref: toFileViewerHref({
              entity: "processor",
              entityId: row.processorId,
              label: row.processorName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  const underwriterRows =
    underwriterResult.status === "fulfilled"
      ? toTopByPerformance(
          underwriterResult.value.map((row) => ({
            id: row.underwriterId,
            name: row.underwriterName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            rowHref: row.underwriterId
              ? `/employee/${encodeURIComponent(row.underwriterId)}`
              : undefined,
            fileViewerHref: toFileViewerHref({
              entity: "underwriter",
              entityId: row.underwriterId,
              label: row.underwriterName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  const underwritingOrgRows =
    underwritingOrgResult.status === "fulfilled"
      ? toTopByPerformance(
          underwritingOrgResult.value.map((row) => ({
            id: row.underwritingOrgId,
            name: row.underwritingOrgName,
            fileCount: row.fileCount,
            totalVolume: row.totalVolume,
            fileViewerHref: toFileViewerHref({
              entity: "underwritingOrg",
              entityId: row.underwritingOrgId,
              label: row.underwritingOrgName,
              closedDateStart: leaderboardClosedStart,
              closedDateEnd: leaderboardClosedEnd,
            }),
          }))
        )
      : []

  return (
    <main className="h-screen overflow-hidden bg-background px-4 py-5 text-foreground md:px-6">
      <div className="mx-auto flex h-full w-full max-w-[2000px] min-w-0 flex-col gap-4">
        <section className="shrink-0 rounded-xl border bg-card p-5 text-card-foreground">
          <h1 className="text-2xl font-semibold tracking-tight">
            {leaderboardMonthName} Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Top {TOP_ROW_COUNT} by funded file count and volume for{" "}
            {leaderboardMonthLabel}.
          </p>
        </section>

        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <LeaderboardTableCard
            title="Division"
            subtitle="Ranked by funded count"
            rows={divisionRows}
            emptyLabel="No division leaderboard data."
          />
          <LeaderboardTableCard
            title="Branch"
            subtitle="Ranked by funded count"
            rows={branchRows}
            emptyLabel="No branch leaderboard data."
          />
          <LeaderboardTableCard
            title="Loan Officer"
            subtitle="Ranked by funded count"
            rows={loanOfficerRows}
            emptyLabel="No loan officer leaderboard data."
          />
          <LeaderboardTableCard
            title="Processor"
            subtitle="Ranked by funded count"
            rows={processorRows}
            emptyLabel="No processor leaderboard data."
          />
          <LeaderboardTableCard
            title="Underwriter"
            subtitle="Ranked by funded count"
            rows={underwriterRows}
            emptyLabel="No underwriter leaderboard data."
          />
          <LeaderboardTableCard
            title="Underwriting Org"
            subtitle="Ranked by funded count"
            rows={underwritingOrgRows}
            emptyLabel="No underwriting org leaderboard data."
          />
        </section>
      </div>
    </main>
  )
}
