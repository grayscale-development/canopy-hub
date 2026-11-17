import "server-only"

const PRODUCTION_REF = "rvwmxbuycfbmntxkovmn"
const STAGING_REF = "lnzxjlsojwwnkqxzhizj"

export function wikiAlertsJobGate():
  | { allowed: true }
  | { allowed: false; reason: string } {
  // Next can inline the public URL at build time; require both that value and
  // the runtime value to identify staging before allowing a job to run.
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

  if (urls.some((url) => url.hostname === `${PRODUCTION_REF}.supabase.co`)) {
    return { allowed: false, reason: "Alerts jobs cannot run on production" }
  }
  if (
    urls.some(
      (url) =>
        url.protocol !== "https:" ||
        url.hostname !== `${STAGING_REF}.supabase.co` ||
        url.port !== "" ||
        url.username !== "" ||
        url.password !== ""
    )
  ) {
    return { allowed: false, reason: "Supabase URL is not the staging project" }
  }
  if (process.env.CANOPY_ALLOW_STAGING_ALERTS_JOB !== "true") {
    return { allowed: false, reason: "Staging alerts job is not enabled" }
  }
  return { allowed: true }
}
