import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { CanopyProductionSeries } from "@/lib/hub-metrics"

interface CanopyProductionMonthlyRow {
  month_key: string
  label: string
  funded_count: number
  funded_volume: number
}

interface AprilBranchSummaryRpcRow {
  branch_id: string | null
  branch_name: string
  file_count: number
  total_volume: number
}

interface AprilDivisionSummaryRpcRow {
  division_id: string | null
  division_name: string
  file_count: number
  total_volume: number
}

interface AprilLoanOfficerSummaryRpcRow {
  loan_officer_id: string | null
  loan_officer_name: string
  file_count: number
  total_volume: number
}

interface AprilProcessorSummaryRpcRow {
  processor_id: string | null
  processor_name: string
  file_count: number
  total_volume: number
}

interface AprilUnderwriterSummaryRpcRow {
  underwriter_id: string | null
  underwriter_name: string
  file_count: number
  total_volume: number
}

interface AprilUnderwritingOrgSummaryRpcRow {
  underwriting_org_id: string | null
  underwriting_org_name: string
  file_count: number
  total_volume: number
}

interface CorporateTurnRowRpcRow {
  section_type: string
  section_label: string
  section_sort_order: number
  status: string
  status_order: number
  files_in_progress: number
  workdays_for_files_in_progress: number
  workdays_to_complete_for_previous_week: number
  workdays_to_complete_for_previous_month: number
}

interface CorporateTurnKpisRpcRow {
  workdays_for_lo_loa_statuses: number
  processing_rushes_last_7_days: number
  underwriting_rushes_last_7_days: number
  closing_funding_rushes_last_7_days: number
}

interface PreviousMonthLoanProgramRpcRow {
  month_start: string
  month_label: string
  loan_program: string
  funded_count: number
  funded_volume: number
}

export interface AprilBranchSummary {
  branchId: string | null
  branchName: string
  fileCount: number
  totalVolume: number
}

export interface AprilDivisionSummary {
  divisionId: string | null
  divisionName: string
  fileCount: number
  totalVolume: number
}

export interface AprilLoanOfficerSummary {
  loanOfficerId: string | null
  loanOfficerName: string
  fileCount: number
  totalVolume: number
}

export interface AprilProcessorSummary {
  processorId: string | null
  processorName: string
  fileCount: number
  totalVolume: number
}

export interface AprilUnderwriterSummary {
  underwriterId: string | null
  underwriterName: string
  fileCount: number
  totalVolume: number
}

export interface AprilUnderwritingOrgSummary {
  underwritingOrgId: string | null
  underwritingOrgName: string
  fileCount: number
  totalVolume: number
}

export interface CorporateTurnTableRow {
  status: string
  statusType: string
  statusOrder: number
  filesInProgress: number
  workdaysForFilesInProgress: number
  workdaysToCompleteForPreviousWeek: number
  workdaysToCompleteForPreviousMonth: number
}

export interface CorporateTurnKpis {
  workdaysForLoLoaStatuses: number
  processingRushesLast7Days: number
  underwritingRushesLast7Days: number
  closingFundingRushesLast7Days: number
}

export interface CorporateTurnSummary {
  tableRows: CorporateTurnTableRow[]
  kpis: CorporateTurnKpis
}

export interface PreviousMonthLoanProgramSummaryRow {
  programName: string
  fundedCount: number
  fundedVolume: number
}

export interface PreviousMonthLoanProgramSummary {
  monthLabel: string
  rows: PreviousMonthLoanProgramSummaryRow[]
}

export interface DivisionProfile {
  divisionId: string
  name: string
  address: string
}

export interface BranchProfile {
  branchId: string
  name: string
  address: string
  divisionId: string | null
  divisionName: string | null
}

export interface DivisionBranchSummary {
  branchId: string
  branchName: string
  fileCount: number
  totalVolume: number
}

export interface DivisionEmployeeSummary {
  userId: string
  name: string
  email: string | null
  roles: string[]
  fileTouches: number
}

export interface EmployeeProfile {
  userId: string
  displayName: string
  role: string | null
  email: string | null
  phoneNumber: string | null
  losId: string | null
  processingOrgs: string[]
  underwritingOrgs: string[]
  profilePhotoUrl: string | null
}

export interface EmployeePointsRow {
  eventDate: string | null
  event: string | null
  points: number
}

export interface EmployeePointsSummary {
  source: "new" | "old"
  totalPoints: number
  rows: EmployeePointsRow[]
}

export interface PointsSpecialistsPaOrgOption {
  id: string
  name: string
}

export interface PointsSpecialistsMonthlyPoint {
  monthKey: string
  label: string
  totalPoints: number
}

export interface PointsSpecialistsWeeklyPoint {
  weekStartIso: string
  weekEndIso: string
  totalPoints: number
}

export interface PointsSpecialistsTopUser {
  userId: string
  userName: string
  totalPoints: number
}

export interface PointsSpecialistsByPaOrgRow {
  paOrgId: string
  paOrgName: string
  totalPoints: number
}

export interface PointsSpecialistsSummary {
  source: "new" | "old" | "hybrid"
  windowStartIso: string
  windowEndIso: string
  orgOptions: PointsSpecialistsPaOrgOption[]
  monthlySummary: PointsSpecialistsMonthlyPoint[]
  weeklySummary: PointsSpecialistsWeeklyPoint[]
  topUsers: PointsSpecialistsTopUser[]
  byPaOrg: PointsSpecialistsByPaOrgRow[]
}

export interface EmployeeDirectoryRow {
  id: string
  employee: string
  jobTitle: string | null
  workEmail: string | null
  mobilePhone: string | null
  divisionId: string | null
  division: string | null
  branch: string | null
  branchId: string | null
}

export interface BranchDirectoryRow {
  id: string
  accountingCode: string | null
  branch: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface DivisionPipelineRow {
  externalRowKey: string
  loanNumber: string | null
  borrower: string | null
  branchName: string | null
  lastStatus: string | null
  estimatedClosingDate: string | null
  loanAmount: number
}

export interface FileQualityMonthOption {
  monthKey: string
  label: string
  startIso: string
  endExclusiveIso: string
}

export interface FileQualityRollupRow {
  keyId: string
  label: string
  fileCount: number
  touchesPerApp: number
  avgExpectedTouches: number | null
  netTouches: number | null
}

export type LeaderboardEntityKey =
  | "division"
  | "branch"
  | "loanOfficer"
  | "processor"
  | "underwriter"
  | "underwritingOrg"

export type PipelineViewKey =
  | "active"
  | "new-applications"
  | "upcoming-closings"

export interface AprilLeaderboardFile {
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
  closedDate: string | null
  loanAmount: number
}

interface AprilLeaderboardFileRpcRow {
  external_row_key: string
  loan_number: string | null
  borrower: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  loan_type: string | null
  loan_purpose: string | null
  loan_term: number | string | null
  investor: string | null
  division_id: string | null
  branch_id: string | null
  loan_officer_id: string | null
  processor_id: string | null
  underwriter_id: string | null
  underwriting_org_id: string | null
  closer_id: string | null
  funder_id: string | null
  last_status: string | null
  estimated_closing_date: string | null
  loan_amount: number | string | null
  closed_date: string | null
}

interface DivisionLookupRpcRow {
  division_id: string | null
  division_name: string | null
}

interface DivisionProfileRpcRow {
  division_id: string | null
  division_name: string | null
  raw_payload: Record<string, unknown> | null
}

interface BranchLookupRpcRow {
  branch_id: string | null
  branch_name: string | null
}

interface BranchProfileRpcRow {
  branch_id: string | null
  branch_name: string | null
  branch_address: string | null
  branch_city: string | null
  branch_state: string | null
  branch_zip: string | null
}

interface EmployeeLookupRpcRow {
  user_id: string | null
  user_name: string | null
}

interface EmployeeDetailLookupRpcRow {
  user_id: string | null
  user_name: string | null
  user_email: string | null
}

interface EmployeeProfileRpcRow {
  user_id: string | null
  user_name: string | null
  user_email: string | null
  default_role: string | null
  associated_processing_orgs: string[] | null
  associated_underwriting_orgs: string[] | null
  raw_payload: Record<string, unknown> | null
}

interface EmployeeDirectoryResultRpcRow {
  user_id: string | null
  user_name: string | null
  user_email: string | null
  default_role: string | null
  raw_payload: Record<string, unknown> | null
  context_division_id: string | null
  context_division_name: string | null
  context_branch_id: string | null
  context_branch_name: string | null
}

interface BranchDirectoryRpcRow {
  external_row_key: string
  branch_id: string | null
  accounting_code: string | null
  branch_name: string | null
  branch_address: string | null
  branch_city: string | null
  branch_state: string | null
  branch_zip: string | null
  last_synced_at: string
}

interface DivisionProductionSeriesRpcRow {
  funded_date: string | null
  loan_amount: number | string | null
}

interface BranchLookupWithKeyRpcRow {
  branch_id: string | null
  branch_name: string | null
}

interface DivisionPipelineRpcRow {
  external_row_key: string
  loan_number: string | null
  borrower: string | null
  branch_id: string | null
  last_status: string | null
  estimated_closing_date: string | null
  loan_amount: number | string | null
}

interface FileQualityRollupRpcRow {
  entity_type: "division" | "branch"
  key_id: string
  label: string
  file_count: number
  touches_per_app: number | string | null
  avg_expected_touches: number | string | null
  net_touches: number | string | null
  has_expected_and_net_metrics: boolean
}

interface SpecialistPointsWindowRow {
  external_row_key: string
  pa_org_id: string | null
  user_id: string | null
  event_date: string | null
  points: number | string | null
}

interface ProductionDataPaOrgLookupRow {
  pa_org_id: string | null
  raw_payload: Record<string, unknown> | null
}

interface QlikSourceConfigLookupRow {
  id: string
}

interface QlikSyncRunLookupRow {
  id: string
}

interface QlikRawPayloadLookupRow {
  payload_type: string
  payload: unknown
  created_at: string
}

const POINTS_SPECIALISTS_PA_ORG_DIRECTORY_SYNC_KEY =
  "points_specialists_by_pa_org_processing_assistant_orgs"

function toUniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
}

