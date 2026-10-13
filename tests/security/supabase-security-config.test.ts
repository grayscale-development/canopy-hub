import { describe, expect, it, vi } from "vitest"
import { enforceSecurity } from "../../scripts/supabase-security.mjs"

const projectRef = "abcdefghijklmnopqrst"
const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 })

describe("Supabase Auth security deployment", () => {
  it("checks without writing by default and fails on disabled protection", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: false }))
      .mockResolvedValueOnce(ok({ lints: [] }))
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).rejects.toThrow(/acceptance is incomplete/)
    expect(request.mock.calls.every(([, options]) => !options.method)).toBe(
      true
    )
  })
  it("applies only leaked-password protection, reads it back and permits the documented pg_net warning", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: false }))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: [
            {
              name: "extension_in_public",
              level: "WARN",
              metadata: { name: "pg_net", schema: "public", type: "extension" },
            },
          ],
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", apply: true, request })
    ).resolves.toMatchObject({ acceptedProviderWarnings: 1 })
    expect(request.mock.calls[1][1].body).toBe(
      JSON.stringify({ password_hibp_enabled: true })
    )
    expect(request).toHaveBeenCalledTimes(4)
  })
  it("permits only the named service-only tables with RLS and no client policy", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: [
            {
              name: "rls_enabled_no_policy",
              level: "INFO",
              metadata: {
                schema: "raw",
                name: "sync_runs",
                type: "table",
              },
            },
          ],
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).resolves.toMatchObject({ acceptedProviderWarnings: 1 })
  })
  it("fails on an unlisted RLS-with-no-policy table", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: [
            {
              name: "rls_enabled_no_policy",
              level: "INFO",
              metadata: {
                schema: "public",
                name: "unexpected_table",
                type: "table",
              },
            },
          ],
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).rejects.toThrow(/acceptance is incomplete/)
  })
  it("does not retry or purchase an upgrade when Auth rejects the setting", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: false }))
      .mockResolvedValueOnce(
        new Response("private provider response", { status: 403 })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", apply: true, request })
    ).rejects.toThrow(/HTTP 403/)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("fails on new or unresolved advisor findings", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({ lints: [{ name: "rls_disabled_in_public", level: "ERROR" }] })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).rejects.toThrow(/acceptance is incomplete/)
  })
  it("fails closed when advisor results are missing", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(ok({}))
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).rejects.toThrow(/invalid response/)
  })
})
