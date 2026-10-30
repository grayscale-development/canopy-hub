export const DEPARTMENT_EVENT_PAGE_SIZE = 100

export type DepartmentId = "processing" | "underwriting"

export type MetricFormat = "count" | "decimal" | "percent"

export type EventValueFormat =
  | "text"
  | "date"
  | "decimal"
  | "integer"
  | "boolean"

export type DepartmentMetricColumn = {
  key: string
  label: string
  format: MetricFormat
  hint?: string
  unavailable?: boolean
}

export type DepartmentEventColumn = {
  key: keyof DepartmentEventRow
  label: string
  format: EventValueFormat
}

export type DepartmentFilterOption = {
  id: string
  label: string
}

export type DepartmentMetricRow = {
  rowKind: "company_avg" | "employee" | "organization"
  id: string | null
  label: string
  metrics: Record<string, number | null>
}

export type DepartmentEventRow = {
  appId: string | null
  organizationId: string | null
  organizationName: string | null
  loanProgramCode: string | null
  employeeId: string | null
  employeeName: string | null
  eventName: string | null
  eventDate: string | null
  points: number | null
  branchId: string | null
  branchName: string | null
  processingNetWorkdays: number | null
  releasedToCloser: string | null
  closingDeadline: string | null
  docsToClosing: number | null
  isClosingFundingRush: boolean | null
  submittedForInitialReview: string | null
  initialReviewComplete: string | null
  workdaysInInitialReview: number | null
  qcCount: number | null
  avgQcScore: number | null
  isBadLoan: boolean | null
}

export type DepartmentDashboardFilters = {
  branches: DepartmentFilterOption[]
  months: DepartmentFilterOption[]
  weeks: DepartmentFilterOption[]
  events: DepartmentFilterOption[]
  orgs: DepartmentFilterOption[]
}

export type DepartmentDashboard = {
  department: DepartmentId
  windowStart: string
  windowEnd: string
  filters: DepartmentDashboardFilters
  employees: DepartmentMetricRow[]
  organizations: DepartmentMetricRow[]
  events: {
    total: number
    limit: number
    offset: number
    rows: DepartmentEventRow[]
  }
}

export type DepartmentDashboardQuery = {
  branchId: string | null
  eventMonth: string | null
  eventWeek: string | null
  eventName: string | null
  orgId: string | null
  page: number
}

export type DepartmentDashboardConfig = {
  id: DepartmentId
  title: string
  description: string
  href: string
  entityLabel: string
  entityPlural: string
  orgLabel: string
  metricColumns: DepartmentMetricColumn[]
  eventColumns: DepartmentEventColumn[]
  unavailableNote: string | null
}

const COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

const DECIMAL_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const PROCESSING_METRIC_COLUMNS: DepartmentMetricColumn[] = [
  {
    key: "total_funded",
    label: "Total Funded",
    format: "count",
    hint: "Count of Funded events.",
  },
  {
    key: "processing_events",
    label: "Processing Events",
    format: "count",
    hint: "Count of event rows, including Funded.",
  },
  { key: "points", label: "Points", format: "decimal", hint: "Sum of Points." },
  {
    key: "processing_speed",
    label: "Processing Speed",
    format: "decimal",
    hint: "Average Processing Net Workdays.",
  },
  {
    key: "docs_to_deadline",
    label: "Docs to Deadline",
    format: "decimal",
    hint: "Average Docs to Closing.",
  },
  {
    key: "rush_ratio",
    label: "Rush %",
    format: "percent",
    hint: "Rush funded events divided by funded events.",
  },
]

const UNDERWRITING_METRIC_COLUMNS: DepartmentMetricColumn[] = [
  { key: "points", label: "Points", format: "decimal", hint: "Sum of Points." },
  {
    key: "total_funded",
    label: "Total Funded",
    format: "count",
    hint: "Count of Funded events.",
  },
  {
    key: "initial_review_events",
    label: "Initial Review Events",
    format: "count",
    hint: "Count of Initial Review Complete events.",
  },
  {
    key: "avg_workdays_initial_review",
    label: "Avg Workdays in Initial Review",
    format: "decimal",
    hint: "Average Workdays in Initial Review on Initial Review Complete events.",
  },
  {
    key: "final_underwriting_events",
    label: "Final Underwriting Events",
    format: "count",
    hint: "Count of Final Underwrite events.",
  },
  {
    key: "avg_workdays_underwriting",
    label: "Avg Workdays in Underwriting",
    format: "decimal",
    unavailable: true,
    hint: "The Last 12 Months extract has no underwriting workday column.",
  },
  {
    key: "condition_events",
    label: "Condition Events",
    format: "count",
    hint: "Count of events whose name contains “condition”.",
  },
  {
    key: "avg_workdays_conditions",
    label: "Avg Workdays in Conditions",
    format: "decimal",
    unavailable: true,
    hint: "The Last 12 Months extract has no conditions workday column.",
  },
  {
    key: "bad_loan_ratio",
    label: "Bad Loan %",
    format: "percent",
    hint: "Funded events marked bad divided by funded events.",
  },
]