function buildNameLookup<T>(input: {
  rows: T[]
  getId: (row: T) => string | null
  getName: (row: T) => string | null
}) {
  const lookup = new Map<string, string>()

  for (const row of input.rows) {
    const id = input.getId(row)
    const name = input.getName(row)
    if (!id || lookup.has(id)) {
      continue
    }
    if (!name?.trim()) {
      continue
    }

    lookup.set(id, name)
  }

  return lookup
}

function resolveLookupName(
  id: string | null,
  namesById: Map<string, string>,
  fallbackPrefix: string
) {
  if (!id) {
    return null
  }

  return namesById.get(id) ?? `${fallbackPrefix} (${id})`
}

function resolveUnderwritingOrgName(input: {
  underwritingOrgId: string | null
  branchNamesById: Map<string, string>
  divisionNamesById: Map<string, string>
}) {
  if (!input.underwritingOrgId) {
    return null
  }

  return (
    input.branchNamesById.get(input.underwritingOrgId) ??
    input.divisionNamesById.get(input.underwritingOrgId) ??
    `Underwriting Org (${input.underwritingOrgId})`
  )
}

function toCityStateZip(row: {
  city: string | null
  state: string | null
  zip_code: string | null
}) {
  const city = row.city?.trim() ?? ""
  const stateZip = [row.state?.trim(), row.zip_code?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" ")

  const value = [city, stateZip]
    .filter((part): part is string => Boolean(part))
    .join(", ")

  return value.length > 0 ? value : null
}

function getPayloadTextValue(
  payload: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  if (!payload) {
    return null
  }

  for (const key of keys) {
    const value = payload[key]
    if (typeof value !== "string") {
      continue
    }

    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return null
}

function resolveDivisionAddress(payload: Record<string, unknown> | null | undefined) {
  const fullAddress = getPayloadTextValue(payload, [
    "Division Address",
    "division_address",
    "Address",
    "address",
  ])
  if (fullAddress) {
    return fullAddress
  }

  const city = getPayloadTextValue(payload, [
    "Division City",
    "division_city",
    "City",
    "city",
  ])
  const state = getPayloadTextValue(payload, [
    "Division State",
    "division_state",
    "State",
    "state",
  ])
  const zip = getPayloadTextValue(payload, [
    "Division Zip",
    "division_zip",
    "Zip",
    "Zip Code",
    "zip",
    "zip_code",
  ])

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
    .filter((part): part is string => Boolean(part))
    .join(", ")

  return cityStateZip || null
}

function resolveBranchAddress(row: {
  branch_address: string | null
  branch_city: string | null
  branch_state: string | null
  branch_zip: string | null
}) {
  const line1 = row.branch_address?.trim() ?? ""
  const city = row.branch_city?.trim() ?? ""
  const state = row.branch_state?.trim() ?? ""
  const zip = row.branch_zip?.trim() ?? ""
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
    .filter((part): part is string => Boolean(part))
    .join(", ")

  return [line1, cityStateZip]
    .filter((part): part is string => Boolean(part))
    .join(", ")
}

function formatNameLastFirst(name: string | null | undefined) {
  const trimmed = name?.trim()
  if (!trimmed) {
    return "Unknown Employee"
  }

  if (trimmed.includes(",")) {
    return trimmed
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return trimmed
  }

  const first = parts[0]
  const last = parts[parts.length - 1]
  return `${last}, ${first}`
}

function buildEmployeeRoleOrFilter(employeeId: string) {
  return [
    `loan_officer_id.eq.${employeeId}`,
    `processor_id.eq.${employeeId}`,
    `underwriter_id.eq.${employeeId}`,
  ].join(",")
}

function buildLoanOfficerOrProcessorFilter(employeeId: string) {
  return [
    `loan_officer_id.eq.${employeeId}`,
    `processor_id.eq.${employeeId}`,
  ].join(",")
}

const PIPELINE_NEW_APPLICATION_STATUSES = [
  "Prospect",
  "PreQualified",
  "SubmittedForPreApproval",
  "SubmittedForInitialReviewPreApproval",
  "InitialReviewCompletePreApproval",
  "PreProcessingPreApproval",
  "ApplicationDate",
  "PreProcessing",
] as const

function toRpcNumber(value: number | string | null | undefined) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Number(numericValue)
}

function toIsoDate(dateValue: Date) {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, "0")
  const day = String(dateValue.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getMonthKey(dateValue: Date) {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function formatMonthLabel(dateValue: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(dateValue)
}

function buildLast12MonthWindow(referenceDate = new Date()) {
  const currentMonthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  )
  const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 11, 1)
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + index, 1)
    return {
      key: getMonthKey(monthDate),
      label: formatMonthLabel(monthDate),
      monthDate,
    }
  })

  return {
    months,
    startIso: getMonthKey(start) + "-01",
  }
}

function parseMonthKey(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return new Date(year, month - 1, 1)
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function toQlikCellText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null
    }
    return String(value)
  }

  if (typeof value !== "object") {
    return null
  }

  const cell = value as Record<string, unknown>
  if (cell.qIsNull === true) {
    return null
  }

  if (typeof cell.qText === "string") {
    const trimmed = cell.qText.trim()
    if (trimmed) {
      return trimmed
    }
  }

  if (typeof cell.qNum === "number" && Number.isFinite(cell.qNum)) {
    return String(cell.qNum)
  }

  return null
}

function collectQMatrixPages(payload: unknown): unknown[][][] {
  const matrices: unknown[][][] = []
  const visited = new Set<unknown>()

  function walk(node: unknown) {
    if (node === null || node === undefined) {
      return
    }

    if (typeof node !== "object") {
      return
    }

    if (visited.has(node)) {
      return
    }
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item)
      }
      return
    }

    const record = node as Record<string, unknown>
    const maybeMatrix = record.qMatrix
    if (Array.isArray(maybeMatrix)) {
      matrices.push(maybeMatrix as unknown[][])
    }

    for (const value of Object.values(record)) {
      walk(value)
    }
  }

  walk(payload)
  return matrices
}

function pickRowField(
  row: Record<string, string | null>,
  preferredKeys: string[],
  fallback: (normalizedKey: string) => boolean
) {
  const entries = Object.entries(row)
  const lookup = new Map<string, string | null>()
  for (const [key, value] of entries) {
    lookup.set(normalizeLookupKey(key), value)
  }

  for (const preferredKey of preferredKeys) {
    const value = lookup.get(normalizeLookupKey(preferredKey))
    if (value?.trim()) {
      return value.trim()
    }
  }

  for (const [key, value] of entries) {
    if (!value?.trim()) {
      continue
    }
    if (fallback(normalizeLookupKey(key))) {
      return value.trim()
    }
  }

  return null
}

function payloadToTextRecord(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const row: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(payload)) {
    row[key] = toQlikCellText(value)
  }
  return row
}

function extractPaOrgNameFromRawPayload(payload: Record<string, unknown> | null | undefined) {
  const row = payloadToTextRecord(payload)
  if (!row) {
    return null
  }

  return pickRowField(
    row,
    [
      "PA Org",
      "PA Org Name",
      "Processing Assistant Org",
      "Processing Assistant Org Name",
      "PA Organization",
      "PA Org Label",
    ],
    (key) =>
      key === "paorg" ||
      key === "paorgname" ||
      key === "processingassistantorg" ||
      key === "processingassistantorgname" ||
      (key.includes("paorg") && !key.endsWith("id")) ||
      (key.includes("processingassistantorg") && !key.endsWith("id"))
  )
}

