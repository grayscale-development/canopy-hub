"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { PointsSpecialistsMonthlyPoint } from "@/lib/hub-data"

const chartConfig = {
  points: {
    label: "Points",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const POINTS_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function PointsSummaryChart({
  rows,
}: {
  rows: PointsSpecialistsMonthlyPoint[]
}) {
  const chartData = rows.map((row) => ({
    label: row.label,
    points: row.totalPoints,
  }))

  return (
    <ChartContainer config={chartConfig} className="h-[340px] w-full">
      <BarChart
        data={chartData}
        margin={{
          top: 28,
          right: 12,
          left: 0,
          bottom: 0,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={14} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={54}
          domain={[0, (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.1))]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-2">
                  <span>Points</span>
                  <span className="font-mono tabular-nums">
                    {POINTS_FORMATTER.format(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="points"
          fill="var(--color-points)"
          radius={[6, 6, 0, 0]}
          barSize={22}
        >
          <LabelList
            dataKey="points"
            position="top"
            offset={8}
            className="fill-foreground text-[10px]"
            formatter={(value) => POINTS_FORMATTER.format(Number(value))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
