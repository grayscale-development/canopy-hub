import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("wiki short IDs on local Supabase", { timeout: 30_000 }, () => {
  it("keeps a page's own revision, asset and tag after renaming and moving", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const admin = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    )
    const token = crypto.randomUUID()
    const ids: string[] = []
    let tagId: string | undefined
    try {
      const folders = await admin
        .from("wiki_nodes")
        .insert(
          ["one", "two"].map((name) => ({
            type: "folder",
            slug: `${name}-${token}`,
            title: name,
            status: "published",
          }))
        )
        .select("id")
      if (folders.error) throw folders.error
      ids.push(...folders.data.map((row) => row.id))
      const node = await admin
        .from("wiki_nodes")
        .insert({
          parent_id: ids[0],
          type: "page",
          slug: `page-${token}`,
          title: "Original",
          status: "draft",
          import_content_hash: token,
        })
        .select("id,short_id")
        .single()
      if (node.error) throw node.error
      ids.push(node.data.id)
      const revision = await admin
        .from("wiki_page_revisions")
        .insert({ node_id: node.data.id, plain_text: token, blocks: [] })
        .select("id")
        .single()
      if (revision.error) throw revision.error
      const asset = await admin
        .from("wiki_assets")
        .insert({
          node_id: node.data.id,
          storage_path: `fixture/${token}`,
          file_name: "fixture.txt",
          mime_type: "text/plain",
          size_bytes: 1,
          kind: "document",
        })
        .select("id")
        .single()
      if (asset.error) throw asset.error
      const tag = await admin
        .from("wiki_tags")
        .insert({ name: `Fixture ${token}` })
        .select("id")
        .single()
      if (tag.error) throw tag.error
      tagId = tag.data.id
      const assignment = await admin
        .from("wiki_page_tags")
        .insert({ node_id: node.data.id, tag_id: tagId })
      if (assignment.error) throw assignment.error
      const moved = await admin
        .from("wiki_nodes")
        .update({
          parent_id: ids[1],
          title: "Renamed",
          current_revision_id: revision.data.id,
        })
        .eq("id", node.data.id)
        .select("short_id,import_content_hash,current_revision_id")
        .single()
      expect(moved.error).toBeNull()
      expect(moved.data).toEqual({
        short_id: node.data.short_id,
        import_content_hash: token,
        current_revision_id: revision.data.id,
      })
      const [savedRevision, savedAsset, savedTag] = await Promise.all([
        admin
          .from("wiki_page_revisions")
          .select("plain_text")
          .eq("id", revision.data.id)
          .single(),
        admin
          .from("wiki_assets")
          .select("node_id")
          .eq("id", asset.data.id)
          .single(),
        admin
          .from("wiki_page_tags")
          .select("tag_id")
          .eq("node_id", node.data.id)
          .single(),
      ])
      expect(savedRevision.data).toEqual({ plain_text: token })
      expect(savedAsset.data).toEqual({ node_id: node.data.id })
      expect(savedTag.data).toEqual({ tag_id: tagId })
    } finally {
      if (ids[2]) await admin.from("wiki_nodes").delete().eq("id", ids[2])
      if (ids.length)
        await admin.from("wiki_nodes").delete().in("id", ids.slice(0, 2))
      if (tagId) await admin.from("wiki_tags").delete().eq("id", tagId)
    }
  })
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