function startOfDay(dateValue: Date) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate())
}

function addDays(dateValue: Date, days: number) {
  return new Date(
    dateValue.getFullYear(),
    dateValue.getMonth(),
    dateValue.getDate() + days
  )
}

function startOfWeekMonday(dateValue: Date) {
  const start = startOfDay(dateValue)
  const day = start.getDay()
  const offset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + offset)
  return start
}

function firstWeekStartOnOrAfter(dateValue: Date) {
  const candidate = startOfWeekMonday(dateValue)
  if (candidate < startOfDay(dateValue)) {
    return addDays(candidate, 7)
  }
  return candidate
}

function buildPointsSpecialistsWindow(referenceDate = new Date()) {
  const end = startOfDay(referenceDate)
  const start = new Date(end.getFullYear() - 1, end.getMonth(), 1)
  return {
    startDate: start,
    endDate: end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
  }
}

async function fetchSpecialistPointsWindowRows({
  supabase,
  source,
  windowStartIso,
  windowEndIso,
  paOrgIds,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  source: "new" | "old"
  windowStartIso: string
  windowEndIso: string
  paOrgIds: string[]
}) {
  const tableName =
    source === "new" ? "specialist_points_new" : "specialist_points_old"
  const pageSize = 1000
  let from = 0
  const rows: SpecialistPointsWindowRow[] = []

  while (true) {
    let query = supabase
      .from(tableName)
      .select("external_row_key,pa_org_id,user_id,event_date,points")
      .gte("event_date", windowStartIso)
      .lte("event_date", windowEndIso)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("external_row_key", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (paOrgIds.length > 0) {
      query = query.in("pa_org_id", paOrgIds)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as SpecialistPointsWindowRow[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

async function fetchSpecialistPointsWindowPaOrgIds({
  supabase,
  source,
  windowStartIso,
  windowEndIso,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  source: "new" | "old"
  windowStartIso: string
  windowEndIso: string
}) {
  const tableName =
    source === "new" ? "specialist_points_new" : "specialist_points_old"
  const pageSize = 1000
  let from = 0
  const ids = new Set<string>()

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select("external_row_key,pa_org_id")
      .gte("event_date", windowStartIso)
      .lte("event_date", windowEndIso)
      .not("pa_org_id", "is", null)
      .order("external_row_key", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = (data ?? []) as Array<{
      external_row_key: string
      pa_org_id: string | null
    }>
    for (const row of pageRows) {
      if (row.pa_org_id?.trim()) {
        ids.add(row.pa_org_id)
      }
    }

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  return [...ids]
}

function extractPaOrgDirectoryFromRawPayloads(input: {
  metadataPayload: unknown
  dataPayload: unknown
}) {
  function looksLikeOrgId(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      return false
    }
    if (/\s/.test(trimmed)) {
      return false
    }
    return /^[A-Za-z0-9_-]+$/.test(trimmed)
  }

  function looksLikeOrgName(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      return false
    }
    return /[A-Za-z]/.test(trimmed) && /\s/.test(trimmed)
  }

  const metadataRecord =
    input.metadataPayload && typeof input.metadataPayload === "object"
      ? (input.metadataPayload as Record<string, unknown>)
      : null
  const rawColumns = metadataRecord?.columns
  const columnTitles = Array.isArray(rawColumns)
    ? rawColumns.map((column, index) => {
        if (!column || typeof column !== "object") {
          return `column_${index}`
        }
        const title = (column as Record<string, unknown>).title
        if (typeof title !== "string" || !title.trim()) {
          return `column_${index}`
        }
        return title.trim()
      })
    : []

  const matrices = collectQMatrixPages(input.dataPayload)
  const rowRecords: Array<{
    cells: string[]
    row: Record<string, string | null>
  }> = []
  for (const matrix of matrices) {
    for (const matrixRow of matrix) {
      if (!Array.isArray(matrixRow)) {
        continue
      }

      const row: Record<string, string | null> = {}
      const cells: string[] = []
      for (let index = 0; index < matrixRow.length; index += 1) {
        const key = columnTitles[index] ?? `column_${index}`
        const cellText = toQlikCellText(matrixRow[index])
        row[key] = cellText
        if (cellText?.trim()) {
          cells.push(cellText.trim())
        }
      }
      rowRecords.push({ row, cells })
    }
  }

  const byId = new Map<string, string>()
  for (const rowRecord of rowRecords) {
    const orgIdFromNamedColumns = pickRowField(
      rowRecord.row,
      ["PA Org ID", "Processing Assistant Org ID", "Org ID", "ID"],
      (key) => key === "paorgid" || key === "processingassistantorgid" || key.endsWith("orgid")
    )
    const orgNameFromNamedColumns = pickRowField(
      rowRecord.row,
      ["PA Org Name", "Processing Assistant Org Name", "Org Name", "Name", "PA Org"],
      (key) =>
        key === "paorgname" ||
        key === "processingassistantorgname" ||
        key.endsWith("orgname") ||
        key.endsWith("name")
    )

    let orgId = orgIdFromNamedColumns
    let orgName = orgNameFromNamedColumns
    if ((!orgId || !orgName) && rowRecord.cells.length >= 2) {
      const [firstCell, secondCell] = rowRecord.cells
      if (!orgId && looksLikeOrgId(firstCell) && looksLikeOrgName(secondCell)) {
        orgId = firstCell
      } else if (!orgId && looksLikeOrgId(secondCell) && looksLikeOrgName(firstCell)) {
        orgId = secondCell
      } else if (!orgId) {
        orgId = firstCell
      }

      if (!orgName && looksLikeOrgName(secondCell)) {
        orgName = secondCell
      } else if (!orgName && looksLikeOrgName(firstCell)) {
        orgName = firstCell
      } else if (!orgName) {
        orgName = secondCell
      }
    }

    if (!orgId?.trim()) {
      continue
    }
    const normalizedId = orgId.trim()
    if (!orgName?.trim()) {
      continue
    }
    if (!byId.has(normalizedId)) {
      byId.set(normalizedId, orgName.trim())
    }
  }

  return byId
}

async function fetchPointsSpecialistsPaOrgDirectory({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
}) {
  const { data: sourceConfig, error: sourceError } = await supabase
    .from("qlik_source_configs")
    .select("id")
    .eq("sync_key", POINTS_SPECIALISTS_PA_ORG_DIRECTORY_SYNC_KEY)
    .maybeSingle()
  if (sourceError) {
    throw new Error(sourceError.message)
  }

  const sourceConfigId = (sourceConfig as QlikSourceConfigLookupRow | null)?.id
  if (!sourceConfigId) {
    return new Map<string, string>()
  }

  const { data: runs, error: runsError } = await supabase
    .from("qlik_sync_runs")
    .select("id")
    .eq("source_config_id", sourceConfigId)
    .in("status", ["success", "partial"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
  if (runsError) {
    throw new Error(runsError.message)
  }

  const latestRunId = ((runs ?? []) as QlikSyncRunLookupRow[])[0]?.id
  if (!latestRunId) {
    return new Map<string, string>()
  }

  const { data: rawPayloads, error: rawPayloadsError } = await supabase
    .from("qlik_raw_payloads")
    .select("payload_type,payload,created_at")
    .eq("run_id", latestRunId)
    .in("payload_type", ["metadata_summary", "data"])
    .order("created_at", { ascending: false })
  if (rawPayloadsError) {
    throw new Error(rawPayloadsError.message)
  }

  const payloadRows = (rawPayloads ?? []) as QlikRawPayloadLookupRow[]
  const metadataPayload = payloadRows.find(
    (payload) => payload.payload_type === "metadata_summary"
  )?.payload
  const dataPayload = payloadRows.find((payload) => payload.payload_type === "data")?.payload

  if (!metadataPayload || !dataPayload) {
    return new Map<string, string>()
  }

  return extractPaOrgDirectoryFromRawPayloads({
    metadataPayload,
    dataPayload,
  })
}

async function fetchProductionDataPaOrgDirectory({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
}) {
  const pageSize = 1000
  const maxPages = 60
  let from = 0

  const allIds = new Set<string>()
  const namesById = new Map<string, string>()

  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await supabase
      .from("production_data")
      .select("pa_org_id,raw_payload")
      .not("pa_org_id", "is", null)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as ProductionDataPaOrgLookupRow[]
    for (const row of pageRows) {
      if (!row.pa_org_id?.trim()) {
        continue
      }
      const paOrgId = row.pa_org_id.trim()
      allIds.add(paOrgId)

      if (!namesById.has(paOrgId)) {
        const paOrgName = extractPaOrgNameFromRawPayload(row.raw_payload)
        if (paOrgName?.trim()) {
          namesById.set(paOrgId, paOrgName.trim())
        }
      }
    }

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  return {
    ids: [...allIds],
    namesById,
  }
}

export async function fetchCanopyProductionSeriesFromRpc(): Promise<CanopyProductionSeries> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(
    "get_canopy_production_last_12_months"
  )

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as CanopyProductionMonthlyRow[]

  return {
    labels: rows.map((row) => row.label),
    monthlyFundedCounts: rows.map((row) => Number(row.funded_count) || 0),
    monthlyFundedVolumes: rows.map((row) => Number(row.funded_volume) || 0),
  }
}

export async function fetchDivisionLast12MonthsSeries({
  divisionId,
  referenceDate = new Date(),
}: {
  divisionId: string
  referenceDate?: Date
}): Promise<CanopyProductionSeries> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: DivisionProductionSeriesRpcRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("funded_date,loan_amount")
      .eq("division_id", divisionId)
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as DivisionProductionSeriesRpcRow[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }
  const byMonth = new Map<
    string,
    {
      count: number
      volume: number
    }
  >()

  for (const month of window.months) {
    byMonth.set(month.key, { count: 0, volume: 0 })
  }

  for (const row of rows) {
    if (!row.funded_date) {
      continue
    }
    const monthKey = row.funded_date.slice(0, 7)
    const entry = byMonth.get(monthKey)
    if (!entry) {
      continue
    }
    entry.count += 1
    entry.volume += toRpcNumber(row.loan_amount)
  }

  return {
    labels: window.months.map((month) => month.label),
    monthlyFundedCounts: window.months.map((month) => byMonth.get(month.key)?.count ?? 0),
    monthlyFundedVolumes: window.months.map((month) => byMonth.get(month.key)?.volume ?? 0),
  }
}

export async function fetchDivisionBranchSummary({
  divisionId,
  referenceDate = new Date(),
}: {
  divisionId: string
  referenceDate?: Date
}): Promise<DivisionBranchSummary[]> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: Array<{
    branch_id: string | null
    loan_amount: number | string | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("branch_id,loan_amount,funded_date")
      .eq("division_id", divisionId)
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as Array<{
      branch_id: string | null
      loan_amount: number | string | null
    }>
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  const branchAgg = new Map<
    string,
    {
      fileCount: number
      totalVolume: number
    }
  >()

  for (const row of rows) {
    if (!row.branch_id?.trim()) {
      continue
    }
    const branchId = row.branch_id
    const current = branchAgg.get(branchId) ?? { fileCount: 0, totalVolume: 0 }
    current.fileCount += 1
    current.totalVolume += toRpcNumber(row.loan_amount)
    branchAgg.set(branchId, current)
  }

  const branchIds = [...branchAgg.keys()]
  let branchNamesById = new Map<string, string>()
  if (branchIds.length > 0) {
    const { data: branchesData, error: branchesError } = await supabase
      .from("branches")
      .select("branch_id,branch_name,last_synced_at")
      .in("branch_id", branchIds)
      .order("last_synced_at", { ascending: false, nullsFirst: false })

    if (branchesError) {
      throw new Error(branchesError.message)
    }

    branchNamesById = buildNameLookup({
      rows: ((branchesData ?? []) as unknown) as BranchLookupWithKeyRpcRow[],
      getId: (row) => row.branch_id,
      getName: (row) => row.branch_name,
    })
  }

  return branchIds
    .map((branchId) => {
      const agg = branchAgg.get(branchId) ?? { fileCount: 0, totalVolume: 0 }
      return {
        branchId,
        branchName: branchNamesById.get(branchId) ?? `Branch ${branchId}`,
        fileCount: agg.fileCount,
        totalVolume: agg.totalVolume,
      }
    })
    .sort((a, b) => {
      if (b.fileCount !== a.fileCount) {
        return b.fileCount - a.fileCount
      }
      if (b.totalVolume !== a.totalVolume) {
        return b.totalVolume - a.totalVolume
      }
      return a.branchName.localeCompare(b.branchName)
    })
}

export async function fetchDivisionEmployees({
  divisionId,
  referenceDate = new Date(),
}: {
  divisionId: string
  referenceDate?: Date
}): Promise<DivisionEmployeeSummary[]> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: Array<{
    loan_officer_id: string | null
    processor_id: string | null
    underwriter_id: string | null
    closer_id: string | null
    funder_id: string | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("loan_officer_id,processor_id,underwriter_id,closer_id,funder_id,funded_date")
      .eq("division_id", divisionId)
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as Array<{
      loan_officer_id: string | null
      processor_id: string | null
      underwriter_id: string | null
      closer_id: string | null
      funder_id: string | null
    }>
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  const roleColumns: Array<{
    key: keyof (typeof rows)[number]
    label: string
  }> = [
    { key: "loan_officer_id", label: "Loan Officer" },
    { key: "processor_id", label: "Processor" },
    { key: "underwriter_id", label: "Underwriter" },
    { key: "closer_id", label: "Closer" },
    { key: "funder_id", label: "Funder" },
  ]

  const agg = new Map<
    string,
    {
      roles: Set<string>
      fileTouches: number
    }
  >()

  for (const row of rows) {
    for (const roleColumn of roleColumns) {
      const userId = row[roleColumn.key]
      if (!userId?.trim()) {
        continue
      }
      const current = agg.get(userId) ?? {
        roles: new Set<string>(),
        fileTouches: 0,
      }
      current.roles.add(roleColumn.label)
      current.fileTouches += 1
      agg.set(userId, current)
    }
  }

  const userIds = [...agg.keys()]
  if (userIds.length === 0) {
    return []
  }

  const { data: employeesData, error: employeesError } = await supabase
    .from("employees")
    .select("user_id,user_name,user_email,last_synced_at")
    .in("user_id", userIds)
    .order("last_synced_at", { ascending: false, nullsFirst: false })

  if (employeesError) {
    throw new Error(employeesError.message)
  }

  const employees = ((employeesData ?? []) as unknown) as EmployeeDetailLookupRpcRow[]
  const namesById = buildNameLookup({
    rows: employees,
    getId: (row) => row.user_id,
    getName: (row) => row.user_name,
  })
  const emailById = new Map<string, string | null>()
  for (const row of employees) {
    if (!row.user_id || emailById.has(row.user_id)) {
      continue
    }
    emailById.set(row.user_id, row.user_email)
  }

  return userIds
    .map((userId) => {
      const value = agg.get(userId)
      return {
        userId,
        name: namesById.get(userId) ?? `User ${userId}`,
        email: emailById.get(userId) ?? null,
        roles: [...(value?.roles ?? [])].sort((a, b) => a.localeCompare(b)),
        fileTouches: value?.fileTouches ?? 0,
      }
    })
    .sort((a, b) => {
      if (b.fileTouches !== a.fileTouches) {
        return b.fileTouches - a.fileTouches
      }
      return a.name.localeCompare(b.name)
    })
}

export async function fetchDivisionPipeline({
  divisionId,
  limit = 200,
}: {
  divisionId: string
  limit?: number
}): Promise<DivisionPipelineRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("production_data")
    .select(
      "external_row_key,loan_number,borrower,branch_id,last_status,estimated_closing_date,loan_amount"
    )
    .eq("division_id", divisionId)
    .is("funded_date", null)
    .is("closed_date", null)
    .order("estimated_closing_date", { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown) as DivisionPipelineRpcRow[]
  const branchIds = toUniqueNonEmptyStrings(rows.map((row) => row.branch_id))

  let branchNamesById = new Map<string, string>()
  if (branchIds.length > 0) {
    const { data: branchesData, error: branchesError } = await supabase
      .from("branches")
      .select("branch_id,branch_name,last_synced_at")
      .in("branch_id", branchIds)
      .order("last_synced_at", { ascending: false, nullsFirst: false })

    if (branchesError) {
      throw new Error(branchesError.message)
    }

    branchNamesById = buildNameLookup({
      rows: ((branchesData ?? []) as unknown) as BranchLookupWithKeyRpcRow[],
      getId: (row) => row.branch_id,
      getName: (row) => row.branch_name,
    })
  }

  return rows.map((row) => ({
    externalRowKey: row.external_row_key,
    loanNumber: row.loan_number,
    borrower: row.borrower,
    branchName: row.branch_id
      ? branchNamesById.get(row.branch_id) ?? `Branch ${row.branch_id}`
      : null,
    lastStatus: row.last_status,
    estimatedClosingDate: row.estimated_closing_date,
    loanAmount: toRpcNumber(row.loan_amount),
  }))
}

export async function fetchAprilBranchSummaryFromRpc(): Promise<
  AprilBranchSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_branch_april_summary")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilBranchSummaryRpcRow[]

  return rows.map((row) => ({
    branchId: row.branch_id,
    branchName: row.branch_name || "Unknown Branch",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchAprilDivisionSummaryFromRpc(): Promise<
  AprilDivisionSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_division_april_summary")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilDivisionSummaryRpcRow[]

  return rows.map((row) => ({
    divisionId: row.division_id,
    divisionName: row.division_name || "Unknown Division",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchDivisionProfileById(
  divisionId: string
): Promise<DivisionProfile | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("divisions")
    .select("division_id,division_name,raw_payload,last_synced_at")
    .eq("division_id", divisionId)
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  const row = ((data ?? []) as DivisionProfileRpcRow[])[0]
  if (!row) {
    return null
  }

  return {
    divisionId,
    name: row.division_name?.trim() || `Division ${divisionId}`,
    address: resolveDivisionAddress(row.raw_payload) ?? "Address unavailable.",
  }
}

export async function fetchBranchProfileById(
  branchId: string
): Promise<BranchProfile | null> {
  const supabase = await createSupabaseServerClient()

  const [branchResult, latestDivisionIdResult] = await Promise.all([
    supabase
      .from("branches")
      .select(
        "branch_id,branch_name,branch_address,branch_city,branch_state,branch_zip,last_synced_at"
      )
      .eq("branch_id", branchId)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1),
    supabase
      .from("production_data")
      .select("division_id,funded_date,last_synced_at")
      .eq("branch_id", branchId)
      .not("division_id", "is", null)
      .order("funded_date", { ascending: false, nullsFirst: false })
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1),
  ])

  if (branchResult.error) {
    throw new Error(branchResult.error.message)
  }
  if (latestDivisionIdResult.error) {
    throw new Error(latestDivisionIdResult.error.message)
  }

  const branchRow = ((branchResult.data ?? []) as BranchProfileRpcRow[])[0]
  if (!branchRow) {
    return null
  }

  const divisionId =
    (
      (latestDivisionIdResult.data ?? []) as Array<{
        division_id: string | null
      }>
    )[0]?.division_id ?? null

  let divisionName: string | null = null
  if (divisionId?.trim()) {
    const { data: divisionRows, error: divisionError } = await supabase
      .from("divisions")
      .select("division_id,division_name,last_synced_at")
      .eq("division_id", divisionId)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1)

    if (divisionError) {
      throw new Error(divisionError.message)
    }

    divisionName = ((divisionRows ?? []) as DivisionLookupRpcRow[])[0]?.division_name ?? null
  }

  return {
    branchId,
    name: branchRow.branch_name?.trim() || `Branch ${branchId}`,
    address: resolveBranchAddress(branchRow) || "Address unavailable.",
    divisionId,
    divisionName: divisionName?.trim() || null,
  }
}

export async function fetchBranchLast12MonthsSeries({
  branchId,
  referenceDate = new Date(),
}: {
  branchId: string
  referenceDate?: Date
}): Promise<CanopyProductionSeries> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: DivisionProductionSeriesRpcRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("funded_date,loan_amount")
      .eq("branch_id", branchId)
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as DivisionProductionSeriesRpcRow[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  const byMonth = new Map<
    string,
    {
      count: number
      volume: number
    }
  >()

  for (const month of window.months) {
    byMonth.set(month.key, { count: 0, volume: 0 })
  }

  for (const row of rows) {
    if (!row.funded_date) {
      continue
    }
    const monthKey = row.funded_date.slice(0, 7)
    const entry = byMonth.get(monthKey)
    if (!entry) {
      continue
    }
    entry.count += 1
    entry.volume += toRpcNumber(row.loan_amount)
  }

  return {
    labels: window.months.map((month) => month.label),
    monthlyFundedCounts: window.months.map((month) => byMonth.get(month.key)?.count ?? 0),
    monthlyFundedVolumes: window.months.map((month) => byMonth.get(month.key)?.volume ?? 0),
  }
}

export async function fetchBranchEmployees({
  branchId,
  referenceDate = new Date(),
}: {
  branchId: string
  referenceDate?: Date
}): Promise<DivisionEmployeeSummary[]> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: Array<{
    loan_officer_id: string | null
    processor_id: string | null
    underwriter_id: string | null
    closer_id: string | null
    funder_id: string | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("loan_officer_id,processor_id,underwriter_id,closer_id,funder_id,funded_date")
      .eq("branch_id", branchId)
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as Array<{
      loan_officer_id: string | null
      processor_id: string | null
      underwriter_id: string | null
      closer_id: string | null
      funder_id: string | null
    }>
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  const roleColumns: Array<{
    key: keyof (typeof rows)[number]
    label: string
  }> = [
    { key: "loan_officer_id", label: "Loan Officer" },
    { key: "processor_id", label: "Processor" },
    { key: "underwriter_id", label: "Underwriter" },
    { key: "closer_id", label: "Closer" },
    { key: "funder_id", label: "Funder" },
  ]

  const agg = new Map<
    string,
    {
      roles: Set<string>
      fileTouches: number
    }
  >()

  for (const row of rows) {
    for (const roleColumn of roleColumns) {
      const userId = row[roleColumn.key]
      if (!userId?.trim()) {
        continue
      }
      const current = agg.get(userId) ?? {
        roles: new Set<string>(),
        fileTouches: 0,
      }
      current.roles.add(roleColumn.label)
      current.fileTouches += 1
      agg.set(userId, current)
    }
  }

  const userIds = [...agg.keys()]
  if (userIds.length === 0) {
    return []
  }

  const { data: employeesData, error: employeesError } = await supabase
    .from("employees")
    .select("user_id,user_name,user_email,last_synced_at")
    .in("user_id", userIds)
    .order("last_synced_at", { ascending: false, nullsFirst: false })

  if (employeesError) {
    throw new Error(employeesError.message)
  }

  const employees = ((employeesData ?? []) as unknown) as EmployeeDetailLookupRpcRow[]
  const namesById = buildNameLookup({
    rows: employees,
    getId: (row) => row.user_id,
    getName: (row) => row.user_name,
  })
  const emailById = new Map<string, string | null>()
  for (const row of employees) {
    if (!row.user_id || emailById.has(row.user_id)) {
      continue
    }
    emailById.set(row.user_id, row.user_email)
  }

  return userIds
    .map((userId) => {
      const value = agg.get(userId)
      return {
        userId,
        name: namesById.get(userId) ?? `User ${userId}`,
        email: emailById.get(userId) ?? null,
        roles: [...(value?.roles ?? [])].sort((a, b) => a.localeCompare(b)),
        fileTouches: value?.fileTouches ?? 0,
      }
    })
    .sort((a, b) => {
      if (b.fileTouches !== a.fileTouches) {
        return b.fileTouches - a.fileTouches
      }
      return a.name.localeCompare(b.name)
    })
}

export async function fetchEmployeeProfileById(
  employeeId: string
): Promise<EmployeeProfile | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("employees")
    .select(
      "user_id,user_name,user_email,default_role,associated_processing_orgs,associated_underwriting_orgs,raw_payload,last_synced_at"
    )
    .eq("user_id", employeeId)
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  const row = ((data ?? []) as EmployeeProfileRpcRow[])[0]
  if (!row) {
    return null
  }

  const processingOrgs = (row.associated_processing_orgs ?? []).filter((value) =>
    Boolean(value?.trim())
  )
  const underwritingOrgs = (row.associated_underwriting_orgs ?? []).filter((value) =>
    Boolean(value?.trim())
  )

  return {
    userId: row.user_id ?? employeeId,
    displayName: formatNameLastFirst(row.user_name),
    role: row.default_role?.trim() || null,
    email: row.user_email?.trim() || null,
    phoneNumber:
      getPayloadTextValue(row.raw_payload, [
        "Phone Number",
        "Phone",
        "User Phone",
        "Cell Phone",
        "phone_number",
        "phone",
      ]) ?? null,
    losId:
      getPayloadTextValue(row.raw_payload, [
        "LOS ID",
        "Los ID",
        "LOSID",
        "los_id",
        "User ID",
      ]) ??
      row.user_id ??
      employeeId,
    processingOrgs,
    underwritingOrgs,
    profilePhotoUrl:
      getPayloadTextValue(row.raw_payload, [
        "Profile Photo",
        "Profile Image",
        "Photo URL",
        "Image URL",
        "Avatar URL",
        "profile_photo",
        "photo_url",
        "image_url",
        "avatar_url",
      ]) ?? null,
  }
}

export async function fetchEmployeeLast12MonthsSeries({
  employeeId,
  referenceDate = new Date(),
}: {
  employeeId: string
  referenceDate?: Date
}): Promise<CanopyProductionSeries> {
  const supabase = await createSupabaseServerClient()
  const window = buildLast12MonthWindow(referenceDate)
  const pageSize = 1000
  let from = 0
  const rows: DivisionProductionSeriesRpcRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from("production_data")
      .select("funded_date,loan_amount")
      .or(buildEmployeeRoleOrFilter(employeeId))
      .not("funded_date", "is", null)
      .gte("funded_date", window.startIso)
      .order("funded_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as DivisionProductionSeriesRpcRow[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) {
      break
    }

    from += pageSize
  }

  const byMonth = new Map<
    string,
    {
      count: number
      volume: number
    }
  >()

  for (const month of window.months) {
    byMonth.set(month.key, { count: 0, volume: 0 })
  }

  for (const row of rows) {
    if (!row.funded_date) {
      continue
    }
    const monthKey = row.funded_date.slice(0, 7)
    const entry = byMonth.get(monthKey)
    if (!entry) {
      continue
    }
    entry.count += 1
    entry.volume += toRpcNumber(row.loan_amount)
  }

  return {
    labels: window.months.map((month) => month.label),
    monthlyFundedCounts: window.months.map((month) => byMonth.get(month.key)?.count ?? 0),
    monthlyFundedVolumes: window.months.map((month) => byMonth.get(month.key)?.volume ?? 0),
  }
}

export async function fetchEmployeePointsSummary({
  employeeId,
  limit = 300,
}: {
  employeeId: string
  limit?: number
}): Promise<EmployeePointsSummary> {
  const supabase = await createSupabaseServerClient()
  const runQuery = async (source: "new" | "old") => {
    const tableName =
      source === "new" ? "specialist_points_new" : "specialist_points_old"

    const { data, error } = await supabase
      .from(tableName)
      .select("event_date,event,points")
      .eq("user_id", employeeId)
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    const rows = ((data ?? []) as Array<{
      event_date: string | null
      event: string | null
      points: number | string | null
    }>).map((row) => ({
      eventDate: row.event_date,
      event: row.event,
      points: toRpcNumber(row.points),
    }))

    return {
      source,
      rows,
      totalPoints: rows.reduce((sum, row) => sum + row.points, 0),
    } satisfies EmployeePointsSummary
  }

  const fromNew = await runQuery("new")
  if (fromNew.rows.length > 0) {
    return fromNew
  }

  return runQuery("old")
}

export async function fetchPointsSpecialistsSummary({
  referenceDate = new Date(),
  paOrgIds = [],
}: {
  referenceDate?: Date
  paOrgIds?: string[]
}): Promise<PointsSpecialistsSummary> {
  const supabase = await createSupabaseServerClient()
  const window = buildPointsSpecialistsWindow(referenceDate)
  const normalizedSelectedIds = [...new Set(paOrgIds.map((id) => id.trim()).filter(Boolean))]
  const selectedPaOrgId = normalizedSelectedIds.length === 1 ? normalizedSelectedIds[0] : null
  const { data, error } = await supabase.rpc("get_points_specialists_summary", {
    p_reference_date: window.endIso,
    p_pa_org_id: selectedPaOrgId,
  })

  if (error) {
    throw new Error(error.message)
  }

  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}

  const orgOptions = Array.isArray(payload.org_options)
    ? payload.org_options
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null
          }
          const record = row as Record<string, unknown>
          const id = typeof record.id === "string" ? record.id.trim() : ""
          const name = typeof record.name === "string" ? record.name.trim() : ""
          if (!id) {
            return null
          }
          return {
            id,
            name: name || `PA Org (${id})`,
          }
        })
        .filter((row): row is PointsSpecialistsPaOrgOption => Boolean(row))
    : []

  const monthlySummary = Array.isArray(payload.monthly_summary)
    ? payload.monthly_summary
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null
          }
          const record = row as Record<string, unknown>
          const monthKey =
            typeof record.month_key === "string" ? record.month_key.trim() : null
          const label = typeof record.label === "string" ? record.label.trim() : null
          if (!monthKey || !label) {
            return null
          }
          return {
            monthKey,
            label,
            totalPoints: toRpcNumber(record.total_points as number | string | null),
          }
        })
        .filter((row): row is PointsSpecialistsMonthlyPoint => Boolean(row))
    : []

  const weeklySummary = Array.isArray(payload.weekly_summary)
    ? payload.weekly_summary
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null
          }
          const record = row as Record<string, unknown>
          const weekStartIso =
            typeof record.week_start_iso === "string"
              ? record.week_start_iso.trim()
              : null
          const weekEndIso =
            typeof record.week_end_iso === "string" ? record.week_end_iso.trim() : null
          if (!weekStartIso || !weekEndIso) {
            return null
          }
          return {
            weekStartIso,
            weekEndIso,
            totalPoints: toRpcNumber(record.total_points as number | string | null),
          }
        })
        .filter((row): row is PointsSpecialistsWeeklyPoint => Boolean(row))
        .sort((left, right) => left.weekStartIso.localeCompare(right.weekStartIso))
    : []

  const topUsers = Array.isArray(payload.top_users)
    ? payload.top_users
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null
          }
          const record = row as Record<string, unknown>
          const userId = typeof record.user_id === "string" ? record.user_id.trim() : ""
          if (!userId) {
            return null
          }
          const userName =
            typeof record.user_name === "string" && record.user_name.trim()
              ? record.user_name.trim()
              : `User ${userId}`
          return {
            userId,
            userName,
            totalPoints: toRpcNumber(record.total_points as number | string | null),
          }
        })
        .filter((row): row is PointsSpecialistsTopUser => Boolean(row))
        .sort((left, right) => {
          if (right.totalPoints !== left.totalPoints) {
            return right.totalPoints - left.totalPoints
          }
          return left.userName.localeCompare(right.userName)
        })
        .slice(0, 20)
    : []

  const byPaOrg = Array.isArray(payload.by_pa_org)
    ? payload.by_pa_org
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null
          }
          const record = row as Record<string, unknown>
          const paOrgId =
            typeof record.pa_org_id === "string" ? record.pa_org_id.trim() : ""
          if (!paOrgId) {
            return null
          }
          const paOrgName =
            typeof record.pa_org_name === "string" && record.pa_org_name.trim()
              ? record.pa_org_name.trim()
              : `PA Org (${paOrgId})`
          return {
            paOrgId,
            paOrgName,
            totalPoints: toRpcNumber(record.total_points as number | string | null),
          }
        })
        .filter((row): row is PointsSpecialistsByPaOrgRow => Boolean(row))
        .sort((left, right) => {
          if (right.totalPoints !== left.totalPoints) {
            return right.totalPoints - left.totalPoints
          }
          return left.paOrgName.localeCompare(right.paOrgName)
        })
    : []

  const source =
    payload.source === "old" || payload.source === "new" || payload.source === "hybrid"
      ? payload.source
      : ("new" as const)
  const windowStartIso =
    typeof payload.window_start_iso === "string" && payload.window_start_iso.trim()
      ? payload.window_start_iso.trim()
      : window.startIso
  const windowEndIso =
    typeof payload.window_end_iso === "string" && payload.window_end_iso.trim()
      ? payload.window_end_iso.trim()
      : window.endIso

  return {
    source,
    windowStartIso,
    windowEndIso,
    orgOptions,
    monthlySummary,
    weeklySummary,
    topUsers,
    byPaOrg,
  }
}

