import "server-only"

const PRODUCTION_REF = "rvwmxbuycfbmntxkovmn"
const STAGING_REF = "lnzxjlsojwwnkqxzhizj"

export function wikiAlertsJobGate():
  | { allowed: true }
  | { allowed: false; reason: string } {
  // Next can inline the public URL at build time; require both that value and
  // the runtime value to identify the same project before allowing a job.
  const runtimeEnv = process.env
  let urls: URL[]
  try {
    urls = [
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
      new URL(runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? ""),
    ]
  } catch {
    return { allowed: false, reason: "Supabase URL is missing or invalid" }
  }

  const matchesProject = (ref: string) =>
    urls.every(
      (url) =>
        url.protocol === "https:" &&
        url.hostname === `${ref}.supabase.co` &&
        url.port === "" &&
        url.username === "" &&
        url.password === ""
    )

  if (matchesProject(PRODUCTION_REF)) {
    return process.env.CANOPY_ALLOW_PRODUCTION_ALERTS_JOB === "true"
      ? { allowed: true }
      : { allowed: false, reason: "Production alerts job is not enabled" }
  }
  if (matchesProject(STAGING_REF)) {
    return process.env.CANOPY_ALLOW_STAGING_ALERTS_JOB === "true"
      ? { allowed: true }
      : { allowed: false, reason: "Staging alerts job is not enabled" }
  }
  return { allowed: false, reason: "Supabase URL is not an alerts project" }
}
