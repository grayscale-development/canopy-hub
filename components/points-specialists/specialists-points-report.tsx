import Link from "next/link"

import { PointsSpecialistsPaOrgFilter } from "@/components/points-specialists/pa-org-filter"
import { PointsSummaryChart } from "@/components/points-specialists/points-summary-chart"
import { AutoScrollArea } from "@/components/ui/auto-scroll-area"
import type { fetchPointsSpecialistsSummary } from "@/lib/hub-data"

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
})

const POINTS_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

type SpecialistsPointsSummary = Awaited<
  ReturnType<typeof fetchPointsSpecialistsSummary>
>

function formatIsoDate(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return isoDate
  }
  return DATE_FORMATTER.format(parsed)
}

export function SpecialistsPointsReport({
  summary,
  validSelectedOrgIds,
  className = "flex min-w-0 flex-1 flex-col gap-4 p-4",
}: {
  summary: SpecialistsPointsSummary
  validSelectedOrgIds: string[]
  className?: string
}) {
  const allOrgIds = summary.orgOptions.map((option) => option.id)
  const isAllOrgsSelected =
    validSelectedOrgIds.length === 0 ||
    validSelectedOrgIds.length === allOrgIds.length
  const monthlyRows = summary.monthlySummary.filter(
    (row) => row.totalPoints !== 0
  )
  const weeklyRows = summary.weeklySummary.filter(
    (row) => row.totalPoints !== 0
  )
  const renderWeeklyRows = () =>
    weeklyRows.map((row) => (
      <tr key={row.weekStartIso} className="border-b last:border-0">
        <td className="px-3 py-2.5 whitespace-nowrap">
          {formatIsoDate(row.weekStartIso)}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {formatIsoDate(row.weekEndIso)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
          {POINTS_FORMATTER.format(row.totalPoints)}
        </td>
      </tr>
    ))
  const renderTopUserRows = () =>
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
        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
          {POINTS_FORMATTER.format(row.totalPoints)}
        </td>
      </tr>
    ))
  const renderPaOrgRows = () =>
    summary.byPaOrg.map((row) => (
      <tr key={row.paOrgId} className="border-b last:border-0">
        <td className="px-3 py-2.5 font-mono whitespace-nowrap">
          {row.paOrgId}
        </td>
        <td className="px-3 py-2.5 break-words">{row.paOrgName}</td>
        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
          {POINTS_FORMATTER.format(row.totalPoints)}
        </td>
      </tr>
    ))

  return (
    <div className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-1 py-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Specialists Points
          </h1>
        </div>
        <PointsSpecialistsPaOrgFilter
          options={summary.orgOptions}
          selectedIds={validSelectedOrgIds}
        />
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="text-xl font-semibold">Points Summary</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatIsoDate(summary.windowStartIso)} -{" "}
          {formatIsoDate(summary.windowEndIso)}
        </p>
        <div className="mt-4">
          <PointsSummaryChart rows={monthlyRows} />
        </div>
      </div>

      <div
        className={`grid min-h-0 flex-1 items-stretch gap-4 ${
          isAllOrgsSelected ? "xl:grid-cols-3" : "xl:grid-cols-2"
        }`}
      >
        <div className="flex min-h-0 flex-col rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="text-xl font-semibold">By Week</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly totals from {formatIsoDate(summary.windowStartIso)} through{" "}
            {formatIsoDate(summary.windowEndIso)}.
          </p>
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
            <AutoScrollArea
              className="points-specialists-scroll-viewport min-h-0 flex-1"
              pixelsPerSecond={36}
            >
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-muted text-left text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Week Start</th>
                    <th className="px-3 py-2.5 font-medium">Week End</th>
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
                    renderWeeklyRows()
                  )}
                </tbody>
              </table>
            </AutoScrollArea>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="text-xl font-semibold">Top 20 Users</h2>
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
            <AutoScrollArea
              className="points-specialists-scroll-viewport min-h-0 flex-1"
              pixelsPerSecond={36}
            >
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-muted text-left text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                      User ID
                    </th>
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
                    renderTopUserRows()
                  )}
                </tbody>
              </table>
            </AutoScrollArea>
          </div>
        </div>

        {isAllOrgsSelected ? (
          <div className="flex min-h-0 flex-col rounded-xl border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-semibold">By PA Org</h2>
            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
              <AutoScrollArea
                className="points-specialists-scroll-viewport min-h-0 flex-1"
                pixelsPerSecond={36}
              >
                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted text-left text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                        PA Org ID
                      </th>
                      <th className="px-3 py-2.5 font-medium">PA Org Name</th>
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
                      renderPaOrgRows()
                    )}
                  </tbody>
                </table>
              </AutoScrollArea>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
