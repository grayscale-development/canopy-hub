import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo source retention", () => {
  it("keeps source and confirmation metadata in the owner's chat only", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const owner = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const other = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
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
    const sourceId = randomUUID()
    const assistantId = randomUUID()
    const body = `Private fixture ${randomUUID()}\nFrom: Alex Example\nSubject: New policy`
    const state = {
      stage: "ready_to_find_page",
      sourceMessageId: sourceId,
      extraction: {
        facts: ["A policy changed"],
        chatter: "",
        unclear: [],
        source: {
          sender: "Alex Example",
          date: "March 2",
          subject: "New policy",
        },
      },
    }
    try {
      expect(
        (
          await owner.from("ai_chat_threads").insert({
            id: threadId,
            user_id: ownerAuth.data.user!.id,
            title: "Source retention fixture",
          })
        ).error
      ).toBeNull()
      expect(
        (
          await owner.from("ai_chat_messages").insert([
            {
              id: sourceId,
              thread_id: threadId,
              user_id: ownerAuth.data.user!.id,
              role: "user",
              content: body,
              metadata: {},
            },
            {
              id: assistantId,
              thread_id: threadId,
              user_id: ownerAuth.data.user!.id,
              role: "assistant",
              content: "Next: find the page",
              metadata: { miloEdit: state },
            },
          ])
        ).error
      ).toBeNull()
      const saved = await owner
        .from("ai_chat_messages")
        .select("id,content,metadata")
        .eq("thread_id", threadId)
      expect(saved.error).toBeNull()
      expect(saved.data?.find((row) => row.id === sourceId)?.content).toBe(body)
      expect(
        saved.data?.find((row) => row.id === assistantId)?.metadata.miloEdit
      ).toEqual(state)
      const hidden = await other
        .from("ai_chat_messages")
        .select("id")
        .eq("thread_id", threadId)
      expect(hidden.data).toEqual([])
    } finally {
      await owner.from("ai_chat_threads").delete().eq("id", threadId)
    }
  })
})
