import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("tag levels with local Supabase RLS", { timeout: 30_000 }, () => {
  it("allows managers and rejects viewers, enforces scope, and reports moved tags", async () => {
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
    const stamp = `${Date.now()}`
    const folders = await manager
      .from("wiki_nodes")
      .insert([
        {
          type: "folder",
          slug: `tags-a-${stamp}`,
          title: "Tags A",
          status: "published",
        },
        {
          type: "folder",
          slug: `tags-b-${stamp}`,
          title: "Tags B",
          status: "published",
        },
      ])
      .select("id,slug")
    expect(folders.error).toBeNull()
    const a = folders.data!.find((node) => node.slug.startsWith("tags-a"))!.id
    const b = folders.data!.find((node) => node.slug.startsWith("tags-b"))!.id
    const name = `Scoped ${stamp}`
    let pageId: string | undefined
    try {
      const page = await manager
        .from("wiki_nodes")
        .insert({
          type: "page",
          parent_id: a,
          slug: `tag-page-${stamp}`,
          title: "Tag page",
          status: "published",
        })
        .select("id")
        .single()
      expect(page.error).toBeNull()
      pageId = page.data!.id
      const tag = await manager
        .from("wiki_tags")
        .insert({ name, scope: "section", section_id: a })
        .select("id")
        .single()
      expect(tag.error).toBeNull()
      const read = await viewer
        .from("wiki_tags")
        .select("id")
        .eq("id", tag.data!.id)
      expect(read.error).toBeNull()
      expect(read.data).toHaveLength(1)
      const denied = await viewer
        .from("wiki_tags")
        .insert({ name: `Viewer ${stamp}` })
      expect(denied.error).not.toBeNull()
      const deniedLink = await viewer
        .from("wiki_page_tags")
        .insert({ node_id: page.data!.id, tag_id: tag.data!.id })
      expect(deniedLink.error).not.toBeNull()
      const synced = await manager.rpc("sync_wiki_page_tags", {
        p_node_id: page.data!.id,
        p_tags: [{ name, scope: "section", section_id: a }],
      })
      expect(synced.error).toBeNull()
      const moved = await manager
        .from("wiki_nodes")
        .update({ parent_id: b })
        .eq("id", page.data!.id)
      expect(moved.error).toBeNull()
      const outside = await manager.rpc("wiki_page_out_of_scope_tags", {
        p_node_id: page.data!.id,
      })
      expect(outside.error).toBeNull()
      expect(outside.data).toEqual([
        expect.objectContaining({ id: tag.data!.id, name }),
      ])
      const deniedRead = await viewer.rpc("wiki_page_out_of_scope_tags", {
        p_node_id: page.data!.id,
      })
      expect(deniedRead.error).not.toBeNull()
      const failed = await manager.rpc("sync_wiki_page_tags", {
        p_node_id: page.data!.id,
        p_tags: [{ name, scope: "section", section_id: a }],
      })
      expect(failed.error?.message).toBe("wiki_tag_out_of_scope")
      const links = await manager
        .from("wiki_page_tags")
        .select("tag_id")
        .eq("node_id", page.data!.id)
      expect(links.data).toEqual([{ tag_id: tag.data!.id }])
      const legacy = await manager
        .from("wiki_nodes")
        .select("tags")
        .eq("id", page.data!.id)
        .single()
      expect(legacy.data?.tags).toEqual([name])
      const badInsert = await manager
        .from("wiki_page_tags")
        .upsert({ node_id: page.data!.id, tag_id: tag.data!.id })
      expect(badInsert.error?.message).toBe("wiki_tag_out_of_scope")
    } finally {
      if (pageId) await manager.from("wiki_nodes").delete().eq("id", pageId)
      await manager.from("wiki_nodes").delete().in("id", [a, b])
    }
  })
})