export async function fetchEmployeeDirectoryRows(): Promise<EmployeeDirectoryRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_employee_directory_rows")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as EmployeeDirectoryResultRpcRow[]

  return rows
    .map((row) => {
      const payload = row.raw_payload
      const fallbackDivision =
        row.context_division_name?.trim() ||
        (row.context_division_id ? `Division ${row.context_division_id}` : null)
      const fallbackBranch =
        row.context_branch_name?.trim() ||
        (row.context_branch_id ? `Branch ${row.context_branch_id}` : null)
      const fallbackId =
        row.user_id?.trim() ||
        getPayloadTextValue(payload, ["User ID", "user_id"]) ||
        row.user_email?.trim() ||
        "unknown-employee"

      return {
        id: fallbackId,
        employee: row.user_name?.trim() || `Employee ${fallbackId}`,
        jobTitle:
          row.default_role?.trim() ||
          getPayloadTextValue(payload, [
            "Job Title",
            "Title",
            "Position",
            "job_title",
            "title",
            "position",
          ]),
        workEmail:
          row.user_email?.trim() ||
          getPayloadTextValue(payload, [
            "Work Email",
            "Email",
            "User Email",
            "work_email",
            "email",
            "user_email",
          ]),
        mobilePhone: getPayloadTextValue(payload, [
          "Mobile Phone",
          "Phone Number",
          "Phone",
          "Cell Phone",
          "mobile_phone",
          "phone_number",
          "phone",
        ]),
        divisionId: getPayloadTextValue(payload, [
          "Division ID",
          "division_id",
          "DivisionId",
        ]) ?? row.context_division_id ?? null,
        division: getPayloadTextValue(payload, [
          "Division",
          "Division Name",
          "division",
          "division_name",
        ]) ?? fallbackDivision,
        branch: getPayloadTextValue(payload, [
          "Branch",
          "Branch Name",
          "branch",
          "branch_name",
        ]) ?? fallbackBranch,
        branchId: getPayloadTextValue(payload, [
          "Branch ID",
          "branch_id",
          "BranchId",
        ]) ?? row.context_branch_id ?? null,
      }
    })
    .sort((a, b) => a.employee.localeCompare(b.employee))
}

