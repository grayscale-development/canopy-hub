import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("wiki short IDs on local Supabase", { timeout: 30_000 }, () => {
  it("allocates concurrent manager inserts uniquely, survives moves, and rejects ID updates", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const manager = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } }
    )
    const admin = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    )
    const login = await manager.auth.signInWithPassword({
      email: "wiki-manager@canopy.test",
      password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
    })
    expect(login.error).toBeNull()
    const initial = await admin
      .from("wiki_nodes")
      .select("short_id")
      .order("short_id", { ascending: false })
      .limit(1)
    expect(initial.error).toBeNull()
    const max = initial.data?.[0]?.short_id ?? 0
    const root = await admin
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "canopy-wiki")
      .is("parent_id", null)
      .single()
    expect(root.error).toBeNull()
    const prefix = `short-id-${crypto.randomUUID()}`
    const ids: string[] = []
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          manager
            .from("wiki_nodes")
            .insert({
              type: "page",
              slug: `${prefix}-${i}`,
              title: `Short ID ${i}`,
              status: "draft",
            })
            .select("id,short_id")
            .single()
        )
      )
      for (const result of results) {
        if (result.data) ids.push(result.data.id)
      }
      expect(results.map((r) => r.error)).toEqual(Array(20).fill(null))
      const numbers = results.map((r) => r.data!.short_id)
      expect(new Set(numbers).size).toBe(20)
      expect(numbers.every((n) => n > max)).toBe(true)
      const denied = await manager
        .from("wiki_nodes")
        .update({ short_id: max + 10000 })
        .eq("id", ids[0])
      expect(denied.error?.message).toContain("immutable")
      const edited = await manager
        .from("wiki_nodes")
        .update({ title: "Renamed", parent_id: root.data!.id })
        .eq("id", ids[0])
        .select("short_id")
        .single()
      expect(edited.error).toBeNull()
      expect(edited.data?.short_id).toBe(numbers[0])
      const removed = await admin.from("wiki_nodes").delete().eq("id", ids[0])
      expect(removed.error).toBeNull()
      const again = await manager
        .from("wiki_nodes")
        .insert({
          type: "page",
          slug: `${prefix}-again`,
          title: "Again",
          status: "draft",
        })
        .select("id,short_id")
        .single()
      if (again.data) ids.push(again.data.id)
      expect(again.error).toBeNull()
      expect(again.data!.short_id).toBeGreaterThan(Math.max(...numbers))
    } finally {
      if (ids.length) await admin.from("wiki_nodes").delete().in("id", ids)
    }
  })
})
