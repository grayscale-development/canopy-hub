import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => state.client,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { POST } from "@/app/api/wiki/duplicates/resolve/route"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip
dbDescribe("duplicate resolution local RLS", { timeout: 60_000 }, () => {
  let admin: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  const folderId = randomUUID()
  const pageId = randomUUID()
  const targetId = randomUUID()
  let revisionId = ""
  let targetRevisionId = ""
  let targetPath = ""

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    async function signIn(email: string) {
      const client = createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const { error } = await client.auth.signInWithPassword({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      })
      if (error) throw error
      return client
    }
    manager = await signIn("wiki-manager@canopy.test")
    viewer = await signIn("standard@canopy.test")
    const folder = await admin
      .from("wiki_nodes")
      .insert({
        id: folderId,
        type: "folder",
        slug: `resolve-${folderId}`,
        title: "Resolve fixture",
        status: "published",
      })
      .select("short_id")
      .single()
    if (folder.error) throw folder.error
    const pages = await admin
      .from("wiki_nodes")
      .insert([
        {
          id: pageId,
          parent_id: folderId,
          type: "page",
          slug: "source",
          title: "Source",
          status: "published",
        },
        {
          id: targetId,
          parent_id: folderId,
          type: "page",
          slug: "target",
          title: "Target",
          status: "published",
        },
      ])
      .select("id,short_id")
    if (pages.error) throw pages.error
    targetPath = `/wiki/${folder.data.short_id}/${pages.data.find((page) => page.id === targetId)!.short_id}`
    const revision = await admin
      .from("wiki_page_revisions")
      .insert({
        node_id: pageId,
        blocks: [
          {
            id: "passage",
            type: "paragraph",
            content: [{ type: "text", text: "Duplicate", styles: {} }],
            children: [],
          },
          {
            id: "neighbor",
            type: "paragraph",
            content: [{ type: "text", text: "Keep", styles: {} }],
            children: [],
          },
        ],
        plain_text: "Duplicate\n\nKeep",
      })
      .select("id")
      .single()
    if (revision.error) throw revision.error
    revisionId = revision.data.id
    const targetRevision = await admin
      .from("wiki_page_revisions")
      .insert({
        node_id: targetId,
        blocks: [{ type: "paragraph", content: "Duplicate" }],
        plain_text: "Duplicate",
      })
      .select("id")
      .single()
    if (targetRevision.error) throw targetRevision.error
    targetRevisionId = targetRevision.data.id
    const pointer = await admin
      .from("wiki_nodes")
      .update({ current_revision_id: revisionId })
      .eq("id", pageId)
    if (pointer.error) throw pointer.error
    const targetPointer = await admin
      .from("wiki_nodes")
      .update({ current_revision_id: targetRevisionId })
      .eq("id", targetId)
    if (targetPointer.error) throw targetPointer.error
  })
  afterAll(async () => {
    if (!admin) return
    await admin.from("wiki_nodes").delete().in("id", [pageId, targetId])
    await admin.from("wiki_nodes").delete().eq("id", folderId)
  })
  it("refuses a viewer and a stale base, then saves one scoped reviewed revision", async () => {
    const request = (base = revisionId) =>
      new Request("http://localhost/api/wiki/duplicates/resolve", {
        method: "POST",
        body: JSON.stringify({
          nodeId: pageId,
          revisionId: base,
          blockId: "passage",
          targetId,
          targetRevisionId,
          targetTitle: "Target",
          targetPath,
        }),
      })
    state.client = viewer
    expect((await POST(request())).status).toBe(403)
    let node = await admin
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", pageId)
      .single()
    expect(node.data?.current_revision_id).toBe(revisionId)
    state.client = manager
    expect((await POST(request(randomUUID()))).status).toBe(409)
    expect((await POST(request())).status).toBe(200)
    node = await admin
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", pageId)
      .single()
    expect(node.data?.current_revision_id).not.toBe(revisionId)
    const revisions = await admin
      .from("wiki_page_revisions")
      .select("id,blocks,change_note")
      .eq("node_id", pageId)
    expect(revisions.data).toHaveLength(2)
    const saved = revisions.data!.find(
      (revision) => revision.id === node.data?.current_revision_id
    )!
    expect(saved.change_note).toBe("Consolidated duplicate with Target")
    expect(saved.blocks[0].content[0]).toMatchObject({
      type: "link",
      href: targetPath,
    })
    expect(saved.blocks[1].content[0].text).toBe("Keep")
  })
})