export async function fetchBranchesDirectoryRows(): Promise<BranchDirectoryRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("branches")
    .select(
      "external_row_key,branch_id,accounting_code,branch_name,branch_address,branch_city,branch_state,branch_zip,last_synced_at"
    )
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(5000)

  if (error) {
    throw new Error(error.message)
  }

  const latestByBranchId = new Map<string, BranchDirectoryRpcRow>()
  for (const row of (data ?? []) as BranchDirectoryRpcRow[]) {
    const branchId = row.branch_id?.trim()
    const dedupeKey = branchId || row.external_row_key
    if (!dedupeKey || latestByBranchId.has(dedupeKey)) {
      continue
    }
    latestByBranchId.set(dedupeKey, row)
  }

  return [...latestByBranchId.values()]
    .map((row) => ({
      id: row.branch_id?.trim() || row.external_row_key,
      accountingCode: row.accounting_code?.trim() || null,
      branch: row.branch_name?.trim() || null,
      address: row.branch_address?.trim() || null,
      city: row.branch_city?.trim() || null,
      state: row.branch_state?.trim() || null,
      zip: row.branch_zip?.trim() || null,
    }))
    .sort((a, b) => (a.branch ?? "").localeCompare(b.branch ?? ""))
}

export async function fetchAprilLoanOfficerSummaryFromRpc(): Promise<
  AprilLoanOfficerSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_loan_officer_april_summary")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilLoanOfficerSummaryRpcRow[]

  return rows.map((row) => ({
    loanOfficerId: row.loan_officer_id,
    loanOfficerName: row.loan_officer_name || "Unknown Loan Officer",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchAprilProcessorSummaryFromRpc(): Promise<
  AprilProcessorSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_processor_april_summary")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilProcessorSummaryRpcRow[]

  return rows.map((row) => ({
    processorId: row.processor_id,
    processorName: row.processor_name || "Unknown Processor",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchAprilUnderwriterSummaryFromRpc(): Promise<
  AprilUnderwriterSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_underwriter_april_summary")

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilUnderwriterSummaryRpcRow[]

  return rows.map((row) => ({
    underwriterId: row.underwriter_id,
    underwriterName: row.underwriter_name || "Unknown Underwriter",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchAprilUnderwritingOrgSummaryFromRpc(): Promise<
  AprilUnderwritingOrgSummary[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(
    "get_underwriting_org_april_summary"
  )

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AprilUnderwritingOrgSummaryRpcRow[]

  return rows.map((row) => ({
    underwritingOrgId: row.underwriting_org_id,
    underwritingOrgName: row.underwriting_org_name || "Unknown Underwriting Org",
    fileCount: Number(row.file_count) || 0,
    totalVolume: Number(row.total_volume) || 0,
  }))
}

export async function fetchCorporateTurnSummaryFromRpc(): Promise<CorporateTurnSummary> {
  const supabase = await createSupabaseServerClient()
  const [rowsResult, kpisResult] = await Promise.all([
    supabase.rpc("get_corporate_turn_times_rows"),
    supabase.rpc("get_corporate_turn_times_kpis"),
  ])

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message)
  }
  if (kpisResult.error) {
    throw new Error(kpisResult.error.message)
  }

  const rows = (rowsResult.data ?? []) as CorporateTurnRowRpcRow[]
  const kpiRow = ((kpisResult.data ?? []) as CorporateTurnKpisRpcRow[])[0]

  return {
    tableRows: rows.map((row) => ({
      status: row.status || "Unknown",
      statusType: row.section_type || "Other",
      statusOrder: toRpcNumber(row.status_order) || 999,
      filesInProgress: toRpcNumber(row.files_in_progress),
      workdaysForFilesInProgress: toRpcNumber(row.workdays_for_files_in_progress),
      workdaysToCompleteForPreviousWeek: toRpcNumber(
        row.workdays_to_complete_for_previous_week
      ),
      workdaysToCompleteForPreviousMonth: toRpcNumber(
        row.workdays_to_complete_for_previous_month
      ),
    })),
    kpis: {
      workdaysForLoLoaStatuses: toRpcNumber(kpiRow?.workdays_for_lo_loa_statuses),
      processingRushesLast7Days: toRpcNumber(kpiRow?.processing_rushes_last_7_days),
      underwritingRushesLast7Days: toRpcNumber(
        kpiRow?.underwriting_rushes_last_7_days
      ),
      closingFundingRushesLast7Days: toRpcNumber(
        kpiRow?.closing_funding_rushes_last_7_days
      ),
    },
  }
}

function getPreviousMonthLabel(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1))
}

export async function fetchPreviousMonthLoanProgramSummaryFromRpc(): Promise<PreviousMonthLoanProgramSummary> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(
    "get_funded_loans_by_program_previous_month"
  )

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as PreviousMonthLoanProgramRpcRow[]
  const monthLabel = rows[0]?.month_label || getPreviousMonthLabel()

  return {
    monthLabel,
    rows: rows.map((row) => ({
      programName: row.loan_program || "Unknown Program",
      fundedCount: toRpcNumber(row.funded_count),
      fundedVolume: toRpcNumber(row.funded_volume),
    })),
  }
}

export function getFileQualityMonthOptions(
  referenceDate = new Date()
): FileQualityMonthOption[] {
  const currentMonthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  )
  const start = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - 12,
    1
  )

  return Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + index, 1)
    const nextMonthDate = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      1
    )

    return {
      monthKey: getMonthKey(monthDate),
      label: formatMonthLabel(monthDate),
      startIso: toIsoDate(monthDate),
      endExclusiveIso: toIsoDate(nextMonthDate),
    }
  })
}

