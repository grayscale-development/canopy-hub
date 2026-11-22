import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { prepareMiloProposal } from "@/lib/milo/proposed-edit"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo proposal persistence", () => {
  it("stores a proposal in its owner's message without changing the page", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    process.env.WIKI_IMPORT_TEST_PROVIDER = "deterministic"
    const manager = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const viewer = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const password = process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password"
    const auth = await manager.auth.signInWithPassword({
      email: "wiki-manager@canopy.test",
      password,
    })
    expect(auth.error).toBeNull()
    expect(
      (
        await viewer.auth.signInWithPassword({
          email: "standard@canopy.test",
          password,
        })
      ).error
    ).toBeNull()
    const pageId = randomUUID(),
      revisionId = randomUUID(),
      threadId = randomUUID(),
      messageId = randomUUID()
    try {
      expect(
        (
          await admin
            .from("wiki_nodes")
            .insert({
              id: pageId,
              type: "page",
              slug: `proposal-${pageId}`,
              title: "Proposal fixture",
              status: "published",
            })
        ).error
      ).toBeNull()
      expect(
        (
          await admin
            .from("wiki_page_revisions")
            .insert({
              id: revisionId,
              node_id: pageId,
              blocks: [{ type: "paragraph", content: "Old policy." }],
              plain_text: "Old policy.",
            })
        ).error
      ).toBeNull()
      expect(
        (
          await admin
            .from("wiki_nodes")
            .update({ current_revision_id: revisionId })
            .eq("id", pageId)
        ).error
      ).toBeNull()
      const extraction = {
        facts: ["The new contact is Jordan."],
        chatter: "",
        unclear: [],
        source: { sender: "Jordan", date: "June 12", subject: "Contact" },
      }
      const prepared = await prepareMiloProposal({
        supabase: manager,
        pageId,
        extraction,
      })
      expect(prepared.card.baseRevisionId).toBe(revisionId)
      expect(prepared.card.after).toContain("The new contact is Jordan.")
      expect(
        (
          await manager
            .from("ai_chat_threads")
            .insert({
              id: threadId,
              user_id: auth.data.user!.id,
              title: "Proposal fixture",
            })
        ).error
      ).toBeNull()
      expect(
        (
          await manager
            .from("ai_chat_messages")
            .insert({
              id: messageId,
              thread_id: threadId,
              user_id: auth.data.user!.id,
              role: "assistant",
              content: "Proposal",
              metadata: { cards: [prepared.card] },
            })
        ).error
      ).toBeNull()
      const saved = await manager
        .from("ai_chat_messages")
        .select("metadata")
        .eq("id", messageId)
        .single()
      expect(saved.data?.metadata.cards[0]).toMatchObject({
        pageId,
        baseRevisionId: revisionId,
      })
      expect(
        (await viewer.from("ai_chat_messages").select("id").eq("id", messageId))
          .data
      ).toEqual([])
      expect(
        (
          await admin
            .from("wiki_nodes")
            .select("current_revision_id")
            .eq("id", pageId)
            .single()
        ).data?.current_revision_id
      ).toBe(revisionId)
      const revisions = await admin
        .from("wiki_page_revisions")
        .select("id")
        .eq("node_id", pageId)
      expect(revisions.data).toEqual([{ id: revisionId }])
    } finally {
      await admin.from("ai_chat_threads").delete().eq("id", threadId)
      await admin.from("wiki_nodes").delete().eq("id", pageId)
    }
  })
})
