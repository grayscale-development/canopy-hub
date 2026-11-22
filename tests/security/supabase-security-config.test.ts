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
  it("permits the v2.2 audit log table and its user-callable logger only", async () => {
    const lint = (name: string, level: string, metadata: object) => ({
      name,
      level,
      metadata,
    })
    const accepted = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: [
            lint("rls_enabled_no_policy", "INFO", {
              schema: "public",
              name: "ai_action_log",
              type: "table",
            }),
            lint("authenticated_security_definer_function_executable", "WARN", {
              schema: "public",
              name: "log_user_ai_action",
            }),
          ],
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request: accepted })
    ).resolves.toMatchObject({ acceptedProviderWarnings: 2 })
    const other = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: [
            lint("authenticated_security_definer_function_executable", "WARN", {
              schema: "public",
              name: "some_other_function",
            }),
          ],
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request: other })
    ).rejects.toThrow(/acceptance is incomplete/)
  })
  it("permits the v2.2 service-only tables found on the production release", async () => {
    const tables = [
      "milo_edit_proposals",
      "wiki_alert_manual_scan_lease",
      "wiki_alert_scan_state",
    ]
    const request = vi
      .fn()
      .mockResolvedValueOnce(ok({ password_hibp_enabled: true }))
      .mockResolvedValueOnce(
        ok({
          lints: tables.map((name) => ({
            name: "rls_enabled_no_policy",
            level: "INFO",
            metadata: { schema: "public", name, type: "table" },
          })),
        })
      )
    await expect(
      enforceSecurity({ projectRef, token: "test", request })
    ).resolves.toMatchObject({ acceptedProviderWarnings: 3 })
  })
})