export async function fetchFileQualityRollupsForMonth({
  monthKey,
}: {
  monthKey: string
}): Promise<{
  divisionRows: FileQualityRollupRow[]
  branchRows: FileQualityRollupRow[]
  hasExpectedTouches: boolean
  hasNetTouches: boolean
  hasExpectedAndNetMetrics: boolean
}> {
  const monthDate = parseMonthKey(monthKey)
  if (!monthDate) {
    throw new Error("Invalid month.")
  }

  const monthStartIso = toIsoDate(monthDate)
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_file_quality_rollups", {
    p_month_start: monthStartIso,
  })

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as FileQualityRollupRpcRow[]

  const toRow = (row: FileQualityRollupRpcRow): FileQualityRollupRow => ({
    keyId: row.key_id,
    label: row.label,
    fileCount: Number(row.file_count) || 0,
    touchesPerApp: toRpcNumber(row.touches_per_app),
    avgExpectedTouches:
      row.avg_expected_touches === null ? null : toRpcNumber(row.avg_expected_touches),
    netTouches: row.net_touches === null ? null : toRpcNumber(row.net_touches),
  })

  const divisionRows = rows.filter((row) => row.entity_type === "division").map(toRow)
  const branchRows = rows.filter((row) => row.entity_type === "branch").map(toRow)
  const hasExpectedTouches = rows.some((row) => row.avg_expected_touches !== null)
  const hasNetTouches = rows.some((row) => row.net_touches !== null)

  return {
    divisionRows,
    branchRows,
    hasExpectedTouches,
    hasNetTouches,
    hasExpectedAndNetMetrics: hasExpectedTouches && hasNetTouches,
  }
}

