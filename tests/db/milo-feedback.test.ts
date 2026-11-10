import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo feedback ownership", () => {
  let admin: SupabaseClient
  let owner: SupabaseClient
  let other: SupabaseClient
  let ownerId: string
  let otherId: string
  const threadId = randomUUID()
  const questionId = randomUUID()
  const answerId = randomUUID()

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
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: answerId,
            thread_id: threadId,
            user_id: ownerId,
            role: "assistant",
            content: "Synthetic answer",
            created_at: "2026-01-01T00:00:01Z",
          },
        ])
      ).error
    ).toBeNull()
  })

  afterAll(async () => {
    if (admin) await admin.from("ai_chat_threads").delete().eq("id", threadId)
  })

  it("allows a user to change their rating and hides it from others", async () => {
    expect(
      (
        await owner
          .from("ai_chat_message_ratings")
          .upsert({
            assistant_message_id: answerId,
            user_id: ownerId,
            rating: "up",
          })
      ).error
    ).toBeNull()
    expect(
      (
        await owner
          .from("ai_chat_message_ratings")
          .upsert({
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
        await other
          .from("ai_chat_message_ratings")
          .upsert({
            assistant_message_id: answerId,
            user_id: otherId,
            rating: "up",
          })
      ).error
    ).not.toBeNull()
    expect(
      (
        await owner
          .from("ai_chat_message_ratings")
          .insert({
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
})
