"use client"

import {
  Bar,
  LabelList,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { formatCompactCurrency } from "@/lib/hub-metrics"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

interface CanopyProductionChartProps {
  labels: string[]
  monthlyFundedCounts: number[]
  monthlyFundedVolumes: number[]
  className?: string
}

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})
const MIN_BAR_HEIGHT_FOR_INSIDE_LABEL = 26

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function renderBarLabel(props: {
  x?: unknown
  y?: unknown
  width?: unknown
  height?: unknown
  value?: unknown
}) {
  const { x, y, width, height, value } = props
  const labelValue = NUMBER_FORMATTER.format(toFiniteNumber(value))
  const safeX = toFiniteNumber(x)
  const safeY = toFiniteNumber(y)
  const safeWidth = toFiniteNumber(width)
  const safeHeight = toFiniteNumber(height)
  const centerX = safeX + safeWidth / 2
  const canRenderInside = safeHeight >= MIN_BAR_HEIGHT_FOR_INSIDE_LABEL
  const labelWidth = Math.max(22, labelValue.length * 6 + 10)
  const labelHeight = 14
  const labelX = centerX - labelWidth / 2

  if (canRenderInside) {
    const labelY = safeY + 4
    return (
      <g>
        <rect
          x={labelX}
          y={labelY}
          width={labelWidth}
          height={labelHeight}
          rx={4}
          fill="rgba(15, 23, 42, 0.78)"
        />
        <text
          x={centerX}
          y={labelY + 10}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={10}
          fontWeight={600}
        >
          {labelValue}
        </text>
      </g>
    )
  }

  const labelY = Math.max(2, safeY - labelHeight - 4)
  return (
    <g>
      <rect
        x={labelX}
        y={labelY}
        width={labelWidth}
        height={labelHeight}
        rx={4}
        fill="rgba(15, 23, 42, 0.78)"
      />
      <text
        x={centerX}
        y={labelY + 10}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={10}
        fontWeight={600}
      >
        {labelValue}
      </text>
    </g>
  )
}

const chartConfig = {
  fundedCount: {
    label: "Funded Loans",
    color: "var(--chart-1)",
  },
  fundedVolume: {
    label: "Funded Volume",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function CanopyProductionChart({
  labels,
  monthlyFundedCounts,
  monthlyFundedVolumes,
  className,
}: CanopyProductionChartProps) {
  const data = labels.map((label, index) => ({
    label,
    fundedCount: monthlyFundedCounts[index] ?? 0,
    fundedVolume: monthlyFundedVolumes[index] ?? 0,
  }))

  if (
    data.every(
      ({ fundedCount, fundedVolume }) => fundedCount === 0 && fundedVolume === 0
    )
  ) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No funded loans in the last 12 months.
      </div>
    )
  }

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("h-[360px] w-full", className)}
    >
      <ComposedChart
        data={data}
        margin={{
          top: 30,
          right: 16,
          left: 0,
          bottom: 0,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={14}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
          domain={[
            0,
            (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.1)),
          ]}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={66}
          domain={[
            0,
            (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.1)),
          ]}
          tickFormatter={(value) => formatCompactCurrency(Number(value))}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                if (name === "fundedVolume") {
                  return (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span>Funded Volume</span>
                      <span className="font-mono tabular-nums">
                        {formatCompactCurrency(Number(value))}
                      </span>
                    </div>
                  )
                }

                return (
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>Funded Loans</span>
                    <span className="font-mono tabular-nums">
                      {NUMBER_FORMATTER.format(Number(value))}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          yAxisId="left"
          dataKey="fundedCount"
          fill="var(--color-fundedCount)"
          radius={[6, 6, 0, 0]}
          barSize={22}
        >
          <LabelList dataKey="fundedCount" content={renderBarLabel} />
        </Bar>
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="fundedVolume"
          stroke="var(--color-fundedVolume)"
          strokeWidth={2}
          dot={{ r: 0 }}
          activeDot={{ r: 5 }}
        >
          <LabelList
            dataKey="fundedVolume"
            position="top"
            offset={14}
            className="fill-foreground text-[10px]"
            formatter={(value) => formatCompactCurrency(toFiniteNumber(value))}
          />
        </Line>
      </ComposedChart>
    </ChartContainer>
  )
}
