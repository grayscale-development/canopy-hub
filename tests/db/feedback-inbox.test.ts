import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("feedback inbox access", () => {
  let admin: SupabaseClient
  let viewer: SupabaseClient
  let manager: SupabaseClient
  let viewerId: string
  let managerId: string
  const message = `Feedback RLS ${randomUUID()}`

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
    const second = await signIn("admin@canopy.test")
    viewer = first.client
    viewerId = first.id
    manager = second.client
    managerId = second.id
  })
  afterAll(async () => {
    if (admin)
      await admin.from("feedback_items").delete().eq("message", message)
  })

  it("accepts only the caller's valid submission and limits reads and updates to managers", async () => {
    expect(
      (
        await viewer
          .from("feedback_items")
          .insert({ created_by: managerId, type: "bug", message })
      ).error
    ).not.toBeNull()
    expect(
      (
        await viewer.from("feedback_items").insert({
          created_by: viewerId,
          type: "bug",
          message,
          page_path: "/wiki/1",
        })
      ).error
    ).toBeNull()
    expect(
      (
        await viewer
          .from("feedback_items")
          .insert({ created_by: viewerId, type: "invalid", message })
      ).error
    ).not.toBeNull()
    expect(
      (
        await viewer
          .from("feedback_items")
          .insert({
            created_by: viewerId,
            type: "bug",
            message: "x".repeat(5001),
          })
      ).error
    ).not.toBeNull()
    expect(
      (
        await viewer
          .from("feedback_items")
          .insert({
            created_by: viewerId,
            type: "bug",
            message,
            page_path: "//example.com",
          })
      ).error
    ).not.toBeNull()
    expect(
      (
        await viewer
          .from("feedback_items")
          .insert({
            created_by: viewerId,
            type: "bug",
            message,
            status: "resolved",
            resolved_by: viewerId,
            resolved_at: new Date().toISOString(),
          })
      ).error
    ).not.toBeNull()
    expect(
      (await viewer.from("feedback_items").select("id").eq("message", message))
        .data
    ).toEqual([])
    const found = await manager
      .from("feedback_items")
      .select("id,status,page_path")
      .eq("message", message)
      .single()
    expect(found.error).toBeNull()
    expect(found.data).toMatchObject({ status: "open", page_path: "/wiki/1" })
    const denied = await viewer
      .from("feedback_items")
      .update({
        status: "resolved",
        resolved_by: viewerId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", found.data!.id)
      .select("id")
    expect(denied.data).toEqual([])
    const resolved = await manager
      .from("feedback_items")
      .update({
        status: "resolved",
        resolved_by: managerId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", found.data!.id)
      .select("status")
      .single()
    expect(resolved.error).toBeNull()
    expect(resolved.data?.status).toBe("resolved")
    expect((await viewer.rpc("feedback_submitters")).error).not.toBeNull()
    const people = await manager.rpc("feedback_submitters")
    expect(people.error).toBeNull()
    expect(people.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: viewerId })])
    )
  })
})
