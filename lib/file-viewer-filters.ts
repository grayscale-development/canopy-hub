export type FileViewerFilterField =
  | "divisionId"
  | "branchId"
  | "loanOfficerId"
  | "processorId"
  | "underwriterId"
  | "underwritingOrgId"
  | "borrower"
  | "address"
  | "cityStateZip"
  | "loanType"
  | "loanPurpose"
  | "loanTerm"
  | "investor"
  | "division"
  | "branch"
  | "loanOfficer"
  | "processor"
  | "underwriter"
  | "underwritingOrg"
  | "closer"
  | "funder"
  | "lastStatus"
  | "estimatedClosingDate"
  | "fundedDate"
  | "closedDate"
  | "loanAmount"

type FileViewerFilterFieldType = "text" | "number" | "date"

export type FileViewerFilterOperator =
  | "contains"
  | "equals"
  | "notEquals"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "isNotEmpty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "on"
  | "before"
  | "after"
  | "onOrBefore"
  | "onOrAfter"

export interface FileViewerFilter {
  field: FileViewerFilterField
  operator: FileViewerFilterOperator
  value: string
}

const FILTER_FIELDS: Array<{
  value: FileViewerFilterField
  label: string
  type: FileViewerFilterFieldType
  isVisible: boolean
}> = [
  { value: "divisionId", label: "Division ID", type: "text", isVisible: false },
  { value: "branchId", label: "Branch ID", type: "text", isVisible: false },
  {
    value: "loanOfficerId",
    label: "Loan Officer ID",
    type: "text",
    isVisible: false,
  },
  {
    value: "processorId",
    label: "Processor ID",
    type: "text",
    isVisible: false,
  },
  {
    value: "underwriterId",
    label: "Underwriter ID",
    type: "text",
    isVisible: false,
  },
  {
    value: "underwritingOrgId",
    label: "Underwriting Org ID",
    type: "text",
    isVisible: false,
  },
  { value: "borrower", label: "Borrower", type: "text", isVisible: true },
  { value: "address", label: "Address", type: "text", isVisible: true },
  {
    value: "cityStateZip",
    label: "City, State, Zip",
    type: "text",
    isVisible: true,
  },
  { value: "loanType", label: "Loan Type", type: "text", isVisible: true },
  {
    value: "loanPurpose",
    label: "Loan Purpose",
    type: "text",
    isVisible: true,
  },
  { value: "loanTerm", label: "Loan Term", type: "number", isVisible: true },
  { value: "investor", label: "Investor", type: "text", isVisible: true },
  { value: "division", label: "Division", type: "text", isVisible: true },
  { value: "branch", label: "Branch", type: "text", isVisible: true },
  {
    value: "loanOfficer",
    label: "Loan Officer",
    type: "text",
    isVisible: true,
  },
  { value: "processor", label: "Processor", type: "text", isVisible: true },
  { value: "underwriter", label: "Underwriter", type: "text", isVisible: true },
  {
    value: "underwritingOrg",
    label: "Underwriting Org",
    type: "text",
    isVisible: true,
  },
  { value: "closer", label: "Closer", type: "text", isVisible: true },
  { value: "funder", label: "Funder", type: "text", isVisible: true },
  { value: "lastStatus", label: "Last Status", type: "text", isVisible: true },
  {
    value: "estimatedClosingDate",
    label: "Est. Closing Date",
    type: "date",
    isVisible: true,
  },
  { value: "fundedDate", label: "Funded Date", type: "date", isVisible: true },
  { value: "closedDate", label: "Closed Date", type: "date", isVisible: true },
  {
    value: "loanAmount",
    label: "Loan Amount",
    type: "number",
    isVisible: true,
  },
]

const TEXT_OPERATORS: FileViewerFilterOperator[] = [
  "contains",
  "equals",
  "notEquals",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
]

const NUMBER_OPERATORS: FileViewerFilterOperator[] = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
  "isEmpty",
  "isNotEmpty",
]

const DATE_OPERATORS: FileViewerFilterOperator[] = [
  "on",
  "before",
  "after",
  "onOrBefore",
  "onOrAfter",
  "isEmpty",
  "isNotEmpty",
]

const OPERATOR_LABELS: Record<FileViewerFilterOperator, string> = {
  contains: "Contains",
  equals: "Equals",
  notEquals: "Does Not Equal",
  startsWith: "Starts With",
  endsWith: "Ends With",
  isEmpty: "Is Empty",
  isNotEmpty: "Is Not Empty",
  gt: "Greater Than",
  gte: "Greater Than or Equal",
  lt: "Less Than",
  lte: "Less Than or Equal",
  on: "On",
  before: "Before",
  after: "After",
  onOrBefore: "On or Before",
  onOrAfter: "On or After",
}

const FIELD_DEFS_BY_VALUE = new Map(
  FILTER_FIELDS.map((fieldDef) => [fieldDef.value, fieldDef] as const)
)

export const FILE_VIEWER_FILTER_FIELDS = FILTER_FIELDS.filter(
  (fieldDef) => fieldDef.isVisible
).map(({ value, label, type }) => ({ value, label, type }))

export function getFilterFieldLabel(field: FileViewerFilterField) {
  return FIELD_DEFS_BY_VALUE.get(field)?.label ?? field
}

export function isVisibleFilterField(field: FileViewerFilterField) {
  return FIELD_DEFS_BY_VALUE.get(field)?.isVisible ?? false
}

export function getFieldType(
  field: FileViewerFilterField
): FileViewerFilterFieldType {
  return FIELD_DEFS_BY_VALUE.get(field)?.type ?? "text"
}

