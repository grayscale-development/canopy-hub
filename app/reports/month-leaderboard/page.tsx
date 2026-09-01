import { redirect } from "next/navigation"

import { LeaderboardTableCard } from "@/components/reports/leaderboard-table-card"
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
import { getLeaderboardPostedMonth } from "@/lib/leaderboard-month"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type FileViewerUrlFilter = {
  field: FileViewerFilterField
  operator: FileViewerFilterOperator
  value: string
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
  fundedDateStart,
  fundedDateEnd,
}: {
  entity: LeaderboardEntityKey
  entityId: string | null
  label: string
  fundedDateStart?: string
  fundedDateEnd?: string
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
  if (fundedDateStart) {
    filters.push({
      field: "fundedDate",
      operator: "onOrAfter",
      value: fundedDateStart,
    })
  }
  if (fundedDateEnd) {
    filters.push({
      field: "fundedDate",
      operator: "onOrBefore",
      value: fundedDateEnd,
    })
  }

  return toFileViewerHrefFromFilters(filters)
}

export function generateMetadata() {
  const { monthName } = getLeaderboardPostedMonth()

  return {
    title: `${monthName} Leaderboard`,
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

  const postedMonth = getLeaderboardPostedMonth()
  const leaderboardMonthName = postedMonth.monthName
  const leaderboardMonthLabel = postedMonth.monthLabel
  const leaderboardFundedStart = postedMonth.startIso
  const leaderboardFundedEnd = postedMonth.endIso

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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
              fundedDateStart: leaderboardFundedStart,
              fundedDateEnd: leaderboardFundedEnd,
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
            {leaderboardMonthLabel}, using the Funded date.
            {postedMonth.isPreviousMonthHoldover
              ? " Previous month standings stay posted through the 5th while the new month accumulates."
              : ""}
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
