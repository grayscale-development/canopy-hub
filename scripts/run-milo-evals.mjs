import { spawnSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"

// Vitest resolves server-only and the app's aliases like the other DB tests.
for (const file of [
  "milo-eval-report/report.md",
  "milo-eval-report/report.json",
])
  rmSync(file, { force: true })
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/db/milo-evals.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CANOPY_DB_TESTS: "1",
      MILO_EVALS: "1",
      OPENAI_EMBEDDING_MODEL: "fake-embedding",
    },
  }
)
if (result.error) throw result.error
try {
  process.stdout.write(readFileSync("milo-eval-report/report.md", "utf8"))
} catch {
  /* An early failure produced no report. */
}
process.exit(result.status ?? 1)
