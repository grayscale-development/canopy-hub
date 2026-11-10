import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("tag cleanup on local Supabase", { timeout: 30_000 }, () => {
  it("enforces manager permission and manager-only audit reads", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    const manager = createClient(url, key, { auth: { persistSession: false } })
    const viewer = createClient(url, key, { auth: { persistSession: false } })
    const admin = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    )
    for (const [client, email] of [
      [manager, "wiki-manager@canopy.test"],
      [viewer, "standard@canopy.test"],
    ] as const) {
      const result = await client.auth.signInWithPassword({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      })
      expect(result.error).toBeNull()
    }
    const name = `Cleanup QA ${Date.now()}`
    let tagId = ""
    let auditId = ""
    try {
      const tag = await manager
        .from("wiki_tags")
        .insert({ name })
        .select("id")
        .single()
      expect(tag.error).toBeNull()
      tagId = tag.data!.id
      const denied = await viewer.rpc("manage_wiki_tag", {
        p_action: "rename",
        p_source_id: tagId,
        p_name: `${name} changed`,
      })
      expect(denied.error?.message).toBe("wiki_manage_required")
      const renamed = await manager.rpc("manage_wiki_tag", {
        p_action: "rename",
        p_source_id: tagId,
        p_name: `${name} changed`,
        p_expected_node_ids: [],
      })
      expect(renamed.error).toBeNull()
      const audit = await manager
        .from("wiki_tag_audit")
        .select("id,actor_id,action,details")
        .contains("details", { source: { id: tagId } })
        .single()
      expect(audit.error).toBeNull()
      expect(audit.data).toMatchObject({
        action: "rename",
        details: { page_count: 0, affected_node_ids: [] },
      })
      auditId = audit.data!.id
      const hidden = await viewer
        .from("wiki_tag_audit")
        .select("id")
        .eq("id", auditId)
      expect(hidden.error).toBeNull()
      expect(hidden.data).toEqual([])
    } finally {
      if (auditId) await admin.from("wiki_tag_audit").delete().eq("id", auditId)
      if (tagId) await admin.from("wiki_tags").delete().eq("id", tagId)
    }
  })
})
