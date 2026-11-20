#!/usr/bin/env node
// v2.2 release preflight (#120, #235). READ-ONLY: never writes to any project.
//
//   node scripts/release/preflight-2.2.mjs \
//     [--remote-versions <file>]   one applied version per line (default: runs
//                                  `supabase migration list --linked`, read-only)
//     [--env-names <file>]         production env var NAMES, one per line
//                                  (default: runs `vercel env ls production`)
//
// Exits 1 if any check fails. Prints names only, never values.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const results = []
const check = (ok, label, detail = "") => {
  results.push(ok)
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n      ${detail}` : ""}`)
}
const run = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

// 1. Version and notes
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"))
check(pkg.version === "2.2.0", "package.json version is 2.2.0", pkg.version)
check(
  lock.version === "2.2.0" && lock.packages?.[""]?.version === "2.2.0",
  "package-lock.json versions are 2.2.0"
)
check(existsSync("docs/releases/2.2.md"), "docs/releases/2.2.md exists")

// 2. Migrations vs production history
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
const local = new Map()
const dupes = []
for (const f of files) {
  const v = f.split("_")[0]
  if (local.has(v)) dupes.push(v)
  local.set(v, f)
}
check(dupes.length === 0, "No duplicate local migration versions", dupes.join(", "))
let remoteText
const remoteFile = opt("--remote-versions")
if (remoteFile) remoteText = readFileSync(remoteFile, "utf8")
else {
  try {
    remoteText = run("supabase", ["migration", "list", "--linked"])
  } catch (error) {
    check(false, "Read production migration history", String(error.message).split("\n")[0])
  }
}
if (remoteText) {
  // `migration list` rows look like "  local | remote | time"; take the remote column.
  const remote = new Set()
  for (const line of remoteText.split("\n")) {
    const cols = line.split("|").map((c) => c.trim())
    const v = cols.length >= 3 ? cols[1] : cols[0].split(/\s+/)[0]
    if (/^\d{12,14}$/.test(v)) remote.add(v)
  }
  const missing = [...remote].filter((v) => !local.has(v))
  check(
    remote.size > 0 && missing.length === 0,
    `Every production migration (${remote.size}) has a local file`,
    missing.join(", ")
  )
  const pending = [...local.keys()].filter((v) => !remote.has(v)).sort()
  const last = [...remote].sort().at(-1)
  const early = pending.filter((v) => v < last)
  console.log(`      ${pending.length} pending: ${pending.map((v) => local.get(v)).join(", ")}`)
  check(pending.length > 0, "Pending migrations found")
  if (early.length) {
    const deploy = readFileSync(".github/workflows/deploy.yml", "utf8")
    check(
      /supabase db push --linked --include-all/.test(deploy),
      `Deploy uses --include-all (${early.length} pending migrations predate ${last})`
    )
  }
}

// 3. Production configuration (names only)
let envText
const envFile = opt("--env-names")
if (envFile) envText = readFileSync(envFile, "utf8")
else {
  try {
    envText = run("vercel", ["env", "ls", "production"])
  } catch (error) {
    check(false, "List production env var names", String(error.message).split("\n")[0])
  }
}
if (envText) {
  const names = new Set(envText.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "OPENAI_CHAT_MODEL",
  ]
  const missing = required.filter((n) => !names.has(n))
  check(missing.length === 0, "Required production env vars present", missing.join(", "))
  const alerts = ["CANOPY_ALERTS_SCAN_SECRET", "CRON_SECRET", "CANOPY_ALLOW_PRODUCTION_ALERTS_JOB"]
  const alertsMissing = alerts.filter((n) => !names.has(n))
  console.log(
    alertsMissing.length
      ? `INFO  Daily alerts scan stays OFF until set: ${alertsMissing.join(", ")}`
      : "INFO  Daily alerts scan env vars are set"
  )
  const forbidden = ["NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN", "CANOPY_ALLOW_STAGING_ALERTS_JOB"]
  const present = forbidden.filter((n) => names.has(n))
  check(present.length === 0, "No staging-only env vars in production", present.join(", "))
}

// 4. Code safeguards
const nextConfig = readFileSync("next.config.mjs", "utf8")
check(/serverExternalPackages:[^\]]*"jsdom"/.test(nextConfig), "jsdom is a server external package (#119)")
const vercel = existsSync("vercel.json") ? JSON.parse(readFileSync("vercel.json", "utf8")) : {}
check(
  (vercel.crons ?? []).some((c) => c.path === "/api/wiki/alerts/scan"),
  "Daily alerts cron is configured in vercel.json"
)
const gate = readFileSync("lib/staging-auth.ts", "utf8")
check(/lnzxjlsojwwnkqxzhizj/.test(gate), "Staging password login is tied to the staging project")

const failed = results.filter((ok) => !ok).length
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.")
process.exitCode = failed ? 1 : 0
