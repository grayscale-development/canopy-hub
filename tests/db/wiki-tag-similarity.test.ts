import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("tag similarity on local Supabase", { timeout: 30_000 }, () => {
  it("restricts matching and telemetry, and clears stale embeddings on rename", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    const manager = createClient(url, key, { auth: { persistSession: false } })
    const viewer = createClient(url, key, { auth: { persistSession: false } })
    const anonymous = createClient(url, key, {
      auth: { persistSession: false },
    })
    const admin = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    )
    for (const [client, email] of [
      [manager, "wiki-manager@canopy.test"],
      [viewer, "standard@canopy.test"],
    ] as const) {
      expect(
        (
          await client.auth.signInWithPassword({
            email,
            password:
              process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
          })
        ).error
      ).toBeNull()
    }
    const embedding = [1, ...Array<number>(1535).fill(0)]
    const name = `Similarity QA ${Date.now()}`
    const tag = await manager
      .from("wiki_tags")
      .insert({ name, embedding })
      .select("id")
      .single()
    expect(tag.error).toBeNull()
    let auditId: string | undefined
    try {
      const args = {
        query_embedding: embedding,
        match_threshold: 0.99,
        match_count: 10,
      }
      const matched = await manager.rpc("match_wiki_tags", args)
      expect(matched.error).toBeNull()
      expect(matched.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: tag.data!.id, name }),
        ])
      )
      expect((await viewer.rpc("match_wiki_tags", args)).data).toEqual([])
      expect(
        (await anonymous.rpc("match_wiki_tags", args)).error
      ).not.toBeNull()
      expect(
        (await viewer.rpc("record_wiki_tag_suggestion", { p_event: "shown" }))
          .error?.message
      ).toBe("wiki_manage_required")
      expect(
        (await manager.rpc("record_wiki_tag_suggestion", { p_event: "shown" }))
          .error
      ).toBeNull()
      const audit = await manager
        .from("wiki_tag_audit")
        .select("id")
        .eq("action", "suggestion_shown")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
      auditId = audit.data?.id
      const renamed = await manager
        .from("wiki_tags")
        .update({ name: `${name} changed` })
        .eq("id", tag.data!.id)
        .select("embedding")
        .single()
      expect(renamed.error).toBeNull()
      expect(renamed.data?.embedding).toBeNull()
    } finally {
      await manager.from("wiki_tags").delete().eq("id", tag.data!.id)
      if (auditId) await admin.from("wiki_tag_audit").delete().eq("id", auditId)
    }
  })
})
