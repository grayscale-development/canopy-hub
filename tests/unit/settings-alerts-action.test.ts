import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  user: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "manager" } } })),
    },
  },
  permission: vi
    .fn<({ code }: { code: string }) => Promise<boolean>>()
    .mockResolvedValue(true),
  gate: vi.fn((): { allowed: true } | { allowed: false; reason: string } => ({
    allowed: true,
  })),
  rpc: vi.fn(async (name: string, args: { p_token: string }) => ({
    data:
      name === "acquire_wiki_alert_manual_scan" && Boolean(args.p_token)
        ? true
        : null,
    error: null,
  })),
  scan: vi.fn(async () => ({
    skipped: false as const,
    pages: 7,
    opened: 2,
    updated: 3,
    written: 5,
    skippedCount: 0,
  })),
  admin: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => mocks.user,
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.admin,
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: mocks.permission,
}))
vi.mock("@/lib/wiki-alerts-job-gate", () => ({ wikiAlertsJobGate: mocks.gate }))
vi.mock("@/lib/wiki-alert-scan", () => ({ scanWikiAlerts: mocks.scan }))

import { runWikiAlertsAction } from "@/app/settings/alerts-actions"

describe("runWikiAlertsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permission.mockResolvedValue(true)
    mocks.gate.mockReturnValue({ allowed: true })
    mocks.admin.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockImplementation(async (name) => ({
      data: name === "acquire_wiki_alert_manual_scan" ? true : null,
      error: null,
    }))
    mocks.scan.mockResolvedValue({
      skipped: false,
      pages: 7,
      opened: 2,
      updated: 3,
      written: 5,
      skippedCount: 0,
    })
  })
  it("rejects a user without advanced access before creating an admin client", async () => {
    mocks.permission.mockImplementation(
      async ({ code }: { code: string }) => code !== "advanced-settings.access"
    )
    expect(await runWikiAlertsAction()).toMatchObject({ ok: false })
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.scan).not.toHaveBeenCalled()
  })
  it("refuses a gated environment before creating an admin client", async () => {
    mocks.gate.mockReturnValue({ allowed: false, reason: "private reason" })
    expect(await runWikiAlertsAction()).toEqual({
      ok: false,
      message: "Alerts can't run in this environment.",
    })
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it("returns the scan summary and releases the acquired lease", async () => {
    expect(await runWikiAlertsAction()).toMatchObject({
      ok: true,
      pages: 7,
      opened: 2,
      updated: 3,
      durationMs: expect.any(Number),
      partial: false,
    })
    expect(mocks.scan).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1])
  })
  it("refuses concurrent runs and releases a lease when scanning throws", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await runWikiAlertsAction()).toMatchObject({
      ok: false,
      message: expect.stringContaining("already running"),
    })
    expect(mocks.scan).not.toHaveBeenCalled()
    mocks.scan.mockRejectedValueOnce(new Error("private details"))
    const result = await runWikiAlertsAction()
    expect(result).toEqual({
      ok: false,
      message: "Unable to run the alerts check. Please try again.",
    })
    expect(mocks.rpc.mock.calls.at(-1)?.[0]).toBe(
      "release_wiki_alert_manual_scan"
    )
  })
})
