import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ client: null as unknown, user: "" }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => state.client,
}))
import { POST } from "@/app/api/wiki/duplicates/route"
import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import { indexWikiPage } from "@/lib/wiki-ai"
import type {
  SupabaseWikiClient,
  WikiNodeRow,
  WikiRevisionRow,
} from "@/lib/wiki"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("duplicate detection local RLS", { timeout: 60_000 }, () => {
  let admin: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  const folderId = randomUUID()
  const sourceId = randomUUID()
  const draftId = randomUUID()
  const token = randomUUID()
  const content = `Unique fixture ${token}: verify that every required approval is recorded before publishing this procedure.`
  const blocks = [
    {
      id: "source-block",
      type: "paragraph",
      content: [{ type: "text", text: content }],
    },
  ]
  let draftRevision: WikiRevisionRow
  let draftNode: WikiNodeRow

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
        password: "canopy-test-password",
      })
      if (error) throw error
      return client
    }
    manager = await signIn("wiki-manager@canopy.test")
    viewer = await signIn("standard@canopy.test")
    const { error: folderError } = await admin.from("wiki_nodes").insert({
      id: folderId,
      type: "folder",
      slug: `test-${token}`,
      title: token,
      status: "published",
    })
    if (folderError) throw folderError
    const { data: nodes, error: nodeError } = await admin
      .from("wiki_nodes")
      .insert([
        {
          id: sourceId,
          parent_id: folderId,
          type: "page",
          slug: "source",
          title: `Source ${token}`,
          status: "published",
        },
        {
          id: draftId,
          parent_id: folderId,
          type: "page",
          slug: "draft",
          title: `Draft ${token}`,
          status: "draft",
        },
      ])
      .select("*")
    if (nodeError) throw nodeError
    const { data: revisions, error: revisionError } = await admin
      .from("wiki_page_revisions")
      .insert(
        [sourceId, draftId].map((node_id) => ({
          node_id,
          blocks,
          plain_text: content,
        }))
      )
      .select("*")
    if (revisionError) throw revisionError
    for (const revision of revisions) {
      const { error } = await admin
        .from("wiki_nodes")
        .update({ current_revision_id: revision.id })
        .eq("id", revision.node_id)
      if (error) throw error
    }
    draftNode = nodes.find((n) => n.id === draftId) as WikiNodeRow
    draftRevision = revisions.find(
      (r) => r.node_id === draftId
    ) as WikiRevisionRow
    draftNode.current_revision_id = draftRevision.id
    await indexWikiPage({
      supabase: admin as SupabaseWikiClient,
      node: draftNode,
      revision: draftRevision,
      path: "fixture",
      isPublished: false,
    })
  })
  afterAll(async () => {
    if (!admin) return
    await admin.from("knowledge_sources").delete().eq("source_id", draftId)
    await admin.from("wiki_nodes").delete().in("id", [sourceId, draftId])
    await admin.from("wiki_nodes").delete().eq("id", folderId)
  })
  it("denies viewers at the route and excludes drafts even if the detector is called directly", async () => {
    const managerId = (await manager.auth.getUser()).data.user!.id
    const viewerId = (await viewer.auth.getUser()).data.user!.id
    const managerResult = await detectWikiDuplicates(
      manager as SupabaseWikiClient,
      managerId,
      sourceId
    )
    expect(managerResult?.passages[0].matches).toContainEqual(
      expect.objectContaining({
        pageId: draftId,
        title: `Draft ${token}`,
        path: expect.stringMatching(/^\/wiki\/\d+\/\d+$/),
      })
    )
    state.client = manager
    const managerResponse = await POST(
      new Request("http://localhost/api/wiki/duplicates", {
        method: "POST",
        body: JSON.stringify({ nodeId: sourceId }),
      })
    )
    expect(managerResponse.status).toBe(200)
    expect(await managerResponse.text()).toContain(`Draft ${token}`)
    const viewerResult = await detectWikiDuplicates(
      viewer as SupabaseWikiClient,
      viewerId,
      sourceId
    )
    expect(JSON.stringify(viewerResult)).not.toContain(`Draft ${token}`)
    expect(
      viewerResult?.passages[0].matches.some((hit) => hit.pageId === draftId)
    ).toBe(false)
    state.client = viewer
    const response = await POST(
      new Request("http://localhost/api/wiki/duplicates", {
        method: "POST",
        body: JSON.stringify({ nodeId: sourceId }),
      })
    )
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain(`Draft ${token}`)
    const embedding = Array<number>(1536).fill(0)
    embedding[0] = 1
    const viewerVectors = await viewer.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_count: 100,
      source_types: ["wiki_page"],
    })
    expect(viewerVectors.error).toBeNull()
    expect(JSON.stringify(viewerVectors.data)).not.toContain(draftId)
    const { error } = await admin
      .from("wiki_nodes")
      .update({ status: "published" })
      .eq("id", draftId)
    expect(error).toBeNull()
    const published = await detectWikiDuplicates(
      viewer as SupabaseWikiClient,
      viewerId,
      sourceId
    )
    expect(published?.passages[0].matches).toContainEqual(
      expect.objectContaining({ pageId: draftId })
    )
    const archived = await admin
      .from("wiki_nodes")
      .update({ status: "archived" })
      .eq("id", draftId)
    expect(archived.error).toBeNull()
    expect(
      (
        await detectWikiDuplicates(
          manager as SupabaseWikiClient,
          managerId,
          sourceId
        )
      )?.passages[0].matches.some((hit) => hit.pageId === draftId)
    ).toBe(false)
  })
})
