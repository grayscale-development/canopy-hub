"use client"

import Link from "next/link"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { DataTablePagination } from "@/components/ui/data-table-pagination"
import type { EmployeeDirectoryRow } from "@/lib/hub-data"

type SortKey =
  | "id"
  | "employee"
  | "jobTitle"
  | "workEmail"
  | "mobilePhone"
  | "division"
  | "branch"
  | "branchId"
type SortDirection = "asc" | "desc"

function valueOrDash(value: string | null | undefined) {
  return value?.trim() ? value : "—"
}

function normalize(value: string | null | undefined) {
  return value?.toLowerCase().trim() ?? ""
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
    direction: "asc",
  } as const
}

export function EmployeeDirectoryTable({ rows }: { rows: EmployeeDirectoryRow[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "employee",
    direction: "asc",
  })
  const pageSize = 50

  const filteredAndSortedRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    const filtered = normalizedQuery
      ? rows.filter((row) =>
          [
            row.id,
            row.employee,
            row.jobTitle,
            row.workEmail,
            row.mobilePhone,
            row.divisionId,
            row.division,
            row.branch,
            row.branchId,
          ]
            .map((value) => normalize(value))
            .join(" ")
            .includes(normalizedQuery)
        )
      : rows

    return [...filtered].sort((left, right) => {
      const leftValue = normalize(left[sort.key] as string | null | undefined)
      const rightValue = normalize(right[sort.key] as string | null | undefined)
      const result = leftValue.localeCompare(rightValue)
      return sort.direction === "asc" ? result : -result
    })
  }, [rows, searchQuery, sort])

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pagedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize
    return filteredAndSortedRows.slice(startIndex, startIndex + pageSize)
  }, [filteredAndSortedRows, safePage])

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
    <div className="rounded-xl border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value)
            setCurrentPage(1)
          }}
          placeholder="Search employees"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          {filteredAndSortedRows.length} result
          {filteredAndSortedRows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="max-w-full overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              {[
                { key: "id", label: "ID" },
                { key: "employee", label: "Employee" },
                { key: "jobTitle", label: "Job Title" },
                { key: "workEmail", label: "Work Email" },
                { key: "mobilePhone", label: "Mobile Phone" },
                { key: "division", label: "Division" },
                { key: "branch", label: "Branch" },
                { key: "branchId", label: "Branch ID" },
              ].map((column) => (
                <th key={column.key} className="px-3 py-2.5 font-medium whitespace-nowrap">
                  <button
                    type="button"
                    className="flex items-center gap-2 hover:text-foreground"
                    onClick={() =>
                      setSort((current) =>
                        getNextSort(current, column.key as SortKey)
                      )
                    }
                  >
                    <span>{column.label}</span>
                    {sortIndicator(column.key as SortKey)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No employees found.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b transition-colors hover:bg-muted/30 last:border-0"
                  onClick={() => router.push(`/employee/${encodeURIComponent(row.id)}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      router.push(`/employee/${encodeURIComponent(row.id)}`)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">{row.id}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {row.employee}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {valueOrDash(row.jobTitle)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {valueOrDash(row.workEmail)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {valueOrDash(row.mobilePhone)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.divisionId?.trim() && row.division?.trim() ? (
                      <Link
                        href={`/division/${encodeURIComponent(row.divisionId)}`}
                        className="font-medium text-link underline decoration-primary/60 underline-offset-4 transition-colors hover:no-underline"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.division}
                      </Link>
                    ) : (
                      valueOrDash(row.division)
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.branchId?.trim() && row.branch?.trim() ? (
                      <Link
                        href={`/branch/${encodeURIComponent(row.branchId)}`}
                        className="font-medium text-link underline decoration-primary/60 underline-offset-4 transition-colors hover:no-underline"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.branch}
                      </Link>
                    ) : (
                      valueOrDash(row.branch)
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                    {row.branchId?.trim() ? (
                      <Link
                        href={`/branch/${encodeURIComponent(row.branchId)}`}
                        className="font-medium text-link underline decoration-primary/60 underline-offset-4 transition-colors hover:no-underline"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.branchId}
                      </Link>
                    ) : (
                      valueOrDash(row.branchId)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        page={safePage}
        totalItems={filteredAndSortedRows.length}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
      />
    </div>
  )
}