export function getOperatorsForField(
  field: FileViewerFilterField
): FileViewerFilterOperator[] {
  const fieldType = getFieldType(field)
  if (fieldType === "number") {
    return NUMBER_OPERATORS
  }
  if (fieldType === "date") {
    return DATE_OPERATORS
  }
  return TEXT_OPERATORS
}

export function getOperatorLabel(operator: FileViewerFilterOperator) {
  return OPERATOR_LABELS[operator]
}

export function operatorRequiresValue(operator: FileViewerFilterOperator) {
  return operator !== "isEmpty" && operator !== "isNotEmpty"
}

function isFilterField(value: string): value is FileViewerFilterField {
  return FIELD_DEFS_BY_VALUE.has(value as FileViewerFilterField)
}

function toArray(value: string | string[] | undefined) {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

export function parseFileViewerFilters(
  searchParams: Record<string, string | string[] | undefined>
): FileViewerFilter[] {
  const fields = toArray(searchParams.ff)
  const operators = toArray(searchParams.fo)
  const values = toArray(searchParams.fv)
  const size = Math.max(fields.length, operators.length, values.length)
  const parsed: FileViewerFilter[] = []

  for (let index = 0; index < size; index += 1) {
    const field = fields[index]
    const operator = operators[index]
    const value = values[index] ?? ""

    if (!field || !operator) {
      continue
    }

    if (!isFilterField(field)) {
      continue
    }

    const validOperators = getOperatorsForField(field)
    if (!validOperators.includes(operator as FileViewerFilterOperator)) {
      continue
    }

    parsed.push({
      field,
      operator: operator as FileViewerFilterOperator,
      value,
    })
  }

  return parsed
}

export function sanitizeFileViewerFilters(filters: FileViewerFilter[]) {
  return filters.filter((filter) => {
    if (!isFilterField(filter.field)) {
      return false
    }
    if (!getOperatorsForField(filter.field).includes(filter.operator)) {
      return false
    }
    if (!operatorRequiresValue(filter.operator)) {
      return true
    }
    return filter.value.trim().length > 0
  })
}

function normalizeText(value: unknown) {
  if (typeof value === "string") {
    return value.trim().toLowerCase()
  }
  if (value === null || value === undefined) {
    return ""
  }
  return String(value).trim().toLowerCase()
}

function toComparableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function toComparableDate(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }
  const parsedDate = new Date(`${value.trim().slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime()
}

function matchesTextFilter(value: unknown, filter: FileViewerFilter) {
  const rowValue = normalizeText(value)
  const filterValue = normalizeText(filter.value)

  switch (filter.operator) {
    case "contains":
      return rowValue.includes(filterValue)
    case "equals":
      return rowValue === filterValue
    case "notEquals":
      return rowValue !== filterValue
    case "startsWith":
      return rowValue.startsWith(filterValue)
    case "endsWith":
      return rowValue.endsWith(filterValue)
    case "isEmpty":
      return rowValue.length === 0
    case "isNotEmpty":
      return rowValue.length > 0
    default:
      return false
  }
}

function matchesNumberFilter(value: unknown, filter: FileViewerFilter) {
  const rowValue = toComparableNumber(value)
  const filterValue = toComparableNumber(filter.value)

  switch (filter.operator) {
    case "isEmpty":
      return rowValue === null
    case "isNotEmpty":
      return rowValue !== null
    case "equals":
      return (
        rowValue !== null && filterValue !== null && rowValue === filterValue
      )
    case "notEquals":
      return (
        rowValue !== null && filterValue !== null && rowValue !== filterValue
      )
    case "gt":
      return rowValue !== null && filterValue !== null && rowValue > filterValue
    case "gte":
      return (
        rowValue !== null && filterValue !== null && rowValue >= filterValue
      )
    case "lt":
      return rowValue !== null && filterValue !== null && rowValue < filterValue
    case "lte":
      return (
        rowValue !== null && filterValue !== null && rowValue <= filterValue
      )
    default:
      return false
  }
}

function matchesDateFilter(value: unknown, filter: FileViewerFilter) {
  const rowValue = toComparableDate(value)
  const filterValue = toComparableDate(filter.value)

  switch (filter.operator) {
    case "isEmpty":
      return rowValue === null
    case "isNotEmpty":
      return rowValue !== null
    case "on":
      return (
        rowValue !== null && filterValue !== null && rowValue === filterValue
      )
    case "before":
      return rowValue !== null && filterValue !== null && rowValue < filterValue
    case "after":
      return rowValue !== null && filterValue !== null && rowValue > filterValue
    case "onOrBefore":
      return (
        rowValue !== null && filterValue !== null && rowValue <= filterValue
      )
    case "onOrAfter":
      return (
        rowValue !== null && filterValue !== null && rowValue >= filterValue
      )
    default:
      return false
  }
}

export function applyFileViewerFilters<Row extends object>(
  rows: Row[],
  filters: FileViewerFilter[]
) {
  const activeFilters = sanitizeFileViewerFilters(filters)

  if (activeFilters.length === 0) {
    return rows
  }

  return rows.filter((row) =>
    activeFilters.every((filter) => {
      const rowValue = (row as Record<string, unknown>)[filter.field]
      const fieldType = getFieldType(filter.field)

      if (fieldType === "number") {
        return matchesNumberFilter(rowValue, filter)
      }
      if (fieldType === "date") {
        return matchesDateFilter(rowValue, filter)
      }
      return matchesTextFilter(rowValue, filter)
    })
  )
}
