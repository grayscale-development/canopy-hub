import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ admin: vi.fn(), scan: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: state.admin,
}))
vi.mock("@/lib/wiki-alert-scan", () => ({ scanWikiAlerts: state.scan }))
import { POST } from "@/app/api/wiki/alerts/scan/route"

const request = (secret = "test-secret") =>
  new Request("http://localhost", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  })
beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://lnzxjlsojwwnkqxzhizj.supabase.co"
  )
  vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", "true")
  vi.stubEnv("CANOPY_ALERTS_SCAN_SECRET", "test-secret")
  state.admin.mockReset().mockReturnValue({})
  state.scan
    .mockReset()
    .mockResolvedValue({ skipped: true, reason: "unchanged" })
})
afterEach(() => vi.unstubAllEnvs())
describe("alerts scan route gate", () => {
  it("rejects production and missing staging flag before creating a client", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://rvwmxbuycfbmntxkovmn.supabase.co"
    )
    expect((await POST(request())).status).toBe(403)
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://lnzxjlsojwwnkqxzhizj.supabase.co"
    )
    vi.stubEnv("CANOPY_ALLOW_STAGING_ALERTS_JOB", "")
    expect((await POST(request())).status).toBe(403)
    expect(state.admin).not.toHaveBeenCalled()
    expect(state.scan).not.toHaveBeenCalled()
  })
  it("requires the configured secret before opening the database", async () => {
    expect((await POST(request("wrong"))).status).toBe(401)
    vi.stubEnv("CANOPY_ALERTS_SCAN_SECRET", "")
    expect((await POST(request())).status).toBe(401)
    expect(state.admin).not.toHaveBeenCalled()
  })
  it("returns the scan result after both checks", async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      skipped: true,
      reason: "unchanged",
    })
  })
})
