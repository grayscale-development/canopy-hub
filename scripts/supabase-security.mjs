import { pathToFileURL } from "node:url"

// Auth configuration lives outside SQL migrations. No changes without --apply.
export async function enforceSecurity({
  projectRef,
  token,
  apply = false,
  request = fetch,
}) {
  if (!/^[a-z]{20}$/.test(projectRef ?? ""))
    throw new Error("A valid SUPABASE_PROJECT_REF is required")
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required")
  const base = `https://api.supabase.com/v1/projects/${projectRef}`
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
  async function call(endpoint, options = {}) {
    const response = await request(`${base}/${endpoint}`, {
      ...options,
      headers,
    })
    // Never print an Auth config response: it can contain provider credentials.
    if (!response.ok)
      throw new Error(
        `Supabase ${endpoint} returned HTTP ${response.status}; inspect the project setting securely. No automatic retries or plan upgrades.`
      )
    return response.json()
  }
  let auth = await call("config/auth")
  if (apply && auth.password_hibp_enabled !== true) {
    await call("config/auth", {
      method: "PATCH",
      body: JSON.stringify({ password_hibp_enabled: true }),
    })
    auth = await call("config/auth")
  }
  const advisor = await call("advisors/security")
  if (!Array.isArray(advisor.lints)) {
    throw new Error(
      "Supabase security advisor returned an invalid response; acceptance cannot be verified."
    )
  }
  const findings = advisor.lints
  const counts = {}
  for (const finding of findings) {
    const key = `${finding.level}:${finding.name}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  console.log(
    JSON.stringify(
      {
        leakedPasswordProtection: auth.password_hibp_enabled === true,
        findings: counts,
      },
      null,
      2
    )
  )
  // pg_net is non-relocatable and installs its objects in net. Do not drop it
  // or alter system catalogs to silence its installation-namespace warning.
  const unhandled = findings.filter(
    (finding) =>
      !(
        finding.name === "extension_in_public" &&
        finding.level === "WARN" &&
        finding.metadata?.schema === "public" &&
        finding.metadata?.type === "extension" &&
        finding.metadata?.name === "pg_net"
      )
  )
  if (auth.password_hibp_enabled !== true || unhandled.length) {
    throw new Error(
      "Supabase security acceptance is incomplete; review sanitized finding counts. Leaked-password protection may require an existing Pro plan; this script never purchases one."
    )
  }
  return { counts, acceptedProviderWarnings: findings.length }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  enforceSecurity({
    projectRef: process.env.SUPABASE_PROJECT_REF,
    token: process.env.SUPABASE_ACCESS_TOKEN,
    apply: process.argv.includes("--apply"),
  }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
