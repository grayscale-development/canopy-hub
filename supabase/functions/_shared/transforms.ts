import type { RowRecord, TargetTableName, TransformedRowResult } from "./types.ts";
import {
  stableHash,
  toBoolean,
  toDate,
  toInteger,
  toNullableText,
  toNumber,
  toNumberPreferText,
  toTextArray,
  toTimestamp,
} from "./utils.ts";

function withMeta(payload: Record<string, unknown>, rawRow: RowRecord): Record<string, unknown> {
  return {
    ...payload,
    raw_payload: rawRow,
  };
}

function finalise(row: Record<string, unknown>, externalKey: string | null): TransformedRowResult {
  const normalized = { ...row };
  const sourceRecordHash = stableHash(normalized);
  return {
    external_row_key: externalKey || stableHash(normalized),
    source_record_hash: sourceRecordHash,
    row: {
      ...row,
      source_record_hash: sourceRecordHash,
      last_synced_at: new Date().toISOString(),
    },
  };
}

export function mapProductionDataRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      loan_number: toNullableText(rawRow["Loan Number"]),
      branch_id: toNullableText(rawRow["Branch ID"]),
      borrower: toNullableText(rawRow["Borrower"]),
      prospect_date: toDate(rawRow["Prospect Date"]),
      application_date: toDate(rawRow["Application Date"]),
      pre_processing_date: toDate(rawRow["Pre-Processing"]),
      submitted_for_ir_date: toDate(rawRow["Submitted for IR"]),
      processing_date: toDate(rawRow["Processing"]),
      submitted_for_uw_date: toDate(rawRow["Submitted for UW"]),
      initial_conditions_submitted_date: toDate(rawRow["Initial Conditions Submitted"]),
      initial_conditions_cleared_date: toDate(rawRow["Initial Conditions Cleared"]),
      underwritten_date: toDate(rawRow["Underwritten"]),
      clear_to_close_date: toDate(rawRow["Clear to Close"]),
      final_conditions_submitted_date: toDate(rawRow["Final Conditions Submitted"]),
      final_conditions_cleared_date: toDate(rawRow["Final Conditions Cleared"]),
      released_to_closer_date: toDate(rawRow["Released to Closer"]),
      closed_date: toDate(rawRow["Closed Date"]),
      funded_date: toDate(rawRow["Funded"]),
      last_status: toNullableText(rawRow["Last Status"]),
      last_status_date: toDate(rawRow["Last Status Date"]),
      loan_officer_id: toNullableText(rawRow["Loan Officer ID"]),
      loan_officer_assistant_id: toNullableText(rawRow["Loan Officer Assistant ID"]),
      processor_id: toNullableText(rawRow["Processor ID"]),
      underwriter_id: toNullableText(rawRow["Underwriter ID"]),
      closer_id: toNullableText(rawRow["Closer ID"]),
      funder_id: toNullableText(rawRow["Funder ID"]),
      interest_rate: toNumber(rawRow["Interest Rate"]),
      locked_date: toDate(rawRow["Locked Date"]),
      lock_expiration_date: toDate(rawRow["Lock Expiration Date"]),
      estimated_closing_date: toDate(rawRow["Estimated Closing Date"]),
      loan_amount: toNumber(rawRow["Loan Amount"]),
      loan_type: toNullableText(rawRow["Loan Type"]),
      investor: toNullableText(rawRow["Investor"]),
      investor_loan_number: toNullableText(rawRow["Investor Loan Number"]),
      amortization_type: toNullableText(rawRow["Amortization Type"]),
      loan_purpose: toNullableText(rawRow["Loan Purpose"]),
      is_cash_out: toBoolean(rawRow["Is Cash Out"]),
      lien_position: toNullableText(rawRow["Lien Position"]),
      address: toNullableText(rawRow["Address"]),
      city: toNullableText(rawRow["City"]),
      state: toNullableText(rawRow["State"]),
      zip_code: toNullableText(rawRow["Zip Code"]),
      property_type: toNullableText(rawRow["Property Type"]),
      business_channel: toNullableText(rawRow["Business Channel"]),
      occupancy: toNullableText(rawRow["Occupancy"]),
      loan_term: toInteger(rawRow["Loan Term"]),
      processing_org_id: toNullableText(rawRow["Processing Org ID"]),
      pa_org_id: toNullableText(rawRow["PA Org ID"]),
      underwriting_org_id: toNullableText(rawRow["Underwriting Org ID"]),
      division_id: toNullableText(rawRow["Division ID"]),
      is_under_construction: toBoolean(rawRow["Is Under Construction"]),
      first_cd_completed_date: toDate(rawRow["First CD Completed"]),
      classification: toNullableText(rawRow["Classification"]),
      loan_product: toNullableText(rawRow["Loan Product"]),
      business_days_in_current_status: toNumber(rawRow["Business Days in Current Status"]),
      business_days_since_pre_processing: toNumber(rawRow["Business Days Since Pre-Processing"]),
      business_days_to_closing: toNumber(rawRow["Business Days to Closing"]),
    },
    rawRow,
  );

  return finalise(row, (row.loan_number as string | null) ?? null);
}

export function mapDivisionRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      division_id: toNullableText(rawRow["Division ID"]),
      division_name: toNullableText(rawRow["Division Name"]),
    },
    rawRow,
  );
  return finalise(row, (row.division_id as string | null) ?? null);
}

