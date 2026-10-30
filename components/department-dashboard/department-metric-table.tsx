"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import type {
  DepartmentMetricColumn,
  DepartmentMetricRow,
} from "@/lib/department-dashboard"
import { formatDepartmentMetric } from "@/lib/department-dashboard"

type SortDirection = "asc" | "desc"

export function DepartmentMetricTable({
  title,
  nameLabel,
  columns,
  rows,
  linkEmployees = false,
}: {
  title: string
  nameLabel: string
  columns: DepartmentMetricColumn[]
  rows: DepartmentMetricRow[]
  linkEmployees?: boolean
}) {
  const [sort, setSort] = useState<{
    key: string
    direction: SortDirection
  }>({
    key: columns[0]?.key ?? "label",
    direction: "desc",
  })
  const companyRow = rows.find((row) => row.rowKind === "company_avg") ?? null
  const sortableRows = rows.filter((row) => row.rowKind !== "company_avg")

  const sortedRows = useMemo(() => {
    return [...sortableRows].sort((left, right) => {
      if (sort.key === "label") {
        const result = left.label.localeCompare(right.label)
        return sort.direction === "asc" ? result : -result
      }

      const leftValue = left.metrics[sort.key]
      const rightValue = right.metrics[sort.key]
      const numericLeft = leftValue ?? Number.NEGATIVE_INFINITY
      const numericRight = rightValue ?? Number.NEGATIVE_INFINITY
      if (numericLeft !== numericRight) {
        return sort.direction === "asc"
          ? numericLeft - numericRight
          : numericRight - numericLeft
      }
      return left.label.localeCompare(right.label)
    })
  }, [sortableRows, sort])

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        }
      }
      return { key, direction: key === "label" ? "asc" : "desc" }
    })
  }

  const renderRow = (row: DepartmentMetricRow) => {
    const linked =
      linkEmployees && row.rowKind === "employee" && row.id
        ? `/employee/${encodeURIComponent(row.id)}`
        : null

    return (
      <tr
        key={`${row.rowKind}-${row.id ?? row.label}`}
        className="border-b last:border-0"
        data-row-kind={row.rowKind}
      >
        <th
          scope="row"
          className="px-3 py-2.5 text-left font-medium break-words"
        >
          {linked ? (
            <Link
              href={linked}
              className="text-primary underline-offset-2 hover:underline"
            >
              {row.label}
            </Link>
          ) : (
            row.label
          )}
        </th>
        {columns.map((column) => (
          <td
            key={column.key}
            className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums"
          >
            {formatDepartmentMetric(row.metrics[column.key], column.format)}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-xl border bg-card text-card-foreground">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => toggleSort("label")}
                >
                  {nameLabel}
                  {sort.key === "label" ? (
                    sort.direction === "asc" ? (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    )
                  ) : null}
                </button>
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-2 text-right font-medium"
                  title={column.hint}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    {sort.key === column.key ? (
                      sort.direction === "asc" ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companyRow ? renderRow(companyRow) : null}
            {sortedRows.map(renderRow)}
            {!companyRow && sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No rows in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
