"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { DataTablePagination } from "@/components/ui/data-table-pagination"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface FileViewerRow {
  externalRowKey: string
  divisionId: string | null
  branchId: string | null
  loanOfficerId: string | null
  processorId: string | null
  underwriterId: string | null
  underwritingOrgId: string | null
  loanNumber: string | null
  borrower: string | null
  address: string | null
  cityStateZip: string | null
  loanType: string | null
  loanPurpose: string | null
  loanTerm: number | null
  investor: string | null
  division: string | null
  branch: string | null
  loanOfficer: string | null
  processor: string | null
  underwriter: string | null
  underwritingOrg: string | null
  closer: string | null
  funder: string | null
  lastStatus: string | null
  estimatedClosingDate: string | null
  fundedDate: string | null
  closedDate: string | null
  loanAmount: number
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(value: string | null) {
  if (!value) {
    return "—"
  }

  const parsedDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return DATE_FORMATTER.format(parsedDate)
}

function displayOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "—"
  }

  if (typeof value === "string") {
    return value.trim() ? value : "—"
  }

  return String(value)
}

const DETAIL_FIELDS: Array<{
  label: string
  key: keyof FileViewerRow
  format?: (value: string | number | null) => string
}> = [
  { label: "Loan No.", key: "loanNumber" },
  { label: "Borrower", key: "borrower" },
  { label: "Address", key: "address" },
  { label: "City, State, Zip", key: "cityStateZip" },
  { label: "Loan Type", key: "loanType" },
  { label: "Loan Purpose", key: "loanPurpose" },
  {
    label: "Loan Term",
    key: "loanTerm",
    format: (value) => {
      const term = Number(value)
      if (!Number.isFinite(term) || term <= 0) {
        return "—"
      }

      return `${Math.trunc(term)}`
    },
  },
  { label: "Investor", key: "investor" },
  { label: "Division", key: "division" },
  { label: "Branch", key: "branch" },
  { label: "Loan Officer", key: "loanOfficer" },
  { label: "Processor", key: "processor" },
  { label: "Underwriter", key: "underwriter" },
  { label: "Closer", key: "closer" },
  { label: "Funder", key: "funder" },
  { label: "Last Status", key: "lastStatus" },
  {
    label: "Est. Closing Date",
    key: "estimatedClosingDate",
    format: (value) => formatDate(typeof value === "string" ? value : null),
  },
  {
    label: "Funded Date",
    key: "fundedDate",
    format: (value) => formatDate(typeof value === "string" ? value : null),
  },
  {
    label: "Closed Date",
    key: "closedDate",
    format: (value) => formatDate(typeof value === "string" ? value : null),
  },
  {
    label: "Loan Amount",
    key: "loanAmount",
    format: (value) =>
      CURRENCY_FORMATTER.format(
        Number.isFinite(Number(value)) ? Number(value) : 0
      ),
  },
]

export function FilesTableWithDetails({ rows }: { rows: FileViewerRow[] }) {
  const [selectedRow, setSelectedRow] = useState<FileViewerRow | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  const searchedRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return rows
    }

    return rows.filter((row) => {
      const searchableValues = [
        row.loanNumber,
        row.borrower,
        row.address,
        row.cityStateZip,
        row.loanType,
        row.loanPurpose,
        row.loanTerm,
        row.investor,
        row.division,
        row.branch,
        row.loanOfficer,
        row.processor,
        row.underwriter,
        row.underwritingOrg,
        row.closer,
        row.funder,
        row.lastStatus,
        row.estimatedClosingDate,
        row.fundedDate,
        row.closedDate,
        row.loanAmount,
        CURRENCY_FORMATTER.format(row.loanAmount),
        formatDate(row.estimatedClosingDate),
        formatDate(row.fundedDate),
        formatDate(row.closedDate),
      ]

      return searchableValues
        .map((value) => displayOrDash(value).toLowerCase())
        .join(" ")
        .includes(normalizedQuery)
    })
  }, [rows, searchQuery])

  const totalPages = Math.max(1, Math.ceil(searchedRows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pagedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize
    return searchedRows.slice(startIndex, startIndex + pageSize)
  }, [pageSize, safePage, searchedRows])

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Input
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value)
            setCurrentPage(1)
          }}
          placeholder="Search all fields"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {searchedRows.length} result{searchedRows.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Loan No.
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Borrower
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Address
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                City, State, Zip
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Loan Type
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Loan Purpose
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Loan Term
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Investor
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Division
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Branch
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Loan Officer
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Processor
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Underwriter
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Closer
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Funder
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Last Status
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Est. Closing Date
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Funded Date
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Closed Date
              </th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                Loan Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {searchedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={20}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No files match your search.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr
                  key={row.externalRowKey}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                  onClick={() => setSelectedRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setSelectedRow(row)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                    {displayOrDash(row.loanNumber)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.borrower)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.address)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.cityStateZip)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.loanType)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.loanPurpose)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.loanTerm)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.investor)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.division)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.branchId && row.branch ? (
                      <Link
                        href={`/branch/${encodeURIComponent(row.branchId)}`}
                        className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.branch}
                      </Link>
                    ) : (
                      displayOrDash(row.branch)
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.loanOfficerId && row.loanOfficer ? (
                      <Link
                        href={`/employee/${encodeURIComponent(row.loanOfficerId)}`}
                        className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.loanOfficer}
                      </Link>
                    ) : (
                      displayOrDash(row.loanOfficer)
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.processorId && row.processor ? (
                      <Link
                        href={`/employee/${encodeURIComponent(row.processorId)}`}
                        className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.processor}
                      </Link>
                    ) : (
                      displayOrDash(row.processor)
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.underwriterId && row.underwriter ? (
                      <Link
                        href={`/employee/${encodeURIComponent(row.underwriterId)}`}
                        className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {row.underwriter}
                      </Link>
                    ) : (
                      displayOrDash(row.underwriter)
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.closer)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.funder)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {displayOrDash(row.lastStatus)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatDate(row.estimatedClosingDate)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatDate(row.fundedDate)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatDate(row.closedDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                    {CURRENCY_FORMATTER.format(row.loanAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {searchedRows.length > 0 ? (
        <DataTablePagination
          page={safePage}
          totalItems={searchedRows.length}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
        />
      ) : null}

      <Dialog
        open={Boolean(selectedRow)}
        onOpenChange={(open) => !open && setSelectedRow(null)}
      >
        <DialogContent className="max-h-[88vh] w-[min(96vw,72rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              File Details
              {selectedRow?.loanNumber ? ` | ${selectedRow.loanNumber}` : ""}
              {selectedRow?.borrower ? ` | ${selectedRow.borrower}` : ""}
            </DialogTitle>
            <DialogDescription>
              Complete file information for the selected loan.
            </DialogDescription>
          </DialogHeader>
          {selectedRow ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DETAIL_FIELDS.map((field) => {
                const rawValue = selectedRow[field.key] as
                  | string
                  | number
                  | null
                const renderedValue = field.format
                  ? field.format(rawValue)
                  : displayOrDash(rawValue)

                return (
                  <div key={field.key}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </p>
                    <p className="mt-1 text-sm font-medium">{renderedValue}</p>
                  </div>
                )
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
