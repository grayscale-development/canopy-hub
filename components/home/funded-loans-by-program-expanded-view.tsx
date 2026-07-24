"use client"

import { Cell, Label, Pie, PieChart } from "recharts"

import { formatCompactCurrency } from "@/lib/hub-metrics"
import type { PreviousMonthLoanProgramSummaryRow } from "@/lib/hub-data"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const SLICE_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
] as const

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const chartConfig = {
  fundedCount: {
    label: "Funded Loans",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

type ChartRow = {
  programName: string
  fundedCount: number
  fundedVolume: number
  fill: string
  percent: number
}

function toGroupedRows(rows: PreviousMonthLoanProgramSummaryRow[]) {
  const sortedRows = [...rows].sort((left, right) => {
    if (right.fundedCount !== left.fundedCount) {
      return right.fundedCount - left.fundedCount
    }
    if (right.fundedVolume !== left.fundedVolume) {
      return right.fundedVolume - left.fundedVolume
    }
    return left.programName.localeCompare(right.programName)
  })

  const topRows = sortedRows.slice(0, 7)
  const remainingRows = sortedRows.slice(7)
  const alternativeFundedCount = remainingRows.reduce(
    (sum, row) => sum + row.fundedCount,
    0
  )
  const alternativeFundedVolume = remainingRows.reduce(
    (sum, row) => sum + row.fundedVolume,
    0
  )

  const groupedRows = [...topRows]
  if (alternativeFundedCount > 0) {
    const existingAlternativeIndex = groupedRows.findIndex(
      (row) => row.programName.toLowerCase() === "alternative"
    )

    if (existingAlternativeIndex >= 0) {
      const existing = groupedRows[existingAlternativeIndex]
      groupedRows[existingAlternativeIndex] = {
        ...existing,
        fundedCount: existing.fundedCount + alternativeFundedCount,
        fundedVolume: existing.fundedVolume + alternativeFundedVolume,
      }
    } else {
      groupedRows.push({
        programName: "Alternative",
        fundedCount: alternativeFundedCount,
        fundedVolume: alternativeFundedVolume,
      })
    }
  }

  const totalFunded = groupedRows.reduce((sum, row) => sum + row.fundedCount, 0)
  const totalVolume = groupedRows.reduce(
    (sum, row) => sum + row.fundedVolume,
    0
  )

  const chartRows: ChartRow[] = groupedRows.map((row, index) => {
    const percent = totalFunded > 0 ? (row.fundedCount / totalFunded) * 100 : 0

    return {
      ...row,
      fill: SLICE_COLORS[index % SLICE_COLORS.length],
      percent,
    }
  })

  return {
    chartRows,
    totalFunded,
    totalVolume,
  }
}

export function FundedLoansByProgramExpandedView({
  rows,
  monthLabel,
}: {
  rows: PreviousMonthLoanProgramSummaryRow[]
  monthLabel: string
}) {
  const { chartRows, totalFunded, totalVolume } = toGroupedRows(rows)

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[1.3fr_1fr]">
      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Funded Loans by Loan Program
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{monthLabel}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono text-foreground tabular-nums">
              {INTEGER_FORMATTER.format(totalFunded)} loans
            </p>
            <p className="font-mono text-muted-foreground tabular-nums">
              {CURRENCY_FORMATTER.format(totalVolume)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <ChartContainer
            config={chartConfig}
            className="!aspect-auto h-[72vh] w-full"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => {
                      const payload = item.payload as {
                        programName?: string
                        fundedVolume?: number
                      }

                      return (
                        <div className="grid w-full gap-1">
                          <div className="font-medium">
                            {payload.programName || "Unknown Program"}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Funded Loans</span>
                            <span className="font-mono tabular-nums">
                              {INTEGER_FORMATTER.format(Number(value))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Funded Volume</span>
                            <span className="font-mono tabular-nums">
                              {formatCompactCurrency(
                                Number(payload.fundedVolume ?? 0)
                              )}
                            </span>
                          </div>
                        </div>
                      )
                    }}
                  />
                }
              />
              <Pie
                data={chartRows}
                dataKey="fundedCount"
                nameKey="programName"
                innerRadius="48%"
                outerRadius="78%"
                strokeWidth={2}
              >
                {chartRows.map((entry) => (
                  <Cell key={entry.programName} fill={entry.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                      return null
                    }

                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-semibold"
                        >
                          {INTEGER_FORMATTER.format(totalFunded)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy + 22}
                          className="fill-muted-foreground text-sm"
                        >
                          Funded Loans
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="text-xl font-semibold">Program Breakdown</h2>

        <div className="mt-4 space-y-3">
          {chartRows.map((entry) => (
            <div
              key={`program-row-${entry.programName}`}
              className="rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <p
                    className="truncate text-sm font-medium"
                    title={entry.programName}
                  >
                    {entry.programName}
                  </p>
                </div>
                <p className="font-mono text-sm text-muted-foreground tabular-nums">
                  {PERCENT_FORMATTER.format(entry.percent)}%
                </p>
              </div>

              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.min(100, entry.percent))}%`,
                    backgroundColor: entry.fill,
                  }}
                />
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/50 px-2 py-1">
                  <p className="text-muted-foreground">Loans</p>
                  <p className="font-mono text-sm text-foreground tabular-nums">
                    {INTEGER_FORMATTER.format(entry.fundedCount)}
                  </p>
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1">
                  <p className="text-muted-foreground">Volume</p>
                  <p className="font-mono text-sm text-foreground tabular-nums">
                    {CURRENCY_FORMATTER.format(entry.fundedVolume)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
