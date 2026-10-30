import {
  departmentEventKey,
  isSupportedTargetTable,
  mapBranchRow,
  mapEmployeeRow,
  mapProcessingEventRow,
  mapProductionDataRow,
  mapUnderwritingEventRow,
  transformByTargetTable,
} from "./transforms.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("maps production rows into normalized raw table columns", () => {
  const result = mapProductionDataRow({
    "Loan Number": "LN-100",
    Borrower: "Ada Lovelace",
    Funded: "2026-07-15",
    "Loan Amount": "500000",
    "Is Cash Out": "true",
  });

  assertEquals(result.external_row_key, "LN-100");
  assertEquals(result.row.loan_number, "LN-100");
  assertEquals(result.row.borrower, "Ada Lovelace");
  assertEquals(result.row.funded_date, "2026-07-15");
  assertEquals(result.row.loan_amount, 500000);
  assertEquals(result.row.is_cash_out, true);
});

Deno.test("maps branch and employee rows", () => {
  assertEquals(mapBranchRow({ "Branch ID": "B1", "Branch Name": "Main" }).row.branch_name, "Main");
  assertEquals(
    mapEmployeeRow({
      "User ID": "U1",
      "User Name": "Grace Hopper",
      "Associated Processing Orgs": '["PA1","PA2"]',
    }).row.associated_processing_orgs,
    ["PA1", "PA2"],
  );
});

Deno.test("dispatches transformByTargetTable for supported tables only", () => {
  assertEquals(isSupportedTargetTable("production_data"), true);
  assertEquals(isSupportedTargetTable("processing_events"), true);
  assertEquals(isSupportedTargetTable("underwriting_events"), true);
  assertEquals(isSupportedTargetTable("unknown"), false);
  assertEquals(transformByTargetTable("branches", [{ "Branch ID": "B1" }]).length, 1);
  assertEquals(
    transformByTargetTable("processing_events", [{ AppId: "A1", Event: "Funded", EmployeeId: "E1", Date: "2026-10-01" }]).length,
    1,
  );
});

Deno.test("department event keys stay stable when measures change", () => {
  const key = departmentEventKey({
    appId: "A1",
    event: "Funded",
    employeeId: "E1",
    eventDate: "2026-10-15",
  });
  const first = mapProcessingEventRow({
    AppId: "A1",
    Event: "Funded",
    EmployeeId: "E1",
    Date: "2026-10-15",
    Points: "1.5",
    "Processing Net Workdays": "4",
    "Docs to Closing": "2",
    "Is Closing/Funding Rush": "Yes",
    "Rush %": "100%",
    "Processing Organization": "Org One",
    OrganizationId: "PA1",
    Employee: "Ada",
  });
  const second = mapProcessingEventRow({
    AppId: "A1",
    Event: "Funded",
    EmployeeId: "E1",
    Date: "2026-10-15",
    Points: "9",
  });
  const otherEvent = mapProcessingEventRow({
    AppId: "A1",
    Event: "Processed",
    EmployeeId: "E1",
    Date: "2026-10-15",
    Points: "1.5",
  });

  assertEquals(first.external_row_key, key);
  assertEquals(second.external_row_key, key);
  assertEquals(first.source_record_hash === second.source_record_hash, false);
  assertEquals(otherEvent.external_row_key === key, false);
  assertEquals(first.row.points, 1.5);
  assertEquals(first.row.processing_net_workdays, 4);
  assertEquals(first.row.docs_to_closing, 2);
  assertEquals(first.row.is_closing_funding_rush, true);
  assertEquals(first.row.organization_id, "PA1");
  assertEquals(first.row.event_date, "2026-10-15");
});

Deno.test("maps underwriting event rows from Qlik cells", () => {
  const result = mapUnderwritingEventRow({
    AppId: { qText: "U1" },
    Event: { qText: "Initial Review Complete" },
    EmployeeId: { qText: "W1" },
    Date: { qText: "2026-10-01" },
    Points: { qText: "1", qNum: 1 },
    "Workdays in Initial Review": { qNum: 3 },
    "# of QCs": { qText: "2" },
    "Avg QC Score": { qText: "4.5" },
    IsBadLoan: { qText: "No" },
    "Bad Loan %": { qText: "0%" },
    "Underwriting Organization": { qText: "UW Org" },
    OrganizationId: { qText: "UW1" },
    "Submitted for Initial Review": { qText: "2026-09-28" },
    "Initial Review Complete": { qText: "2026-10-01" },
  });

  assertEquals(
    result.external_row_key,
    departmentEventKey({
      appId: "U1",
      event: "Initial Review Complete",
      employeeId: "W1",
      eventDate: "2026-10-01",
    }),
  );
  assertEquals(result.row.workdays_in_initial_review, 3);
  assertEquals(result.row.qc_count, 2);
  assertEquals(result.row.avg_qc_score, 4.5);
  assertEquals(result.row.is_bad_loan, false);
  assertEquals(result.row.initial_review_complete, "2026-10-01");
  assertEquals(result.row.submitted_for_initial_review, "2026-09-28");
  assertEquals(result.row.organization_name, "UW Org");
});
