import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo card persistence", () => {
  it("persists message cards only within the owner's thread", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const owner = createClient(url, key, { auth: { persistSession: false } })
    const other = createClient(url, key, { auth: { persistSession: false } })
    const password = process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password"
    const ownerAuth = await owner.auth.signInWithPassword({
      email: "wiki-manager@canopy.test",
      password,
    })
    const otherAuth = await other.auth.signInWithPassword({
      email: "standard@canopy.test",
      password,
    })
    expect(ownerAuth.error).toBeNull()
    expect(otherAuth.error).toBeNull()
    const threadId = randomUUID()
    const messageId = randomUUID()
    const cards = [
      { type: "applied-edit", id: "edit", pageTitle: "Fixture page" },
    ]
    try {
      const thread = await owner
        .from("ai_chat_threads")
        .insert({
          id: threadId,
          user_id: ownerAuth.data.user!.id,
          title: "Card persistence fixture",
        })
      expect(thread.error).toBeNull()
      const message = await owner
        .from("ai_chat_messages")
        .insert({
          id: messageId,
          thread_id: threadId,
          user_id: ownerAuth.data.user!.id,
          role: "assistant",
          content: "",
          metadata: { cards },
        })
      expect(message.error).toBeNull()
      const saved = await owner
        .from("ai_chat_messages")
        .select("metadata")
        .eq("id", messageId)
        .single()
      expect(saved.error).toBeNull()
      expect(saved.data?.metadata.cards).toEqual(cards)
      const hidden = await other
        .from("ai_chat_messages")
        .select("id")
        .eq("id", messageId)
      expect(hidden.error).toBeNull()
      expect(hidden.data).toEqual([])
    } finally {
      await owner.from("ai_chat_threads").delete().eq("id", threadId)
    }
  })
})
