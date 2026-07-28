"use client"

import Link from "next/link"
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

type SortKey = "name" | "fileCount" | "totalVolume"
type SortDirection = "asc" | "desc"

export interface CurrentMonthSummaryRow {
  id: string | null
  name: string
  fileCount: number
  totalVolume: number
  fileViewerHref?: string
  rowHref?: string
}

interface CurrentMonthSummaryTableProps {
  entityLabel: string
  rows: CurrentMonthSummaryRow[]
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
    direction: key === "name" ? "asc" : "desc",
  } as const
}

export function CurrentMonthSummaryTable({
  entityLabel,
  rows,
}: CurrentMonthSummaryTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "fileCount",
    direction: "desc",
  })

  const sortedRows = useMemo(() => {
    const result = [...rows]
    result.sort((left, right) => {
      if (sort.key === "name") {
        const nameComparison = left.name.localeCompare(right.name)
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
          left.name.localeCompare(right.name)
        )
      }

      if (left.totalVolume !== right.totalVolume) {
        return sort.direction === "asc"
          ? left.totalVolume - right.totalVolume
          : right.totalVolume - left.totalVolume
      }

      return (
        right.fileCount - left.fileCount || left.name.localeCompare(right.name)
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
                  setSort((current) => getNextSort(current, "name"))
                }
              >
                <span>{entityLabel}</span>
                {sortIndicator("name")}
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
                <span>#</span>
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
                <span>$</span>
                {sortIndicator("totalVolume")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr
              key={`${row.id ?? row.name}-${index}`}
              className="border-b last:border-0"
            >
              <td className="px-4 py-2.5">
                {row.rowHref ? (
                  <Link
                    href={row.rowHref}
                    className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                  >
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {row.fileViewerHref ? (
                  <Link
                    href={row.fileViewerHref}
                    className="font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                  >
                    {INTEGER_FORMATTER.format(row.fileCount)}
                  </Link>
                ) : (
                  INTEGER_FORMATTER.format(row.fileCount)
                )}
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