const SHARED_EVENT_COLUMNS: DepartmentEventColumn[] = [
  { key: "eventDate", label: "Date", format: "date" },
  { key: "appId", label: "AppId", format: "text" },
  { key: "employeeName", label: "Employee", format: "text" },
  { key: "eventName", label: "Event", format: "text" },
  { key: "organizationName", label: "Organization", format: "text" },
  { key: "branchName", label: "Branch", format: "text" },
  { key: "loanProgramCode", label: "Loan Program Code", format: "text" },
  { key: "points", label: "Points", format: "decimal" },
]

const PROCESSING_EVENT_COLUMNS: DepartmentEventColumn[] = [
  ...SHARED_EVENT_COLUMNS,
  {
    key: "processingNetWorkdays",
    label: "Processing Net Workdays",
    format: "decimal",
  },
  { key: "docsToClosing", label: "Docs to Closing", format: "decimal" },
  { key: "releasedToCloser", label: "Released to Closer", format: "date" },
  { key: "closingDeadline", label: "Closing Deadline", format: "date" },
  {
    key: "isClosingFundingRush",
    label: "Is Closing/Funding Rush",
    format: "boolean",
  },
]

const UNDERWRITING_EVENT_COLUMNS: DepartmentEventColumn[] = [
  ...SHARED_EVENT_COLUMNS,
  {
    key: "submittedForInitialReview",
    label: "Submitted for Initial Review",
    format: "date",
  },
  {
    key: "initialReviewComplete",
    label: "Initial Review Complete",
    format: "date",
  },
  {
    key: "workdaysInInitialReview",
    label: "Workdays in Initial Review",
    format: "decimal",
  },
  { key: "qcCount", label: "# of QCs", format: "integer" },
  { key: "avgQcScore", label: "Avg QC Score", format: "decimal" },
  { key: "isBadLoan", label: "IsBadLoan", format: "boolean" },
]

export const DEPARTMENT_DASHBOARDS: Record<
  DepartmentId,
  DepartmentDashboardConfig
> = {
  processing: {
    id: "processing",
    title: "Processing",
    description:
      "Review processor and processing-organization production from the last 12 months of events.",
    href: "/reports/processing",
    entityLabel: "Processor",
    entityPlural: "Processors",
    orgLabel: "Processing Organization",
    metricColumns: PROCESSING_METRIC_COLUMNS,
    eventColumns: PROCESSING_EVENT_COLUMNS,
    unavailableNote: null,
  },
  underwriting: {
    id: "underwriting",
    title: "Underwriting",
    description:
      "Review underwriter and underwriting-organization production from the last 12 months of events.",
    href: "/reports/underwriting",
    entityLabel: "Underwriter",
    entityPlural: "Underwriters",
    orgLabel: "Underwriting Organization",
    metricColumns: UNDERWRITING_METRIC_COLUMNS,
    eventColumns: UNDERWRITING_EVENT_COLUMNS,
    unavailableNote:
      "Avg Workdays in Underwriting and Avg Workdays in Conditions are not on the Last 12 Months event extract, so those columns stay blank.",
  },
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ""
  return trimmed || null
}

function parseIsoDate(value: string | null) {
  if (!value || !ISO_DATE.test(value)) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString().slice(0, 10) === value ? value : null
}

