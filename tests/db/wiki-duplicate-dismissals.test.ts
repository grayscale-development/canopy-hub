import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { detectWikiDuplicates } from "@/lib/wiki-duplicates"
import type { SupabaseWikiClient } from "@/lib/wiki"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("duplicate dismissal RLS", { timeout: 60_000 }, () => {
  let admin: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  const source = randomUUID()
  const other = randomUUID()
  const token = randomUUID()
  const passage = `Fixture ${token}: Verify all required approvals before publishing this procedure.`
  const blocks = (text: string) => [
    { id: "block", type: "paragraph", content: [{ type: "text", text }] },
  ]

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const signIn = async (email: string) => {
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
    const { error } = await admin.from("wiki_nodes").insert(
      [source, other].map((id, index) => ({
        id,
        type: "page",
        slug: `dismissal-${token}-${index}`,
        title: `Dismissal ${token} ${index}`,
        status: "published",
      }))
    )
    if (error) throw error
    const revisions = await admin
      .from("wiki_page_revisions")
      .insert(
        [source, other].map((node_id) => ({
          node_id,
          blocks: blocks(passage),
          plain_text: passage,
        }))
      )
      .select("id,node_id")
    if (revisions.error) throw revisions.error
    for (const revision of revisions.data!) {
      const updated = await admin
        .from("wiki_nodes")
        .update({ current_revision_id: revision.id })
        .eq("id", revision.node_id)
      if (updated.error) throw updated.error
    }
  })
  afterAll(async () => {
    if (admin) await admin.from("wiki_nodes").delete().in("id", [source, other])
  })

  it("restricts writes, permits visible reads, and rechecks edited text and cached results", async () => {
    const managerId = (await manager.auth.getUser()).data.user!.id
    const viewerId = (await viewer.auth.getUser()).data.user!.id
    const detect = (client: SupabaseClient, userId: string, include = false) =>
      detectWikiDuplicates(
        client as SupabaseWikiClient,
        userId,
        source,
        undefined,
        include
      )
    const initial = await detect(manager, managerId)
    expect(initial?.passages[0].matches).toContainEqual(
      expect.objectContaining({ pageId: other })
    )
    const row = {
      node_id: source,
      other_node_id: other,
      passage_hash: initial!.passages[0].passageHash,
      dismissed_by: managerId,
    }
    expect(
      (
        await viewer
          .from("wiki_duplicate_dismissals")
          .insert({ ...row, dismissed_by: viewerId })
      ).error
    ).not.toBeNull()
    expect(
      (
        await manager.from("wiki_duplicate_dismissals").upsert(row, {
          onConflict: "node_id,other_node_id,passage_hash",
          ignoreDuplicates: true,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await manager.from("wiki_duplicate_dismissals").upsert(row, {
          onConflict: "node_id,other_node_id,passage_hash",
          ignoreDuplicates: true,
        })
      ).error
    ).toBeNull()
    const read = await viewer
      .from("wiki_duplicate_dismissals")
      .select("passage_hash")
      .eq("node_id", source)
      .eq("other_node_id", other)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([{ passage_hash: row.passage_hash }])
    expect(
      (
        await viewer
          .from("wiki_duplicate_dismissals")
          .delete()
          .eq("node_id", source)
          .eq("other_node_id", other)
      ).error
    ).toBeNull()
    const afterViewerDelete = await manager
      .from("wiki_duplicate_dismissals")
      .select("passage_hash")
      .eq("node_id", source)
      .eq("other_node_id", other)
    expect(afterViewerDelete.data).toEqual([{ passage_hash: row.passage_hash }])
    expect((await detect(manager, managerId, true))?.dismissed).toContainEqual(
      expect.objectContaining({
        passageHash: row.passage_hash,
        match: expect.objectContaining({ pageId: other }),
      })
    )
    expect(
      (await detect(manager, managerId))?.passages[0].matches
    ).not.toContainEqual(expect.objectContaining({ pageId: other }))
    expect(
      (
        await manager
          .from("wiki_duplicate_dismissals")
          .delete()
          .eq("node_id", source)
          .eq("other_node_id", other)
          .eq("passage_hash", row.passage_hash)
      ).error
    ).toBeNull()
    expect(
      (await detect(manager, managerId))?.passages[0].matches
    ).toContainEqual(expect.objectContaining({ pageId: other }))
    expect(
      (await manager.from("wiki_duplicate_dismissals").insert(row)).error
    ).toBeNull()
    const edited = `${passage} New sentence.`
    const revision = await admin
      .from("wiki_page_revisions")
      .insert({ node_id: source, blocks: blocks(edited), plain_text: edited })
      .select("id")
      .single()
    expect(revision.error).toBeNull()
    expect(
      (
        await admin
          .from("wiki_nodes")
          .update({ current_revision_id: revision.data!.id })
          .eq("id", source)
      ).error
    ).toBeNull()
    const changed = await detect(manager, managerId, true)
    expect(changed?.passages[0].passageHash).not.toBe(row.passage_hash)
    expect(changed?.passages[0].matches).toContainEqual(
      expect.objectContaining({ pageId: other })
    )
    expect(changed?.dismissed).toEqual([])
    expect(
      (
        await admin
          .from("wiki_nodes")
          .update({ status: "draft" })
          .eq("id", other)
      ).error
    ).toBeNull()
    const inaccessible = await viewer
      .from("wiki_duplicate_dismissals")
      .select("passage_hash")
      .eq("node_id", source)
      .eq("other_node_id", other)
    expect(inaccessible.error).toBeNull()
    expect(inaccessible.data).toEqual([])
    const managerRead = await manager
      .from("wiki_duplicate_dismissals")
      .select("passage_hash")
      .eq("node_id", source)
      .eq("other_node_id", other)
    expect(managerRead.data).toEqual([{ passage_hash: row.passage_hash }])
  })
})
