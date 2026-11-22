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

async function createMiloManager(admin: SupabaseClient) {
  const email = `milo-${crypto.randomUUID()}@canopy.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error("Unable to create manager")
  const permissions = await admin
    .from("permissions")
    .select("id")
    .in("code", ["beta.1", "wiki.manage"])
  if (permissions.error || permissions.data.length !== 2)
    throw permissions.error ?? new Error("Missing permissions")
  const granted = await admin.from("user_permissions").insert(
    permissions.data.map((permission) => ({
      user_id: data.user.id,
      permission_id: permission.id,
    }))
  )
  if (granted.error) throw granted.error
  return signIn(email)
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
      p_source_base_revision_id: source.revisionId,
    })
    expect(stale.error?.message).toMatch(/stale_revision/)

    const { count: beforeCount } = await manager
      .from("wiki_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("node_id", target.id)
    expect(beforeCount).toBe(2)

    const staleSource = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: target.revisionId,
      p_blocks: [{ type: "paragraph", content: "Should not archive." }],
      p_plain_text: "Should not archive.",
      p_change_note: "Stale source",
      p_source_id: source.id,
      p_source_base_revision_id: "00000000-0000-4000-8000-000000000098",
    })
    expect(staleSource.error?.message).toMatch(/stale_revision/)

    const { count: afterStaleSourceCount } = await manager
      .from("wiki_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("node_id", target.id)
    expect(afterStaleSourceCount).toBe(beforeCount)

    const saved = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: target.revisionId,
      p_blocks: [{ type: "paragraph", content: "Merged result." }],
      p_plain_text: "Merged result.",
      p_change_note: "Merged",
      p_source_id: source.id,
      p_source_base_revision_id: source.revisionId,
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
      p_source_base_revision_id: source.revisionId,
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
        p_source_base_revision_id: null,
      }),
      second.rpc("apply_wiki_reviewed_revision", {
        p_target_id: target.id,
        p_base_revision_id: target.revisionId,
        p_blocks: [{ type: "paragraph", content: "Winner B." }],
        p_plain_text: "Winner B.",
        p_change_note: "B",
        p_source_id: null,
        p_source_base_revision_id: null,
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

  it("binds Milo approval to the owner and retained proposal, and undoes as a new revision", async () => {
    const outsider = await signIn("standard@canopy.test")
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const manager = await createMiloManager(admin)
    const otherManager = await createMiloManager(admin)
    const {
      data: { user },
    } = await manager.auth.getUser()
    const { data: parent } = await manager
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "closing")
      .single()
    const target = await createPage(
      manager,
      parent!.id,
      `milo-apply-${crypto.randomUUID()}`,
      "Original policy."
    )
    expect(
      (
        await manager
          .from("wiki_nodes")
          .update({ status: "draft" })
          .eq("id", target.id)
      ).error
    ).toBeNull()
    const { data: thread } = await manager
      .from("ai_chat_threads")
      .insert({ user_id: user!.id, title: "Milo fixture" })
      .select("id")
      .single()
    const card = {
      type: "proposed-edit",
      id: "proposed-edit",
      pageId: target.id,
      pageTitle: "Policy",
      baseRevisionId: target.revisionId,
      before: "Original policy.",
      after: "Updated policy.",
      blocks: [{ type: "paragraph", content: "Updated policy." }],
      plain_text: "Updated policy.",
      changeNote: "Updated from email",
      summary: "Updated policy.",
    }
    const { data: message } = await manager
      .from("ai_chat_messages")
      .insert({
        thread_id: thread!.id,
        user_id: user!.id,
        role: "assistant",
        content: "Review",
        metadata: { cards: [card] },
      })
      .select("id")
      .single()
    const inserted = await admin.from("milo_edit_proposals").insert({
      thread_id: thread!.id,
      message_id: message!.id,
      user_id: user!.id,
      node_id: target.id,
      base_revision_id: target.revisionId,
      card,
      edit_state: {},
    })
    expect(inserted.error).toBeNull()
    const args = {
      p_thread_id: thread!.id,
      p_message_id: message!.id,
      p_card_id: card.id,
      p_action: "approve",
      p_page_url: "/wiki/1/2",
    }
    expect(
      (await outsider.rpc("apply_milo_edit", args)).error?.message
    ).toMatch(/forbidden/)
    expect(
      (await otherManager.rpc("apply_milo_edit", args)).error?.message
    ).toMatch(/proposal_not_found/)
    for (const forged of [
      { ...card, pageId: crypto.randomUUID() },
      { ...card, blocks: [{ type: "paragraph", content: "Forged" }] },
    ]) {
      await manager
        .from("ai_chat_messages")
        .update({ metadata: { cards: [forged] } })
        .eq("id", message!.id)
      expect(
        (await manager.rpc("apply_milo_edit", args)).error?.message
      ).toMatch(/proposal_changed/)
    }
    await manager
      .from("ai_chat_messages")
      .update({ metadata: { cards: [card] } })
      .eq("id", message!.id)
    expect(
      (
        await manager
          .from("wiki_nodes")
          .update({ status: "archived" })
          .eq("id", target.id)
      ).error
    ).toBeNull()
    expect((await manager.rpc("apply_milo_edit", args)).error?.message).toMatch(
      /page_unavailable/
    )
    expect(
      (
        await manager
          .from("wiki_nodes")
          .update({ status: "draft" })
          .eq("id", target.id)
      ).error
    ).toBeNull()
    const applied = await manager.rpc("apply_milo_edit", args)
    expect(applied.error).toBeNull()
    expect(applied.data).toMatchObject({
      type: "applied-edit",
      undoAvailable: true,
    })
    const { data: appliedNode } = await manager
      .from("wiki_nodes")
      .select("current_revision_id,status")
      .eq("id", target.id)
      .single()
    expect(appliedNode!.status).toBe("draft")
    const { data: newRevision } = await manager
      .from("wiki_page_revisions")
      .select("created_by,plain_text,change_note")
      .eq("id", appliedNode!.current_revision_id)
      .single()
    expect(newRevision).toMatchObject({
      created_by: user!.id,
      plain_text: "Updated policy.",
      change_note: "Updated from email",
    })
    const undone = await manager.rpc("apply_milo_edit", {
      ...args,
      p_action: "undo",
    })
    expect(undone.error).toBeNull()
    expect(undone.data).toMatchObject({ undone: true, undoAvailable: false })
    const { data: node } = await manager
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", target.id)
      .single()
    expect(node!.current_revision_id).not.toBe(target.revisionId)
    const { data: restored } = await manager
      .from("wiki_page_revisions")
      .select("plain_text,created_by,change_note")
      .eq("id", node!.current_revision_id)
      .single()
    expect(restored).toMatchObject({
      plain_text: "Original policy.",
      created_by: user!.id,
      change_note: expect.stringMatching(/^Restored from/),
    })
    expect(
      (await manager.rpc("apply_milo_edit", { ...args, p_action: "undo" }))
        .error?.message
    ).toMatch(/undo_unavailable/)
    const { data: audit } = await manager
      .from("milo_edit_audit")
      .select(
        "thread_id,message_id,user_id,node_id,base_revision_id,new_revision_id,action"
      )
      .eq("message_id", message!.id)
      .order("created_at")
    expect(audit).toEqual([
      {
        thread_id: thread!.id,
        message_id: message!.id,
        user_id: user!.id,
        node_id: target.id,
        base_revision_id: target.revisionId,
        new_revision_id: appliedNode!.current_revision_id,
        action: "approve",
      },
      {
        thread_id: thread!.id,
        message_id: message!.id,
        user_id: user!.id,
        node_id: target.id,
        base_revision_id: appliedNode!.current_revision_id,
        new_revision_id: node!.current_revision_id,
        action: "undo",
      },
    ])
    const forgedAudit = await admin
      .from("milo_edit_audit")
      .insert({
        thread_id: thread!.id,
        message_id: message!.id,
        user_id: user!.id,
        node_id: target.id,
        base_revision_id: target.revisionId,
        new_revision_id: node!.current_revision_id,
        action: "approve",
      })
    expect(forgedAudit.error).not.toBeNull()
    expect(
      (
        await outsider
          .from("milo_edit_audit")
          .select("id")
          .eq("message_id", message!.id)
      ).data
    ).toEqual([])
    expect(
      (await manager.from("milo_edit_proposals").select("message_id")).error
    ).not.toBeNull()
  })

  it("rejects stale Milo approvals and undo without partial revisions or audit entries", async () => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const manager = await createMiloManager(admin)
    const {
      data: { user },
    } = await manager.auth.getUser()
    const { data: parent } = await manager
      .from("wiki_nodes")
      .select("id")
      .eq("slug", "closing")
      .single()
    const target = await createPage(
      manager,
      parent!.id,
      `milo-stale-${crypto.randomUUID()}`,
      "Start"
    )
    const { data: thread } = await manager
      .from("ai_chat_threads")
      .insert({ user_id: user!.id, title: "Stale fixture" })
      .select("id")
      .single()
    const card = {
      type: "proposed-edit",
      id: "edit",
      pageId: target.id,
      pageTitle: "Policy",
      baseRevisionId: target.revisionId,
      before: "Start",
      after: "Proposed",
      blocks: [{ type: "paragraph", content: "Proposed" }],
      plain_text: "Proposed",
      changeNote: "Milo",
    }
    const { data: message } = await manager
      .from("ai_chat_messages")
      .insert({
        thread_id: thread!.id,
        user_id: user!.id,
        role: "assistant",
        content: "Review",
        metadata: { cards: [card] },
      })
      .select("id")
      .single()
    expect(
      (
        await admin.from("milo_edit_proposals").insert({
          thread_id: thread!.id,
          message_id: message!.id,
          user_id: user!.id,
          node_id: target.id,
          base_revision_id: target.revisionId,
          card,
          edit_state: {},
        })
      ).error
    ).toBeNull()
    const args = {
      p_thread_id: thread!.id,
      p_message_id: message!.id,
      p_card_id: card.id,
      p_action: "approve",
      p_page_url: "/wiki/1/2",
    }
    const manual = await manager.rpc("apply_wiki_reviewed_revision", {
      p_target_id: target.id,
      p_base_revision_id: target.revisionId,
      p_blocks: [{ type: "paragraph", content: "Later" }],
      p_plain_text: "Later",
      p_change_note: "Manual",
      p_source_id: null,
      p_source_base_revision_id: null,
    })
    expect(manual.error).toBeNull()
    expect((await manager.rpc("apply_milo_edit", args)).error?.message).toMatch(
      /stale_revision/
    )
    expect(
      (
        await manager
          .from("wiki_page_revisions")
          .select("id", { count: "exact", head: true })
          .eq("node_id", target.id)
      ).count
    ).toBe(3)
    expect(
      (
        await manager
          .from("milo_edit_audit")
          .select("id")
          .eq("message_id", message!.id)
      ).data
    ).toEqual([])
    const fresh = { ...card, baseRevisionId: manual.data }
    await admin
      .from("milo_edit_proposals")
      .update({ base_revision_id: manual.data, card: fresh })
      .eq("message_id", message!.id)
    await manager
      .from("ai_chat_messages")
      .update({ metadata: { cards: [fresh] } })
      .eq("id", message!.id)
    expect((await manager.rpc("apply_milo_edit", args)).error).toBeNull()
    const { data: appliedNode } = await manager
      .from("wiki_nodes")
      .select("current_revision_id")
      .eq("id", target.id)
      .single()
    expect(
      (
        await manager.rpc("apply_wiki_reviewed_revision", {
          p_target_id: target.id,
          p_base_revision_id: appliedNode!.current_revision_id,
          p_blocks: [],
          p_plain_text: "Another edit",
          p_change_note: "Later",
          p_source_id: null,
          p_source_base_revision_id: null,
        })
      ).error
    ).toBeNull()
    expect(
      (await manager.rpc("apply_milo_edit", { ...args, p_action: "undo" }))
        .error?.message
    ).toMatch(/stale_revision/)
    expect(
      (
        await manager
          .from("milo_edit_audit")
          .select("id")
          .eq("message_id", message!.id)
      ).data
    ).toHaveLength(1)
    expect(
      (
        await manager
          .from("wiki_page_revisions")
          .select("id", { count: "exact", head: true })
          .eq("node_id", target.id)
      ).count
    ).toBe(5)
  })
})
