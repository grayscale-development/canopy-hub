import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("manual alerts scan lease", () => {
  it("serializes acquisitions, protects release ownership, and rejects authenticated callers", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const viewer = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const login = await viewer.auth.signInWithPassword({
      email: "standard@canopy.test",
      password: "canopy-test-password",
    })
    expect(login.error).toBeNull()
    const first = randomUUID(),
      second = randomUUID()
    try {
      const acquired = await service.rpc("acquire_wiki_alert_manual_scan", {
        p_token: first,
      })
      expect(acquired.error).toBeNull()
      expect(acquired.data).toBe(true)
      const refused = await service.rpc("acquire_wiki_alert_manual_scan", {
        p_token: second,
      })
      expect(refused.error).toBeNull()
      expect(refused.data).toBe(false)
      expect(
        (await viewer.rpc("release_wiki_alert_manual_scan", { p_token: first }))
          .error
      ).not.toBeNull()
      await service.rpc("release_wiki_alert_manual_scan", { p_token: second })
      expect(
        (
          await service.rpc("acquire_wiki_alert_manual_scan", {
            p_token: second,
          })
        ).data
      ).toBe(false)
      await service.rpc("release_wiki_alert_manual_scan", { p_token: first })
      expect(
        (
          await service.rpc("acquire_wiki_alert_manual_scan", {
            p_token: second,
          })
        ).data
      ).toBe(true)
    } finally {
      await service.rpc("release_wiki_alert_manual_scan", { p_token: first })
      await service.rpc("release_wiki_alert_manual_scan", { p_token: second })
    }
  })
})