export function parseDepartmentDashboardQuery(
  searchParams: Record<string, string | string[] | undefined>
): DepartmentDashboardQuery {
  const month = firstParam(searchParams.month)
  const monthMatch = month?.match(MONTH_KEY)
  const monthNumber = monthMatch ? Number(monthMatch[2]) : 0
  const eventMonth =
    monthMatch && monthNumber >= 1 && monthNumber <= 12
      ? `${monthMatch[1]}-${monthMatch[2]}-01`
      : null
  const page = Number(firstParam(searchParams.page) ?? "1")

  return {
    branchId: firstParam(searchParams.branch),
    eventMonth,
    eventWeek: parseIsoDate(firstParam(searchParams.week)),
    eventName: firstParam(searchParams.event),
    orgId: firstParam(searchParams.org),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

export function formatDepartmentMetric(
  value: number | null | undefined,
  format: MetricFormat
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—"
  }

  if (format === "percent") {
    return PERCENT_FORMATTER.format(value)
  }

  if (format === "decimal") {
    return DECIMAL_FORMATTER.format(value)
  }

  return COUNT_FORMATTER.format(value)
}

export function formatDepartmentEventValue(
  value: DepartmentEventRow[keyof DepartmentEventRow],
  format: EventValueFormat
) {
  if (value === null || value === undefined || value === "") {
    return "—"
  }

  if (format === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : "—"
  }

  if (format === "date" && typeof value === "string") {
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return DATE_FORMATTER.format(parsed)
  }

  if (format === "integer" && typeof value === "number") {
    return COUNT_FORMATTER.format(value)
  }

  if (format === "decimal" && typeof value === "number") {
    return DECIMAL_FORMATTER.format(value)
  }

  return String(value)
}

export function formatDepartmentWindowDate(isoDate: string) {
  return formatDepartmentEventValue(isoDate, "date")
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asText(value: unknown) {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function asOptions(value: unknown): DepartmentFilterOption[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const record = asRecord(item)
    if (!record) {
      return []
    }
    const id = asText(record.id)
    const label = asText(record.label) ?? id
    if (!id || !label) {
      return []
    }
    return [{ id, label }]
  })
}

function asMetricRow(value: unknown): DepartmentMetricRow | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  const rowKind = record.row_kind
  if (
    rowKind !== "company_avg" &&
    rowKind !== "employee" &&
    rowKind !== "organization"
  ) {
    return null
  }
  const label = asText(record.label)
  const metricsRecord = asRecord(record.metrics)
  if (!label || !metricsRecord) {
    return null
  }
  const metrics: Record<string, number | null> = {}
  for (const [key, metric] of Object.entries(metricsRecord)) {
    metrics[key] = asNumber(metric)
  }
  return {
    rowKind,
    id: asText(record.id),
    label,
    metrics,
  }
}

function asEventRow(value: unknown): DepartmentEventRow | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  return {
    appId: asText(record.app_id),
    organizationId: asText(record.organization_id),
    organizationName: asText(record.organization_name),
    loanProgramCode: asText(record.loan_program_code),
    employeeId: asText(record.employee_id),
    employeeName: asText(record.employee_name),
    eventName: asText(record.event),
    eventDate: asText(record.event_date),
    points: asNumber(record.points),
    branchId: asText(record.branch_id),
    branchName: asText(record.branch_name),
    processingNetWorkdays: asNumber(record.processing_net_workdays),
    releasedToCloser: asText(record.released_to_closer),
    closingDeadline: asText(record.closing_deadline),
    docsToClosing: asNumber(record.docs_to_closing),
    isClosingFundingRush: asBoolean(record.is_closing_funding_rush),
    submittedForInitialReview: asText(record.submitted_for_initial_review),
    initialReviewComplete: asText(record.initial_review_complete),
    workdaysInInitialReview: asNumber(record.workdays_in_initial_review),
    qcCount: asNumber(record.qc_count),
    avgQcScore: asNumber(record.avg_qc_score),
    isBadLoan: asBoolean(record.is_bad_loan),
  }
}

export function parseDepartmentDashboardPayload(
  department: DepartmentId,
  value: unknown
): DepartmentDashboard {
  const record = asRecord(value)
  const filters = asRecord(record?.filters)
  const events = asRecord(record?.events)
  if (!record || !filters || !events) {
    throw new Error("Department dashboard payload is incomplete.")
  }
  if (record.department !== department) {
    throw new Error("Department dashboard payload does not match the page.")
  }

  const windowStart = asText(record.window_start)
  const windowEnd = asText(record.window_end)
  if (!windowStart || !windowEnd) {
    throw new Error("Department dashboard window is missing.")
  }

  return {
    department,
    windowStart,
    windowEnd,
    filters: {
      branches: asOptions(filters.branches),
      months: asOptions(filters.months),
      weeks: asOptions(filters.weeks),
      events: asOptions(filters.events),
      orgs: asOptions(filters.orgs),
    },
    employees: Array.isArray(record.employees)
      ? record.employees.flatMap((row) => {
          const parsed = asMetricRow(row)
          return parsed ? [parsed] : []
        })
      : [],
    organizations: Array.isArray(record.organizations)
      ? record.organizations.flatMap((row) => {
          const parsed = asMetricRow(row)
          return parsed ? [parsed] : []
        })
      : [],
    events: {
      total: asNumber(events.total) ?? 0,
      limit: asNumber(events.limit) ?? DEPARTMENT_EVENT_PAGE_SIZE,
      offset: asNumber(events.offset) ?? 0,
      rows: Array.isArray(events.rows)
        ? events.rows.flatMap((row) => {
            const parsed = asEventRow(row)
            return parsed ? [parsed] : []
          })
        : [],
    },
  }
}
