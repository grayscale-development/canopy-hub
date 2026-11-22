import { describe, expect, it } from "vitest"
import {
  regressions,
  scoreResults,
  type EvalResult,
} from "@/scripts/milo-eval-score"

describe("Milo eval scoring", () => {
  it("scores ranked page hits, matching citation URLs and actual abstention decisions", () => {
    const results: EvalResult[] = [
      {
        testCase: {
          id: "a",
          question: "a",
          kind: "answerable",
          expectedPages: ["a"],
        },
        expectedUrls: { a: "/wiki/1" },
        abstained: false,
        rows: [
          { page: "other", title: "Other", url: "/wiki/2" },
          { page: "a", title: "A", url: "/wiki/1" },
        ],
      },
      {
        testCase: {
          id: "b",
          question: "b",
          kind: "answerable",
          expectedPages: ["b"],
        },
        expectedUrls: { b: "/wiki/3" },
        abstained: false,
        rows: [{ page: "b", title: "B", url: "/stale" }],
      },
      {
        testCase: {
          id: "c",
          question: "c",
          kind: "unanswerable",
          expectedPages: [],
        },
        expectedUrls: {},
        abstained: true,
        rows: [],
      },
      {
        testCase: {
          id: "d",
          question: "d",
          kind: "unanswerable",
          expectedPages: [],
        },
        expectedUrls: {},
        abstained: false,
        rows: [{ page: null, title: "Unrelated", url: null }],
      },
    ]
    expect(scoreResults(results)).toEqual({
      hitAt1: 0.5,
      hitAt3: 1,
      citationCorrectness: 0.5,
      abstentionRate: 0.5,
    })
    expect(
      regressions(
        scoreResults(results),
        {
          hitAt1: 0.6,
          hitAt3: 1,
          citationCorrectness: 0.8,
          abstentionRate: 0.5,
        },
        0.1
      )
    ).toEqual(["citationCorrectness"])
  })
})
