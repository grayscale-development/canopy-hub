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

function specialistPointsRawRow(
  overrides: Record<string, unknown> = {},
  elemNumber = 1,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    AppId: "app-1",
    "PA Org ID": "pa-1",
    RecordId: "rec-1",
    Event: "Submitted",
    Date: "2026-04-02",
    "User ID": "user-1",
    Points: "3.5",
    Month: "2026-04-01",
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      const text = value === null || value === undefined ? "" : String(value);
      const numeric = Number(text.replace(/,/g, ""));
      const cell: Record<string, unknown> = {
        qText: text,
        qElemNumber: elemNumber,
        qState: elemNumber === 1 ? "O" : "L",
      };
      // Match Qlik: numeric measures carry qNum, which toNumber prefers over qText.
      if (text.trim() && Number.isFinite(numeric)) cell.qNum = numeric;
      return [key, cell];
    }),
  );
}

function keysFor(rows: Array<Record<string, unknown>>): string[] {
  return transformByTargetTable("specialist_points_new", rows).map((row) => row.external_row_key);
}

Deno.test("specialist points new keys stay stable when only Qlik cell metadata changes", () => {
  const first = transformByTargetTable("specialist_points_new", [
    {
      ...specialistPointsRawRow({ "Reload Token": "2026-10-29T01:00:00Z" }, 4),
    },
  ]);
  const second = transformByTargetTable("specialist_points_new", [
    {
      ...specialistPointsRawRow({ "Reload Token": "2026-10-30T01:00:00Z" }, 91),
    },
  ]);

  assertEquals(first[0]?.external_row_key, second[0]?.external_row_key);
  assertEquals(/^[0-9a-f]{64}$/.test(first[0]?.external_row_key ?? ""), true);
  if (first[0]?.source_record_hash === second[0]?.source_record_hash) {
    throw new Error("source_record_hash should still change when the raw payload changes");
  }
});

Deno.test("specialist points new keys differ for different logical rows", () => {
  const [submitted, cleared, otherRecord] = keysFor([
    specialistPointsRawRow(),
    specialistPointsRawRow({ Event: "Cleared" }),
    specialistPointsRawRow({ RecordId: "rec-2" }),
  ]);

  if (submitted === cleared || submitted === otherRecord || cleared === otherRecord) {
    throw new Error(`Expected distinct keys, got ${JSON.stringify([submitted, cleared, otherRecord])}`);
  }
});

Deno.test("repeated specialist points identities get a stable occurrence rank", () => {
  const low = specialistPointsRawRow({ Points: "1" });
  const high = specialistPointsRawRow({ Points: "5" });
  const forward = keysFor([low, high]);
  const reversed = keysFor([high, low]);

  assertEquals(forward[0], reversed[1]);
  assertEquals(forward[1], reversed[0]);
  if (forward[0] === forward[1]) {
    throw new Error("Distinct points rows in the same identity group collapsed to one key");
  }

  const samePointsEarlierMonth = specialistPointsRawRow({ Points: "2", Month: "2026-03-01" });
  const samePointsLaterMonth = specialistPointsRawRow({ Points: "2", Month: "2026-04-01" });
  const byMonth = keysFor([samePointsLaterMonth, samePointsEarlierMonth]);
  const byMonthAgain = keysFor([samePointsEarlierMonth, samePointsLaterMonth]);
  assertEquals(byMonth[0], byMonthAgain[1]);
  assertEquals(byMonth[1], byMonthAgain[0]);

  const identical = specialistPointsRawRow({ Points: "2", Month: "2026-04-01" });
  const firstPass = keysFor([identical, identical]);
  const secondPass = keysFor([identical, identical]);
  assertEquals(firstPass, secondPass);
  if (firstPass[0] === firstPass[1]) {
    throw new Error("Identical rows in one batch must keep distinct occurrence keys");
  }
});

Deno.test("specialist points old keys still follow the raw payload", () => {
  const first = transformByTargetTable("specialist_points_old", [specialistPointsRawRow({}, 1)]);
  const second = transformByTargetTable("specialist_points_old", [specialistPointsRawRow({}, 2)]);

  if (first[0]?.external_row_key === second[0]?.external_row_key) {
    throw new Error("specialist_points_old key changed behaviour");
  }
});
