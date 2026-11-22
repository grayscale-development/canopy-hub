import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const script = path.resolve("scripts/ci-failure-summary.mjs")

describe("CI failure summaries", () => {
  it.each([
    [
      "vitest",
      {
        testResults: [
          {
            status: "failed",
            assertionResults: [
              {
                status: "failed",
                fullName: "WikiEditor saves",
                failureMessages: [
                  "AssertionError: private-value\n at tests/components/wiki-editor.test.tsx:42:3",
                ],
              },
            ],
          },
        ],
      },
    ],
    [
      "playwright",
      {
        suites: [
          {
            title: "wiki",
            specs: [
              {
                title: "saves",
                tests: [
                  {
                    status: "unexpected",
                    results: [
                      {
                        status: "failed",
                        errors: [
                          {
                            message:
                              "Error: expect(locator).toBeVisible() private-value\n at tests/e2e/wiki.spec.ts:21:4",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    [
      "tap",
      "TAP version 13\nnot ok 1 - saves\n  AssertionError: private-value\n  at tests/functions/example.test.ts:10:2\nok 2 - works\n",
    ],
  ])(
    "extracts %s failures without copying raw error messages",
    (kind, report) => {
      const dir = mkdtempSync(path.join(tmpdir(), "canopy-summary-"))
      try {
        writeFileSync(
          path.join(dir, "report.json"),
          typeof report === "string" ? report : JSON.stringify(report)
        )
        const result = spawnSync(
          process.execPath,
          [script, "Test job", kind, "report.json"],
          { cwd: dir, encoding: "utf8" }
        )
        expect(result.status).toBe(0)
        const summary = readFileSync(
          path.join(dir, "failure-summary.txt"),
          "utf8"
        )
        expect(summary).toContain("Job: Test job")
        expect(summary).toContain("saves")
        expect(summary).toContain("tests/")
        expect(summary).not.toContain("private-value")
      } finally {
        unlinkSync(path.join(dir, "report.json"))
        unlinkSync(path.join(dir, "failure-summary.txt"))
        rmdirSync(dir)
      }
    }
  )
})
