import { afterEach, describe, expect, it, vi } from "vitest"

import { isStagingPasswordLoginEnabled } from "@/lib/staging-auth"

describe("isStagingPasswordLoginEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is off when the flag is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN", "")
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://lnzxjlsojwwnkqxzhizj.supabase.co"
    )
    expect(isStagingPasswordLoginEnabled()).toBe(false)
  })

  it("is on only when the flag is set and the URL is the staging project", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN", "true")
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://lnzxjlsojwwnkqxzhizj.supabase.co"
    )
    expect(isStagingPasswordLoginEnabled()).toBe(true)
  })

  it("stays off when pointed at a different Supabase project", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN", "true")
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://rvwmxbuycfbmntxkovmn.supabase.co"
    )
    expect(isStagingPasswordLoginEnabled()).toBe(false)
  })
})
