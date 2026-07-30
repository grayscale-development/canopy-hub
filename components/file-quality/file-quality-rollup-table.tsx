"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"

import { AutoScrollArea } from "@/components/ui/auto-scroll-area"
import type { FileQualityRollupRow } from "@/lib/hub-data"

type SortKey =
  | "label"
  | "fileCount"
  | "touchesPerApp"
  | "avgExpectedTouches"
  | "netTouches"
type SortDirection = "asc" | "desc"

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const METRIC_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function getNextSort(
  current: { key: SortKey; direction: SortDirection },
  key: SortKey
) {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    } as const
  }

  return {
    key,
    direction: key === "label" ? "asc" : key === "netTouches" ? "asc" : "desc",
  } as const
}

function getNetTouchesTextColor(netTouches: number | null) {
  if (netTouches === null) {
    return ""
  }

  return netTouches <= 0 ? "text-emerald-600" : "text-red-600"
}

export function FileQualityRollupTable({
  title,
  entityLabel,
  rows,
}: {
  title: string
  entityLabel: "Division" | "Branch"
  rows: FileQualityRollupRow[]
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "netTouches",
    direction: "asc",
  })
  const companyAveragesRow = rows.find((row) => row.keyId === "company_averages")
  const sortableRows = rows.filter((row) => row.keyId !== "company_averages")

  const sortedRows = useMemo(() => {
    return [...sortableRows].sort((left, right) => {
      if (sort.key === "label") {
        const result = left.label.localeCompare(right.label)
        return sort.direction === "asc" ? result : -result
      }

      const numericLeft = left[sort.key] ?? Number.POSITIVE_INFINITY
      const numericRight = right[sort.key] ?? Number.POSITIVE_INFINITY
      if (numericLeft !== numericRight) {
        return sort.direction === "asc"
          ? numericLeft - numericRight
          : numericRight - numericLeft
      }

      return left.label.localeCompare(right.label)
    })
  }, [sortableRows, sort])

  const sortIndicator = (key: SortKey) => {
    if (sort.key !== key) {
      return null
    }

    return sort.direction === "asc" ? (
      <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    ) : (
      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    )
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <AutoScrollArea
          className="file-quality-table-scroll min-h-0 flex-1"
          pixelsPerSecond={40}
        >
          <table className="w-full table-fixed text-xs sm:text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-left text-muted-foreground">
                <th className="w-[36%] px-2 py-2 font-medium sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    className="flex items-center gap-2 hover:text-foreground"
                    onClick={() => {
                      setSort((current) => getNextSort(current, "label"))
                    }}
                  >
                    <span>{entityLabel}</span>
                    {sortIndicator("label")}
                  </button>
                </th>
                <th className="w-[16%] px-2 py-2 text-right font-medium sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-2 hover:text-foreground"
                    onClick={() => {
                      setSort((current) => getNextSort(current, "fileCount"))
                    }}
                  >
                    <span># of Apps</span>
                    {sortIndicator("fileCount")}
                  </button>
                </th>
                <th className="w-[16%] px-2 py-2 text-right font-medium sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-2 hover:text-foreground"
                    onClick={() => {
                      setSort((current) =>
                        getNextSort(current, "touchesPerApp")
                      )
                    }}
                  >
                    <span>Touches/App</span>
                    {sortIndicator("touchesPerApp")}
                  </button>
                </th>
                <th className="w-[16%] px-2 py-2 text-right font-medium sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-2 hover:text-foreground"
                    onClick={() => {
                      setSort((current) =>
                        getNextSort(current, "avgExpectedTouches")
                      )
                    }}
                  >
                    <span>AVG Expected</span>
                    {sortIndicator("avgExpectedTouches")}
                  </button>
                </th>
                <th className="w-[16%] px-2 py-2 text-right font-medium sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-2 hover:text-foreground"
                    onClick={() => {
                      setSort((current) => getNextSort(current, "netTouches"))
                    }}
                  >
                    <span>Net Touches</span>
                    {sortIndicator("netTouches")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {companyAveragesRow ? (
                <tr className="border-b bg-muted/20 font-medium">
                  <td className="px-2 py-2 leading-tight break-words sm:px-3 sm:py-2.5">
                    {companyAveragesRow.label}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                    {INTEGER_FORMATTER.format(companyAveragesRow.fileCount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                    {METRIC_FORMATTER.format(companyAveragesRow.touchesPerApp)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                    {companyAveragesRow.avgExpectedTouches === null
                      ? "—"
                      : METRIC_FORMATTER.format(
                          companyAveragesRow.avgExpectedTouches
                        )}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5 ${getNetTouchesTextColor(
                      companyAveragesRow.netTouches
                    )}`}
                  >
                    {companyAveragesRow.netTouches === null
                      ? "—"
                      : METRIC_FORMATTER.format(companyAveragesRow.netTouches)}
                  </td>
                </tr>
              ) : null}
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    No data available for this month.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr
                    key={`${row.keyId}-${row.label}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-2 py-2 leading-tight break-words sm:px-3 sm:py-2.5">
                      {row.label}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                      {INTEGER_FORMATTER.format(row.fileCount)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                      {METRIC_FORMATTER.format(row.touchesPerApp)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5">
                      {row.avgExpectedTouches === null
                        ? "—"
                        : METRIC_FORMATTER.format(row.avgExpectedTouches)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-mono tabular-nums sm:px-3 sm:py-2.5 ${getNetTouchesTextColor(
                        row.netTouches
                      )}`}
                    >
                      {row.netTouches === null
                        ? "—"
                        : METRIC_FORMATTER.format(row.netTouches)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AutoScrollArea>
      </div>
    </div>
  )
}