export function isLeaderboardEntityKey(value: string): value is LeaderboardEntityKey {
  return (
    value === "division" ||
    value === "branch" ||
    value === "loanOfficer" ||
    value === "processor" ||
    value === "underwriter" ||
    value === "underwritingOrg"
  )
}

async function enrichAprilLeaderboardRows({
  supabase,
  rows,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  rows: AprilLeaderboardFileRpcRow[]
}): Promise<AprilLeaderboardFile[]> {
  const divisionIds = toUniqueNonEmptyStrings(rows.map((row) => row.division_id))
  const branchIds = toUniqueNonEmptyStrings(rows.map((row) => row.branch_id))
  const employeeIds = toUniqueNonEmptyStrings(
    rows.flatMap((row) => [
      row.loan_officer_id,
      row.processor_id,
      row.underwriter_id,
      row.closer_id,
      row.funder_id,
    ])
  )

  const divisionsPromise = divisionIds.length
    ? supabase
        .from("divisions")
        .select("division_id,division_name,last_synced_at")
        .in("division_id", divisionIds)
        .order("last_synced_at", { ascending: false, nullsFirst: false })
    : Promise.resolve({ data: [] as DivisionLookupRpcRow[], error: null })

  const branchesPromise = branchIds.length
    ? supabase
        .from("branches")
        .select("branch_id,branch_name,last_synced_at")
        .in("branch_id", branchIds)
        .order("last_synced_at", { ascending: false, nullsFirst: false })
    : Promise.resolve({ data: [] as BranchLookupRpcRow[], error: null })

  const employeesPromise = employeeIds.length
    ? supabase
        .from("employees")
        .select("user_id,user_name,last_synced_at")
        .in("user_id", employeeIds)
        .order("last_synced_at", { ascending: false, nullsFirst: false })
    : Promise.resolve({ data: [] as EmployeeLookupRpcRow[], error: null })

  const [divisionsResult, branchesResult, employeesResult] = await Promise.all([
    divisionsPromise,
    branchesPromise,
    employeesPromise,
  ])

  if (divisionsResult.error) {
    throw new Error(divisionsResult.error.message)
  }
  if (branchesResult.error) {
    throw new Error(branchesResult.error.message)
  }
  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }

  const divisionNamesById = buildNameLookup({
    rows: (divisionsResult.data ?? []) as DivisionLookupRpcRow[],
    getId: (row) => row.division_id,
    getName: (row) => row.division_name,
  })
  const branchNamesById = buildNameLookup({
    rows: (branchesResult.data ?? []) as BranchLookupRpcRow[],
    getId: (row) => row.branch_id,
    getName: (row) => row.branch_name,
  })
  const employeeNamesById = buildNameLookup({
    rows: (employeesResult.data ?? []) as EmployeeLookupRpcRow[],
    getId: (row) => row.user_id,
    getName: (row) => row.user_name,
  })

  return rows.map((row) => ({
    externalRowKey: row.external_row_key,
    divisionId: row.division_id,
    branchId: row.branch_id,
    loanOfficerId: row.loan_officer_id,
    processorId: row.processor_id,
    underwriterId: row.underwriter_id,
    underwritingOrgId: row.underwriting_org_id,
    loanNumber: row.loan_number,
    borrower: row.borrower,
    address: row.address,
    cityStateZip: toCityStateZip(row),
    loanType: row.loan_type,
    loanPurpose: row.loan_purpose,
    loanTerm:
      row.loan_term === null || row.loan_term === undefined
        ? null
        : Math.trunc(toRpcNumber(row.loan_term)),
    investor: row.investor,
    division: resolveLookupName(row.division_id, divisionNamesById, "Division"),
    branch: resolveLookupName(row.branch_id, branchNamesById, "Branch"),
    loanOfficer: resolveLookupName(
      row.loan_officer_id,
      employeeNamesById,
      "User"
    ),
    processor: resolveLookupName(row.processor_id, employeeNamesById, "User"),
    underwriter: resolveLookupName(row.underwriter_id, employeeNamesById, "User"),
    underwritingOrg: resolveUnderwritingOrgName({
      underwritingOrgId: row.underwriting_org_id,
      branchNamesById,
      divisionNamesById,
    }),
    closer: resolveLookupName(row.closer_id, employeeNamesById, "User"),
    funder: resolveLookupName(row.funder_id, employeeNamesById, "User"),
    lastStatus: row.last_status,
    estimatedClosingDate: row.estimated_closing_date,
    closedDate: row.closed_date,
    loanAmount: toRpcNumber(row.loan_amount),
  }))
}

