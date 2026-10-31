import {
  chunkArray,
  departmentEventTimestamp,
  normalizeColumnName,
  stableHash,
  toBoolean,
  toDate,
  toNumber,
  toTextArray,
  toTimestamp,
} from "./utils.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("normalizes column names", () => {
  assertEquals(normalizeColumnName(" Loan Officer ID "), "loan_officer_id");
});

Deno.test("chunks arrays without dropping items", () => {
  assertEquals(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

Deno.test("converts Qlik-like cell values", () => {
  assertEquals(toNumber({ qText: "1,250" }), 1250);
  assertEquals(toBoolean({ qText: "yes" }), true);
  assertEquals(toBoolean({ qNum: 0 }), false);
  assertEquals(toTextArray({ qText: "A; B|C" }), ["A", "B", "C"]);
});

Deno.test("converts parseable date and timestamp values", () => {
  assertEquals(toDate({ qText: "2026-07-15" }), "2026-07-15");
  assertEquals(
    toTimestamp({ qText: "2026-07-15T12:30:00.000Z" }),
    "2026-07-15T12:30:00.000Z",
  );
});

Deno.test("department event timestamps keep the Qlik wall clock", () => {
  assertEquals(departmentEventTimestamp("10/29/2026 11:48:56 AM"), {
    eventAt: "2026-10-29T11:48:56.000Z",
    eventDate: "2026-10-29",
  });
  assertEquals(departmentEventTimestamp("10/29/2026 11:48:56 PM"), {
    eventAt: "2026-10-29T23:48:56.000Z",
    eventDate: "2026-10-29",
  });
  assertEquals(departmentEventTimestamp({ qText: "2026-10-15" }), {
    eventAt: "2026-10-15T00:00:00.000Z",
    eventDate: "2026-10-15",
  });
  assertEquals(
    departmentEventTimestamp({ qText: "2026-10-29T11:48:56.000Z", qNum: 1 }),
    {
      eventAt: "2026-10-29T11:48:56.000Z",
      eventDate: "2026-10-29",
    },
  );

  const serial = (Date.UTC(2026, 9, 29, 12, 0, 0) - Date.UTC(1899, 11, 30)) / 86400000;
  assertEquals(departmentEventTimestamp({ qText: "10/29/2026", qNum: serial }), {
    eventAt: "2026-10-29T12:00:00.000Z",
    eventDate: "2026-10-29",
  });
  assertEquals(departmentEventTimestamp({ qNum: serial }), {
    eventAt: "2026-10-29T12:00:00.000Z",
    eventDate: "2026-10-29",
  });
});

Deno.test("stableHash is object-key-order independent", () => {
  assertEquals(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
});
