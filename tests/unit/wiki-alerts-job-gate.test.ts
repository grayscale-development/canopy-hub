import { afterEach, describe, expect, it, vi } from "vitest"

import { wikiAlertsJobGate } from "@/lib/wiki-alerts-job-gate"

const stagingUrl = "https://lnzxjlsojwwnkqxzhizj.supabase.co"

describe("wikiAlertsJobGate", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("denies production even with the flag enabled", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://rvwmxbuycfbmntxkovmn.supabase.co"
    )
    vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", "true")
    expect(wikiAlertsJobGate()).toEqual({
      allowed: false,
      reason: "Alerts jobs cannot run on production",
    })
  })

  it.each(["", "false", "TRUE"])("denies staging with flag %j", (flag) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stagingUrl)
    vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", flag)
    expect(wikiAlertsJobGate()).toEqual({
      allowed: false,
      reason: "Staging alerts job is not enabled",
    })
  })

  it.each([
    "",
    "not a URL",
    "https://another-project.supabase.co",
    "https://lnzxjlsojwwnkqxzhizj.supabase.co.attacker.example",
    "http://lnzxjlsojwwnkqxzhizj.supabase.co",
    "https://lnzxjlsojwwnkqxzhizj.supabase.co:444",
    "https://lnzxjlsojwwnkqxzhizj.supabase.co@attacker.example",
  ])("denies an invalid or non-staging URL %j", (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url)
    vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", "true")
    expect(wikiAlertsJobGate().allowed).toBe(false)
  })

  it("allows staging only with the server flag enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stagingUrl)
    vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", "true")
    expect(wikiAlertsJobGate()).toEqual({ allowed: true })
  })
})
