import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo feedback ownership", () => {
  let admin: SupabaseClient
  let owner: SupabaseClient
  let other: SupabaseClient
  let manager: SupabaseClient
  let ownerId: string
  let otherId: string
  const threadId = randomUUID()
  const questionId = randomUUID()
  const answerId = randomUUID()
  const unsharedAnswerId = randomUUID()
  const pageId = randomUUID()
  const sourceId = randomUUID()
  const page2Id = randomUUID()
  const source2Id = randomUUID()

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
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
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      })
      expect(error).toBeNull()
      return { client, id: data.user!.id }
    }
    const first = await signIn("standard@canopy.test")
    const second = await signIn("wiki-manager@canopy.test")
    owner = first.client
    ownerId = first.id
    other = second.client
    otherId = second.id
    manager = (await signIn("admin@canopy.test")).client
    expect(
      (
        await admin.from("wiki_nodes").insert({
          id: pageId,
          type: "page",
          slug: `feedback-${pageId}`,
          title: "Synthetic feedback page",
          status: "published",
        })
      ).error
    ).toBeNull()
    expect(
      (
        await admin
          .from("wiki_nodes")
          .insert({
            id: page2Id,
            type: "page",
            slug: `feedback-${page2Id}`,
            title: "Another synthetic page",
            status: "published",
          })
      ).error
    ).toBeNull()
    expect(
      (
        await admin
          .from("knowledge_sources")
          .insert({
            id: source2Id,
            source_type: "wiki_page",
            source_id: page2Id,
            title: "Another synthetic page",
            content_hash: page2Id,
          })
      ).error
    ).toBeNull()
    expect(
      (
        await admin.from("knowledge_sources").insert({
          id: sourceId,
          source_type: "wiki_page",
          source_id: pageId,
          title: "Synthetic feedback page",
          content_hash: pageId,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await admin
          .from("ai_chat_threads")
          .insert({ id: threadId, user_id: ownerId })
      ).error
    ).toBeNull()
    expect(
      (
        await admin.from("ai_chat_messages").insert([
          {
            id: questionId,
            thread_id: threadId,
            user_id: ownerId,
            role: "user",
            content: "Synthetic question",
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: answerId,
            thread_id: threadId,
            user_id: ownerId,
            role: "assistant",
            content: "Synthetic answer",
            metadata: { abstained: true },
            created_at: "2026-01-01T00:00:01Z",
          },
          {
            id: unsharedAnswerId,
            thread_id: threadId,
            user_id: ownerId,
            role: "assistant",
            content: "Unshared private answer",
            metadata: { abstained: true },
            created_at: "2026-01-01T00:00:02Z",
          },
        ])
      ).error
    ).toBeNull()
    expect(
      (
        await admin.from("ai_chat_citations").insert(
          [
            [answerId, sourceId],
            [answerId, source2Id],
            [unsharedAnswerId, source2Id],
            [unsharedAnswerId, sourceId],
          ].map(([message_id, knowledge_source_id]) => ({
            message_id,
            knowledge_source_id,
            title: "Synthetic candidate",
            created_at: "2026-01-01T00:00:03Z",
          }))
        )
      ).error
    ).toBeNull()
  })

  afterAll(async () => {
    if (admin) {
      await admin.from("ai_chat_threads").delete().eq("id", threadId)
      await admin.from("knowledge_sources").delete().eq("id", sourceId)
      await admin.from("knowledge_sources").delete().eq("id", source2Id)
      await admin.from("wiki_nodes").delete().eq("id", pageId)
      await admin.from("wiki_nodes").delete().eq("id", page2Id)
    }
  })

  it("allows a user to change their rating and hides it from others", async () => {
    expect(
      (
        await owner.from("ai_chat_message_ratings").upsert({
          assistant_message_id: answerId,
          user_id: ownerId,
          rating: "up",
        })
      ).error
    ).toBeNull()
    expect(
      (
        await owner.from("ai_chat_message_ratings").upsert({
          assistant_message_id: answerId,
          user_id: ownerId,
          rating: "down",
        })
      ).error
    ).toBeNull()
    expect(
      (
        await owner
          .from("ai_chat_message_ratings")
          .select("rating")
          .eq("assistant_message_id", answerId)
      ).data
    ).toEqual([{ rating: "down" }])
    expect(
      (
        await other
          .from("ai_chat_message_ratings")
          .select("rating")
          .eq("assistant_message_id", answerId)
      ).data
    ).toEqual([])
    expect(
      (
        await other.from("ai_chat_message_ratings").upsert({
          assistant_message_id: answerId,
          user_id: otherId,
          rating: "up",
        })
      ).error
    ).not.toBeNull()
    expect(
      (
        await owner.from("ai_chat_message_ratings").insert({
          assistant_message_id: questionId,
          user_id: ownerId,
          rating: "up",
        })
      ).error
    ).not.toBeNull()
  })

  it("rejects flags that reference another user's answer or forged message content", async () => {
    const flag = {
      user_id: ownerId,
      thread_id: threadId,
      user_message_id: questionId,
      assistant_message_id: answerId,
      reason: "Synthetic reason",
      acknowledged: true,
      user_message_content: "Synthetic question",
      assistant_message_content: "Synthetic answer",
    }
    expect(
      (
        await other
          .from("ai_chat_message_flags")
          .insert({ ...flag, user_id: otherId })
      ).error
    ).not.toBeNull()
    expect(
      (
        await owner
          .from("ai_chat_message_flags")
          .insert({ ...flag, assistant_message_content: "Forged" })
      ).error
    ).not.toBeNull()
    expect(
      (await owner.from("ai_chat_message_flags").insert(flag)).error
    ).toBeNull()
    expect(
      (
        await other
          .from("ai_chat_message_flags")
          .select("id")
          .eq("assistant_message_id", answerId)
      ).data
    ).toEqual([])
  })

  it("only exposes aggregate counts to authorized managers, without private messages", async () => {
    expect((await owner.rpc("milo_gap_counts")).error).not.toBeNull()
    expect((await other.rpc("milo_gap_counts")).error).not.toBeNull()
    const result = await manager.rpc("milo_gap_counts")
    expect(result.error).toBeNull()
    const expectedPageId = pageId < page2Id ? pageId : page2Id
    const group = result.data.find(
      (row: { page_id: string }) => row.page_id === expectedPageId
    )
    expect(group).toEqual({
      page_id: expectedPageId,
      page_title:
        expectedPageId === pageId
          ? "Synthetic feedback page"
          : "Another synthetic page",
      question_count: 2,
    })
    expect(JSON.stringify(result.data)).not.toContain("Unshared private answer")
    expect(JSON.stringify(result.data)).not.toContain("Synthetic question")
    expect(
      (
        await manager
          .from("ai_chat_messages")
          .select("content")
          .eq("id", unsharedAnswerId)
      ).data
    ).toEqual([])
    expect(
      (
        await manager
          .from("ai_chat_message_ratings")
          .select("rating")
          .eq("assistant_message_id", answerId)
      ).data
    ).toEqual([])
  })
})
