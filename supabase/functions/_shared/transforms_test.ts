import {
  isSupportedTargetTable,
  mapBranchRow,
  mapEmployeeRow,
  mapProductionDataRow,
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
  assertEquals(isSupportedTargetTable("unknown"), false);
  assertEquals(transformByTargetTable("branches", [{ "Branch ID": "B1" }]).length, 1);
});
