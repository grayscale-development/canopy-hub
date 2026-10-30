import { DepartmentEventTable } from "@/components/department-dashboard/department-event-table"
import { DepartmentFilters } from "@/components/department-dashboard/department-filters"
import { DepartmentMetricTable } from "@/components/department-dashboard/department-metric-table"
import type {
  DepartmentDashboard,
  DepartmentDashboardConfig,
  DepartmentDashboardQuery,
} from "@/lib/department-dashboard"
import { formatDepartmentWindowDate } from "@/lib/department-dashboard"

export function DepartmentDashboardView({
  config,
  dashboard,
  query,
}: {
  config: DepartmentDashboardConfig
  dashboard: DepartmentDashboard
  query: DepartmentDashboardQuery
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="px-1 py-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {config.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {formatDepartmentWindowDate(dashboard.windowStart)} –{" "}
          {formatDepartmentWindowDate(dashboard.windowEnd)}. Company Avg is the
          unweighted average of the rows in that table.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 text-card-foreground">
        <DepartmentFilters
          filters={dashboard.filters}
          branchId={query.branchId}
          eventMonth={query.eventMonth ? query.eventMonth.slice(0, 7) : null}
          eventWeek={query.eventWeek}
          eventName={query.eventName}
          orgId={query.orgId}
          orgLabel="Org"
        />
      </div>

      {config.unavailableNote ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          {config.unavailableNote}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <DepartmentMetricTable
          title={config.entityPlural}
          nameLabel={config.entityLabel}
          columns={config.metricColumns}
          rows={dashboard.employees}
          linkEmployees
        />
        <DepartmentMetricTable
          title="Organizations"
          nameLabel={config.orgLabel}
          columns={config.metricColumns}
          rows={dashboard.organizations}
        />
      </div>

      <DepartmentEventTable
        columns={config.eventColumns}
        rows={dashboard.events.rows}
        total={dashboard.events.total}
        page={query.page}
      />
    </div>
  )
}
