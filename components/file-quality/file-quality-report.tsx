import { FileQualityMonthPicker } from "@/components/file-quality/file-quality-month-picker"
import { FileQualityRollupTable } from "@/components/file-quality/file-quality-rollup-table"
import type {
  fetchFileQualityRollupsForMonth,
  FileQualityMonthOption,
} from "@/lib/hub-data"

type FileQualityRollups = Awaited<
  ReturnType<typeof fetchFileQualityRollupsForMonth>
>

export function FileQualityReport({
  monthOptions,
  selectedMonth,
  divisionRows,
  branchRows,
  hasExpectedTouches,
  hasNetTouches,
  hasExpectedAndNetMetrics,
  className = "flex min-w-0 flex-1 flex-col gap-4 p-4",
}: {
  monthOptions: FileQualityMonthOption[]
  selectedMonth: FileQualityMonthOption
  divisionRows: FileQualityRollups["divisionRows"]
  branchRows: FileQualityRollups["branchRows"]
  hasExpectedTouches: boolean
  hasNetTouches: boolean
  hasExpectedAndNetMetrics: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <div className="px-1 py-2">
        <h1 className="text-3xl font-semibold tracking-tight">File Quality</h1>
      </div>

      <div className="rounded-xl border bg-card p-4 text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FileQualityMonthPicker
            options={monthOptions}
            selectedMonthKey={selectedMonth.monthKey}
          />
          <p className="text-xs text-muted-foreground">
            Showing funded files for {selectedMonth.label}
          </p>
        </div>
      </div>

      {!hasExpectedAndNetMetrics ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          {!hasExpectedTouches && !hasNetTouches ? (
            <>
              The current file quality source is missing valid values for
              <span className="font-medium"> AVG Expected Touches </span>
              and
              <span className="font-medium"> Net Touches</span>. Those columns
              are temporarily unavailable.
            </>
          ) : null}
          {hasExpectedTouches && !hasNetTouches ? (
            <>
              The current file quality source is missing valid values for
              <span className="font-medium"> Net Touches</span>. That column is
              temporarily unavailable.
            </>
          ) : null}
          {!hasExpectedTouches && hasNetTouches ? (
            <>
              The current file quality source is missing valid values for
              <span className="font-medium"> AVG Expected Touches</span>. That
              column is temporarily unavailable.
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <FileQualityRollupTable
          title="By Division"
          entityLabel="Division"
          rows={divisionRows}
        />
        <FileQualityRollupTable
          title="By Branch"
          entityLabel="Branch"
          rows={branchRows}
        />
      </div>
    </div>
  )
}
