import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("archived folder restore", () => {
  it("restores only a manager's archived folder and preserves folder status rules", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const manager = createClient(url, key, { auth: { persistSession: false } })
    const viewer = createClient(url, key, { auth: { persistSession: false } })
    for (const [client, email] of [
      [manager, "wiki-manager@canopy.test"],
      [viewer, "standard@canopy.test"],
    ] as const) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      })
      expect(error).toBeNull()
    }
    const slug = `archive-restore-${crypto.randomUUID()}`
    const { data: parent, error } = await manager
      .from("wiki_nodes")
      .insert({
        type: "folder",
        slug,
        title: "Archive restore parent",
        status: "archived",
      })
      .select("id,status")
      .single()
    expect(error).toBeNull()
    const { data: child, error: childError } = await manager
      .from("wiki_nodes")
      .insert({
        parent_id: parent!.id,
        type: "folder",
        slug: `${slug}-child`,
        title: "Archive restore child",
        status: "archived",
      })
      .select("id,status")
      .single()
    expect(childError).toBeNull()
    expect(
      (
        await viewer.rpc("restore_archived_wiki_folder", {
          target_id: parent!.id,
        })
      ).error
    ).not.toBeNull()
    expect(
      (
        await manager.rpc("restore_archived_wiki_folder", {
          target_id: child!.id,
        })
      ).data
    ).toBe(false)
    expect(
      (
        await manager.rpc("restore_archived_wiki_folder", {
          target_id: parent!.id,
        })
      ).data
    ).toBe(true)
    expect(
      (
        await manager.rpc("restore_archived_wiki_folder", {
          target_id: child!.id,
        })
      ).data
    ).toBe(true)
    const { data: restored } = await manager
      .from("wiki_nodes")
      .select("status")
      .eq("id", child!.id)
      .single()
    expect(restored?.status).toBe("published")
    const { data: attempted } = await manager
      .from("wiki_nodes")
      .update({ status: "draft" })
      .eq("id", child!.id)
      .select("status")
      .single()
    expect(attempted?.status).toBe("published")
  })
})
