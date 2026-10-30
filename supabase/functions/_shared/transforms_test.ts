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
