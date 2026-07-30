import {
  chunkArray,
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

Deno.test("stableHash is object-key-order independent", () => {
  assertEquals(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
});
