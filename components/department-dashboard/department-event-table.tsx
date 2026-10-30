"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { DataTablePagination } from "@/components/ui/data-table-pagination"
import type {
  DepartmentEventColumn,
  DepartmentEventRow,
} from "@/lib/department-dashboard"
import {
  DEPARTMENT_EVENT_PAGE_SIZE,
  formatDepartmentEventValue,
} from "@/lib/department-dashboard"

export function DepartmentEventTable({
  columns,
  rows,
  total,
  page,
}: {
  columns: DepartmentEventColumn[]
  rows: DepartmentEventRow[]
  total: number
  page: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <section className="rounded-xl border bg-card text-card-foreground">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Last 12 Months</h2>
        <p className="text-sm text-muted-foreground">
          Events that match the filters above.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No events in this window.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${row.appId ?? "app"}-${row.eventName ?? "event"}-${row.employeeId ?? "employee"}-${row.eventDate ?? "date"}-${index}`}
                  className="border-b last:border-0"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-3 py-2.5 whitespace-nowrap"
                    >
                      {formatDepartmentEventValue(
                        row[column.key],
                        column.format
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-4">
        <DataTablePagination
          page={page}
          totalItems={total}
          pageSize={DEPARTMENT_EVENT_PAGE_SIZE}
          onPageChange={(nextPage) => {
            const next = new URLSearchParams(searchParams.toString())
            if (nextPage <= 1) {
              next.delete("page")
            } else {
              next.set("page", String(nextPage))
            }
            const query = next.toString()
            router.push(query ? `${pathname}?${query}` : pathname)
          }}
        />
      </div>
    </section>
  )
}
