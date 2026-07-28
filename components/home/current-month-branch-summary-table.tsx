"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type SortKey = "branchName" | "fileCount" | "totalVolume"
type SortDirection = "asc" | "desc"

interface BranchSummaryRow {
  branchId: string | null
  branchName: string
  fileCount: number
  totalVolume: number
}

interface CurrentMonthBranchSummaryTableProps {
  rows: BranchSummaryRow[]
}

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
    direction: key === "branchName" ? "asc" : "desc",
  } as const
}

export function CurrentMonthBranchSummaryTable({
  rows,
}: CurrentMonthBranchSummaryTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "fileCount",
    direction: "desc",
  })

  const sortedRows = useMemo(() => {
    const result = [...rows]
    result.sort((left, right) => {
      if (sort.key === "branchName") {
        const nameComparison = left.branchName.localeCompare(right.branchName)
        return sort.direction === "asc" ? nameComparison : -nameComparison
      }

      if (sort.key === "fileCount") {
        if (left.fileCount !== right.fileCount) {
          return sort.direction === "asc"
            ? left.fileCount - right.fileCount
            : right.fileCount - left.fileCount
        }

        return (
          right.totalVolume - left.totalVolume ||
          left.branchName.localeCompare(right.branchName)
        )
      }

      if (left.totalVolume !== right.totalVolume) {
        return sort.direction === "asc"
          ? left.totalVolume - right.totalVolume
          : right.totalVolume - left.totalVolume
      }

      return (
        right.fileCount - left.fileCount ||
        left.branchName.localeCompare(right.branchName)
      )
    })

    return result
  }, [rows, sort])

  const sortIndicator = (key: SortKey) => {
    if (sort.key !== key) {
      return null
    }

    return sort.direction === "asc" ? (
      <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    ) : (
      <ChevronDown
        className="h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="mt-4 max-w-full overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">
              <button
                type="button"
                className="flex items-center gap-2 hover:text-foreground"
                onClick={() =>
                  setSort((current) => getNextSort(current, "branchName"))
                }
              >
                <span>Branch</span>
                {sortIndicator("branchName")}
              </button>
            </th>
            <th className="px-4 py-2.5 text-right font-medium">
              <button
                type="button"
                className="ml-auto flex items-center gap-2 hover:text-foreground"
                onClick={() =>
                  setSort((current) => getNextSort(current, "fileCount"))
                }
              >
                <span>File Count</span>
                {sortIndicator("fileCount")}
              </button>
            </th>
            <th className="px-4 py-2.5 text-right font-medium">
              <button
                type="button"
                className="ml-auto flex items-center gap-2 hover:text-foreground"
                onClick={() =>
                  setSort((current) => getNextSort(current, "totalVolume"))
                }
              >
                <span>Total Volume</span>
                {sortIndicator("totalVolume")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr
              key={`${row.branchId ?? row.branchName}-${index}`}
              className="border-b last:border-0"
            >
              <td className="px-4 py-2.5">{row.branchName}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {INTEGER_FORMATTER.format(row.fileCount)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {CURRENCY_FORMATTER.format(row.totalVolume)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
