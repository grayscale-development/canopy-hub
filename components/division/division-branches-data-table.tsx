"use client"

import Link from "next/link"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDownIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DivisionBranchSummary } from "@/lib/hub-data"

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function DivisionBranchesDataTable({
  rows,
}: {
  rows: DivisionBranchSummary[]
}) {
  const pageSize = 50
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "fileCount",
      desc: true,
    },
  ])
  const [pageIndex, setPageIndex] = useState(0)

  const columns = useMemo<ColumnDef<DivisionBranchSummary>[]>(
    () => [
      {
        accessorKey: "branchName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-2 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Branch
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <Link
            href={`/branch/${encodeURIComponent(row.original.branchId)}`}
            className="font-medium text-link underline decoration-primary/60 underline-offset-4 transition-colors hover:no-underline"
          >
            {row.original.branchName}
          </Link>
        ),
      },
      {
        accessorKey: "fileCount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="ml-auto h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            #
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.fileCount}</span>
        ),
      },
      {
        accessorKey: "totalVolume",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="ml-auto h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            $
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {CURRENCY_FORMATTER.format(row.original.totalVolume)}
          </span>
        ),
      },
    ],
    []
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      if (typeof updater === "function") {
        const next = updater({ pageIndex, pageSize })
        setPageIndex(next.pageIndex)
        return
      }

      setPageIndex(updater.pageIndex)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.id === "branchName" ? "" : "text-right"}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cell.column.id === "branchName" ? "" : "text-right"}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        page={table.getState().pagination.pageIndex + 1}
        totalItems={rows.length}
        onPageChange={(nextPage) => table.setPageIndex(nextPage - 1)}
        pageSize={pageSize}
      />
    </div>
  )
}
