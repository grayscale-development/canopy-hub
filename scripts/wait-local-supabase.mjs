import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) {
  throw new Error(
    "Supabase readiness checks require the local URL on port 54321"
  )
}

const config = readFileSync("supabase/config.toml", "utf8")
const project = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1]
if (!project) throw new Error("Missing local Supabase project_id")
const kong = `supabase_kong_${project}`
const auth = `supabase_auth_${project}`

function docker(...args) {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

async function status(path) {
  try {
    const response = await fetch(`${url}${path}`, {
      signal: AbortSignal.timeout(2_000),
      redirect: "error",
    })
    await response.body?.cancel()
    return response.status
  } catch {
    return 0
  }
}

export async function waitForLocalSupabase() {
  const deadline = Date.now() + 60_000
  let consecutive502s = 0
  let restarted = false
  let lastAuth = 0
  let lastRest = 0
  while (Date.now() < deadline) {
    lastAuth = await status("/auth/v1/health")
    lastRest = await status("/rest/v1/")
    if (lastAuth === 200 && lastRest === 200) {
      console.log("Local Supabase auth and PostgREST are ready.")
      return
    }

    consecutive502s = lastAuth === 502 ? consecutive502s + 1 : 0
    // A healthy auth container behind persistent 502s indicates Kong's stale
    // upstream DNS after reset (supabase/cli#6016), not a slow startup.
    if (
      !restarted &&
      consecutive502s >= 5 &&
      docker("inspect", "--format", "{{.State.Health.Status}}", auth) ===
        "healthy"
    ) {
      console.log("Kong has a stale auth upstream; restarting it once.")
      if (docker("restart", kong) === null)
        throw new Error("Could not restart local Kong")
      restarted = true
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(
    `Local Supabase readiness timed out (auth HTTP ${lastAuth || "unreachable"}; PostgREST HTTP ${lastRest || "unreachable"}).`
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await waitForLocalSupabase()
}
