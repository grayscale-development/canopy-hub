"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { DataTablePagination } from "@/components/ui/data-table-pagination"
import type { DivisionEmployeeSummary } from "@/lib/hub-data"

type DivisionEmployeesTableProps = {
  rows: DivisionEmployeeSummary[]
}

export function DivisionEmployeesTable({ rows }: DivisionEmployeesTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const pagedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize
    return rows.slice(startIndex, startIndex + pageSize)
  }, [rows, safePage, pageSize])

  return (
    <div className="mt-4">
      <div className="max-w-full overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Roles</th>
              <th className="px-4 py-2.5 text-right font-medium">Touches</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((employee) => (
              <tr key={employee.userId} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/employee/${encodeURIComponent(employee.userId)}`}
                    className="font-medium text-link underline decoration-primary/60 underline-offset-4 transition-colors hover:no-underline"
                  >
                    {employee.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {employee.email ?? "—"}
                </td>
                <td className="px-4 py-2.5">{employee.roles.join(", ") || "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {employee.fileTouches}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataTablePagination
        page={safePage}
        totalItems={rows.length}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
      />
    </div>
  )
}
