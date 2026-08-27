"use client"

import { Cell, Label, Pie, PieChart } from "recharts"

import { formatCompactCurrency } from "@/lib/hub-metrics"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface FundedLoansByProgramPieChartRow {
  programName: string
  fundedCount: number
  fundedVolume: number
}

interface FundedLoansByProgramPieChartProps {
  rows: FundedLoansByProgramPieChartRow[]
}

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
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

export function FundedLoansByProgramPieChart({
  rows,
}: FundedLoansByProgramPieChartProps) {
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

  const chartData = groupedRows.map((row, index) => ({
    programName: row.programName,
    fundedCount: row.fundedCount,
    fundedVolume: row.fundedVolume,
    fill: SLICE_COLORS[index % SLICE_COLORS.length],
  }))

  return (
    <>
      <ChartContainer
        config={chartConfig}
        className="mx-auto h-[260px] w-full max-w-[320px]"
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
            data={chartData}
            dataKey="fundedCount"
            nameKey="programName"
            innerRadius={58}
            outerRadius={92}
            strokeWidth={2}
          >
            {chartData.map((entry) => (
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
                      className="fill-foreground text-lg font-semibold"
                    >
                      {INTEGER_FORMATTER.format(totalFunded)}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy + 16}
                      className="fill-muted-foreground text-[11px]"
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
      <div className="mt-3 space-y-1.5">
        {chartData.map((entry) => {
          const percent =
            totalFunded > 0 ? (entry.fundedCount / totalFunded) * 100 : 0

          return (
            <div
              key={`legend-${entry.programName}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="truncate" title={entry.programName}>
                  {entry.programName}
                </span>
              </div>
              <span className="font-mono text-muted-foreground tabular-nums">
                {PERCENT_FORMATTER.format(percent)}%
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