export async function fetchPipelineFilesForUser({
  userId,
  view,
  referenceDate = new Date(),
  limit = 5000,
}: {
  userId: string
  view: PipelineViewKey
  referenceDate?: Date
  limit?: number
}): Promise<AprilLeaderboardFile[]> {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) {
    return []
  }

  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from("production_data")
    .select(
      [
        "external_row_key",
        "loan_number",
        "borrower",
        "address",
        "city",
        "state",
        "zip_code",
        "loan_type",
        "loan_purpose",
        "loan_term",
        "investor",
        "division_id",
        "branch_id",
        "loan_officer_id",
        "processor_id",
        "underwriter_id",
        "underwriting_org_id",
        "closer_id",
        "funder_id",
        "last_status",
        "estimated_closing_date",
        "closed_date",
        "loan_amount",
      ].join(",")
    )
    .or(buildLoanOfficerOrProcessorFilter(normalizedUserId))
    .limit(limit)

  if (view === "active") {
    query = query
      .eq("classification", "Active")
      .order("estimated_closing_date", { ascending: true, nullsFirst: false })
  } else if (view === "new-applications") {
    query = query
      .in("last_status", [...PIPELINE_NEW_APPLICATION_STATUSES])
      .order("estimated_closing_date", { ascending: true, nullsFirst: false })
  } else {
    const start = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate()
    )
    const end = new Date(start)
    end.setDate(end.getDate() + 30)

    query = query
      .not("estimated_closing_date", "is", null)
      .gte("estimated_closing_date", toIsoDate(start))
      .lte("estimated_closing_date", toIsoDate(end))
      .order("estimated_closing_date", { ascending: true, nullsFirst: false })
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown) as AprilLeaderboardFileRpcRow[]
  return enrichAprilLeaderboardRows({ supabase, rows })
}

export async function fetchFileViewerFiles({
  entity,
  entityId,
  employeeId,
  closedDateStart,
  closedDateEnd,
  openPipelineOnly = false,
  limit = 500,
}: {
  entity?: LeaderboardEntityKey | null
  entityId?: string | null
  employeeId?: string | null
  closedDateStart?: string | null
  closedDateEnd?: string | null
  openPipelineOnly?: boolean
  limit?: number
}): Promise<AprilLeaderboardFile[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from("production_data")
    .select(
      [
        "external_row_key",
        "loan_number",
        "borrower",
        "address",
        "city",
        "state",
        "zip_code",
        "loan_type",
        "loan_purpose",
        "loan_term",
        "investor",
        "division_id",
        "branch_id",
        "loan_officer_id",
        "processor_id",
        "underwriter_id",
        "underwriting_org_id",
        "closer_id",
        "funder_id",
        "last_status",
        "estimated_closing_date",
        "closed_date",
        "loan_amount",
      ].join(",")
    )
    .order("closed_date", { ascending: false })
    .order("loan_amount", { ascending: false, nullsFirst: false })
    .limit(limit)

  if (closedDateStart) {
    query = query.gte("closed_date", closedDateStart)
  }
  if (closedDateEnd) {
    query = query.lte("closed_date", closedDateEnd)
  }
  if (openPipelineOnly) {
    query = query.is("funded_date", null).is("closed_date", null)
  }
  if (employeeId?.trim()) {
    query = query.or(buildEmployeeRoleOrFilter(employeeId))
  }

  const applyEqualityFilter = (column: string) => {
    if (entityId === null) {
      query = query.is(column, null)
      return
    }

    if (typeof entityId === "string") {
      query = query.eq(column, entityId)
    }
  }

  if (typeof entityId !== "undefined" && entity) {
    switch (entity) {
      case "division":
        applyEqualityFilter("division_id")
        break
      case "branch":
        applyEqualityFilter("branch_id")
        break
      case "loanOfficer":
        applyEqualityFilter("loan_officer_id")
        break
      case "processor":
        applyEqualityFilter("processor_id")
        break
      case "underwriter":
        applyEqualityFilter("underwriter_id")
        break
      case "underwritingOrg":
        applyEqualityFilter("underwriting_org_id")
        break
      default:
        break
    }
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown) as AprilLeaderboardFileRpcRow[]
  return enrichAprilLeaderboardRows({ supabase, rows })
}

export async function fetchAprilLeaderboardFiles({
  entity,
  entityId,
  referenceDate = new Date(),
}: {
  entity: LeaderboardEntityKey
  entityId: string | null
  referenceDate?: Date
}): Promise<AprilLeaderboardFile[]> {
  const year = referenceDate.getFullYear()

  return fetchFileViewerFiles({
    entity,
    entityId,
    closedDateStart: `${year}-04-01`,
    closedDateEnd: `${year}-04-30`,
    limit: 500,
  })
}
