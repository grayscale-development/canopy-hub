import fs from "node:fs"
import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const TEST_PASSWORD = process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password"
const shouldRunDbTests = process.env.CANOPY_DB_TESTS === "1"

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "")
    }
  }
}

function loadTestEnv() {
  loadEnvFile(path.resolve(process.cwd(), ".env.test.local"))
  loadEnvFile(path.resolve(process.cwd(), ".env.local"))
}

async function signIn(email: string) {
  loadTestEnv()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing local Supabase env for DB tests.")
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error(`Refusing non-local Supabase URL: ${supabaseUrl}`)
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (error) throw error
  return supabase
}

async function createPage(
  supabase: SupabaseClient,
  parentId: string,
  slug: string,
  text: string
) {
  const { data: node, error } = await supabase
    .from("wiki_nodes")
    .insert({
      parent_id: parentId,
      type: "page",
      slug,
      title: slug,
      status: "published",
    })
    .select("id")
    .single()
  if (error || !node) throw error ?? new Error("Unable to create a page.")

  const { data: older, error: olderError } = await supabase
    .from("wiki_page_revisions")
    .insert({
      node_id: node.id,
      blocks: [{ type: "paragraph", content: "Original history" }],
      plain_text: "Original history",
      change_note: "Original history",
    })
    .select("id")
    .single()
  if (olderError || !older) throw olderError ?? new Error("No older revision.")

  const { data: revision, error: revisionError } = await supabase
    .from("wiki_page_revisions")
    .insert({
      node_id: node.id,
      blocks: [{ type: "paragraph", content: text }],
      plain_text: text,
      change_note: "Current",
    })
    .select("id")
    .single()
  if (revisionError || !revision) {
    throw revisionError ?? new Error("No current revision.")
  }

  const { error: pointerError } = await supabase
    .from("wiki_nodes")
    .update({ current_revision_id: revision.id })
    .eq("id", node.id)
  if (pointerError) throw pointerError

  const { error: assetError } = await supabase.from("wiki_assets").insert({
    node_id: node.id,
    storage_bucket: "Wiki",
    storage_path: `${node.id}/kept-note.txt`,
    file_name: "kept-note.txt",
    mime_type: "text/plain",
    size_bytes: 4,
    kind: "document",
  })
  if (assetError) throw assetError

  return { id: node.id as string, revisionId: revision.id as string }
}

const dbDescribe = shouldRunDbTests ? describe : describe.skip

dbDescribe("apply_wiki_reviewed_revision", { timeout: 20_000 }, () => {
  it("saves the target and archives the source together, and a stale retry writes nothing", async () => {
    const manager = await signIn("wiki-manager@canopy.test")
    const { data: parent, error: parentError } = await manager
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "closing")
      .single()
    expect(parentError).toBeNull()
    const stamp = Date.now()
    const target = await createPage(
      manager,
      parent!.id,
      `atomic-target-${stamp}`,
      "Target stays."
    )
    const source = await createPage(
      manager,
      parent!.id,
      `atomic-source-${stamp}`,
      "Source moves."
    )

    const stale = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: "00000000-0000-4000-8000-000000000099",
      p_blocks: [{ type: "paragraph", content: "Should not save." }],
      p_plain_text: "Should not save.",
      p_change_note: "Stale",
      p_source_id: source.id,
    })
    expect(stale.error?.message).toMatch(/stale_revision/)

    const { count: beforeCount } = await manager
      .from("wiki_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("node_id", target.id)
    expect(beforeCount).toBe(2)

    const saved = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: target.revisionId,
      p_blocks: [{ type: "paragraph", content: "Merged result." }],
      p_plain_text: "Merged result.",
      p_change_note: "Merged",
      p_source_id: source.id,
    })
    expect(saved.error).toBeNull()
    expect(saved.data).toEqual(expect.any(String))

    const { data: targetNode } = await manager
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", target.id)
      .single()
    expect(targetNode?.current_revision_id).toBe(saved.data)

    const { data: sourceNode } = await manager
      .from("wiki_nodes")
      .select("status")
      .eq("id", source.id)
      .single()
    expect(sourceNode?.status).toBe("archived")

    const { data: sourceHistory } = await manager
      .from("wiki_page_revisions")
      .select("id")
      .eq("node_id", source.id)
    expect(sourceHistory?.length).toBe(2)

    const { data: sourceAssets } = await manager
      .from("wiki_assets")
      .select("file_name")
      .eq("node_id", source.id)
    expect(sourceAssets).toEqual([{ file_name: "kept-note.txt" }])

    const retry = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: target.revisionId,
      p_blocks: [{ type: "paragraph", content: "Retry." }],
      p_plain_text: "Retry.",
      p_change_note: "Retry",
      p_source_id: source.id,
    })
    expect(retry.error?.message).toMatch(/stale_revision/)

    const { count: afterCount } = await manager
      .from("wiki_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("node_id", target.id)
    expect(afterCount).toBe(3)
  })

  it("lets only one concurrent save win when both use the same base revision", async () => {
    const first = await signIn("wiki-manager@canopy.test")
    const second = await signIn("wiki-manager@canopy.test")
    const { data: parent } = await first
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "closing")
      .single()
    const stamp = Date.now()
    const target = await createPage(
      first,
      parent!.id,
      `atomic-race-${stamp}`,
      "Race start."
    )
    const calls = await Promise.all([
      first.rpc("apply_wiki_reviewed_revision", {
        p_target_id: target.id,
        p_base_revision_id: target.revisionId,
        p_blocks: [{ type: "paragraph", content: "Winner A." }],
        p_plain_text: "Winner A.",
        p_change_note: "A",
        p_source_id: null,
      }),
      second.rpc("apply_wiki_reviewed_revision", {
        p_target_id: target.id,
        p_base_revision_id: target.revisionId,
        p_blocks: [{ type: "paragraph", content: "Winner B." }],
        p_plain_text: "Winner B.",
        p_change_note: "B",
        p_source_id: null,
      }),
    ])
    const successes = calls.filter((result) => !result.error)
    const failures = calls.filter((result) => result.error)
    expect(successes).toHaveLength(1)
    expect(failures[0]?.error?.message).toMatch(/stale_revision/)

    const { count } = await first
      .from("wiki_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("node_id", target.id)
    expect(count).toBe(3)
  })
})