export function mapBranchRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      branch_id: toNullableText(rawRow["Branch ID"]),
      accounting_code: toNullableText(rawRow["Accounting Code"]),
      branch_name: toNullableText(rawRow["Branch Name"]),
      branch_address: toNullableText(rawRow["Branch Address"]),
      branch_city: toNullableText(rawRow["BranchCity"]),
      branch_state: toNullableText(rawRow["BranchState"]),
      branch_zip: toNullableText(rawRow["BranchZip"]),
    },
    rawRow,
  );
  return finalise(row, (row.branch_id as string | null) ?? null);
}

export function mapEmployeeRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      user_id: toNullableText(rawRow["User ID"]),
      user_name: toNullableText(rawRow["User Name"]),
      user_email: toNullableText(rawRow["User Email"]),
      default_role: toNullableText(rawRow["Default Role"]),
      user_is_active: toBoolean(rawRow["User Is Active"]),
      associated_processing_orgs: toTextArray(rawRow["Associated Processing Orgs"]),
      associated_underwriting_orgs: toTextArray(rawRow["Associated Underwriting Orgs"]),
    },
    rawRow,
  );
  return finalise(row, (row.user_id as string | null) ?? null);
}

export function mapCorporateTurnTimeRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      production_status_order: toInteger(rawRow["Production Status Order"]),
      production_status: toNullableText(rawRow["Production Status"]),
      production_status_type: toNullableText(rawRow["Production Status Type"]),
      files_in_progress: toNumber(rawRow["Files in Progress"]),
      workdays_for_files_in_progress: toNumber(rawRow["Workdays for Files in Progress"]),
      workdays_to_complete_for_previous_month: toNumberPreferText(
        rawRow["Workdays to Complete for Previous Month"],
      ),
      workdays_for_lo_loa_statuses: toNumberPreferText(rawRow["Workdays for LO/LOA Statuses"]),
      processing_rushes_last_7_days: toNumberPreferText(rawRow["Processing Rushes (Last 7 Days)"]),
      underwriting_rushes_last_7_days: toNumberPreferText(rawRow["Underwriting Rushes (Last 7 Days)"]),
      closing_funding_rushes_last_7_days: toNumberPreferText(rawRow["Closing/Funding Rushes (Last 7 Days)"]),
      data_last_imported_from_nano: toTimestamp(rawRow["Data Last Imported from Nano"]),
      workdays_to_complete_for_previous_week: toNumberPreferText(
        rawRow["Workdays to Complete for Previous Week"],
      ),
    },
    rawRow,
  );

  return finalise(row, stableHash(row));
}

export function mapFileQualityRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      loan_number: toNullableText(rawRow["Loan Number"]),
      expected_touches: toNumber(rawRow["Expected Touches"]),
      branch_id: toNullableText(rawRow["Branch ID"]),
      division_id: toNullableText(rawRow["Division ID"]),
      loan_officer_id: toNullableText(rawRow["Loan Officer ID"]),
      processor_id: toNullableText(rawRow["Processor ID"]),
      touch_count: toNumber(rawRow["Touch Count"]),
      net_touches: toNumber(rawRow["Net Touches"]),
    },
    rawRow,
  );
  return finalise(row, (row.loan_number as string | null) ?? null);
}

export function mapSpecialistPointsOldRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      app_id: toNullableText(rawRow["AppId"]),
      pa_org_id: toNullableText(rawRow["PA Org ID"]),
      record_id: toNullableText(rawRow["RecordId"]),
      event: toNullableText(rawRow["Event"]),
      event_date: toDate(rawRow["Date"]),
      user_id: toNullableText(rawRow["User ID"]),
      points: toNumber(rawRow["Points"]),
      month_date: toDate(rawRow["Month"]),
    },
    rawRow,
  );
  return finalise(row, stableHash(row));
}

export function mapSpecialistPointsNewRow(rawRow: RowRecord): TransformedRowResult {
  const row = withMeta(
    {
      app_id: toNullableText(rawRow["AppId"]),
      pa_org_id: toNullableText(rawRow["PA Org ID"]),
      record_id: toNullableText(rawRow["RecordId"]),
      event: toNullableText(rawRow["Event"]),
      event_date: toDate(rawRow["Date"]),
      user_id: toNullableText(rawRow["User ID"]),
      points: toNumber(rawRow["Points"]),
      month_date: toDate(rawRow["Month"]),
    },
    rawRow,
  );
  return finalise(row, stableHash(row));
}

export function transformByTargetTable(
  targetTableName: TargetTableName,
  rows: RowRecord[],
): TransformedRowResult[] {
  switch (targetTableName) {
    case "production_data":
      return rows.map(mapProductionDataRow);
    case "divisions":
      return rows.map(mapDivisionRow);
    case "branches":
      return rows.map(mapBranchRow);
    case "employees":
      return rows.map(mapEmployeeRow);
    case "corporate_turn_times":
      return rows.map(mapCorporateTurnTimeRow);
    case "file_quality_data":
      return rows.map(mapFileQualityRow);
    case "specialist_points_old":
      return rows.map(mapSpecialistPointsOldRow);
    case "specialist_points_new":
      return rows.map(mapSpecialistPointsNewRow);
    default:
      return [];
  }
}

export function isSupportedTargetTable(value: string | null): value is TargetTableName {
  return (
    value === "production_data" ||
    value === "divisions" ||
    value === "branches" ||
    value === "employees" ||
    value === "corporate_turn_times" ||
    value === "file_quality_data" ||
    value === "specialist_points_old" ||
    value === "specialist_points_new"
  );
}
