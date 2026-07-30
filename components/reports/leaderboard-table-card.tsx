import Link from "next/link"

import { AutoScrollArea } from "@/components/ui/auto-scroll-area"

export type LeaderboardRow = {
  id: string | null
  name: string
  fileCount: number
  totalVolume: number
  rowHref?: string
  fileViewerHref: string
}

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function LeaderboardTableCard({
  title,
  subtitle,
  rows,
  emptyLabel,
}: {
  title: string
  subtitle: string
  rows: LeaderboardRow[]
  emptyLabel: string
}) {
  const renderRows = () =>
    rows.map((row, index) => (
      <tr
        key={`${row.id ?? row.name}-${index}`}
        className="border-b last:border-0"
      >
        <td className="w-10 px-2 py-2 text-center font-mono text-xs font-semibold text-muted-foreground tabular-nums">
          {index + 1}
        </td>
        <td className="px-2 py-2">
          {row.rowHref ? (
            <Link
              href={row.rowHref}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <span className="truncate">{row.name}</span>
            </Link>
          ) : (
            <span className="block truncate text-sm">{row.name}</span>
          )}
        </td>
        <td className="w-[70px] px-2 py-2 text-right font-mono text-base tabular-nums">
          <Link
            href={row.fileViewerHref}
            className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            {INTEGER_FORMATTER.format(row.fileCount)}
          </Link>
        </td>
        <td
          className="w-[118px] px-2 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums"
          title={CURRENCY_FORMATTER.format(row.totalVolume)}
        >
          {CURRENCY_FORMATTER.format(row.totalVolume)}
        </td>
      </tr>
    ))

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card p-4 text-card-foreground md:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <AutoScrollArea
            className="leaderboard-scroll-viewport min-h-0 flex-1"
            pixelsPerSecond={36}
          >
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted text-left text-muted-foreground">
                  <th className="w-10 px-2 py-2 text-center font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="w-[70px] px-2 py-2 text-right font-medium">
                    Files
                  </th>
                  <th className="w-[118px] px-2 py-2 text-right font-medium">
                    $
                  </th>
                </tr>
              </thead>
              <tbody>{renderRows()}</tbody>
            </table>
          </AutoScrollArea>
        </div>
      )}
    </section>
  )
}
