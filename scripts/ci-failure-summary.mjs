import { readFileSync, writeFileSync } from "node:fs"

const [job, kind, reportPath] = process.argv.slice(2)
const lines = [`Job: ${job}`]

// Test titles are useful for locating failures, but never include quoted values,
// URLs, or credential-shaped strings from a parameterized test title.
function safeTitle(value) {
  return String(value ?? "Unknown test")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(["'`]).*?\1/g, "[value]")
    .replace(
      /\b(?:bearer|token|password|secret|key)\s*[:=]\s*\S+/gi,
      "[credential]"
    )
    .replace(/\b[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]+)*/g, "[value]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200)
}

// Only copy error types, matcher names and repository locations. Raw error
// messages and stack frames can contain request bodies, credentials or URLs.
function diagnostic(message) {
  const text = String(message ?? "").replace(/\x1b\[[0-9;]*m/g, "")
  const type =
    text.match(
      /\b(AssertionError|TimeoutError|TypeError|SyntaxError|ReferenceError|Error)\b/
    )?.[1] ?? "Test failure"
  const matcher = text.match(/\b(to[A-Z][A-Za-z]+)\s*\(/)?.[1]
  const assertion = text.match(
    /\bexpected\b[^\r\n]*?\b(to (?:be|equal|contain|include|match|have))\b/i
  )?.[1]
  const timeout = text.match(
    /\b(?:test )?timeout (?:of )?(\d+\s*ms) exceeded\b/i
  )?.[1]
  const location = text
    .replace(/\\/g, "/")
    .match(
      /\b(?:tests|components|app|lib|scripts)\/[\w./-]+\.[cm]?[jt]sx?:\d+(?::\d+)?/
    )?.[0]
  const detail = matcher
    ? matcher
    : assertion
      ? `expected [value] ${assertion} [value]`
      : timeout
        ? `timeout ${timeout} exceeded`
        : ""
  return `  ${type}${detail ? `: ${detail}` : ""}${location ? ` at ${location}` : ""}`
}

function addFailure(title, message) {
  if (lines.length >= 41) return
  lines.push(`- ${safeTitle(title)}`, diagnostic(message))
}

try {
  const contents = readFileSync(reportPath, "utf8")
  if (kind === "tap") {
    const tapLines = contents.split(/\r?\n/)
    for (let i = 0; i < tapLines.length; i++) {
      const failure = tapLines[i].match(/^\s*not ok\s+\d+\s*-\s*(.+)$/)
      if (!failure) continue
      let end = i + 1
      while (
        end < tapLines.length &&
        !/^\s*(?:not )?ok\s+\d+\b/.test(tapLines[end])
      )
        end++
      addFailure(failure[1], tapLines.slice(i + 1, end).join("\n"))
    }
  } else if (kind === "vitest") {
    const report = JSON.parse(contents)
    for (const file of report.testResults ?? []) {
      const failures = (file.assertionResults ?? []).filter(
        (test) => test.status === "failed"
      )
      for (const test of failures)
        addFailure(test.fullName, test.failureMessages?.join("\n"))
      if (file.status === "failed" && failures.length === 0)
        addFailure(file.name, file.message)
    }
  } else if (kind === "playwright") {
    const report = JSON.parse(contents)
    function visit(suite, parents = []) {
      const path = [...parents, suite.title].filter(Boolean)
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          if (test.status !== "unexpected") continue
          const result = [...(test.results ?? [])]
            .reverse()
            .find((item) => item.status !== "passed")
          addFailure(
            [...path, spec.title].join(" > "),
            result?.errors?.map((error) => error.message).join("\n") ??
              result?.error?.message
          )
        }
      }
      for (const child of suite.suites ?? []) visit(child, path)
    }
    for (const suite of report.suites ?? []) visit(suite)
    for (const error of report.errors ?? [])
      addFailure("Playwright setup", error.message)
  }
} catch {
  // Setup can fail before a test report exists. The job logs have the detail.
}
if (lines.length === 1)
  lines.push(
    "No failed test details available; inspect the failed step in the job log."
  )
writeFileSync("failure-summary.txt", `${lines.join("\n")}\n`)
