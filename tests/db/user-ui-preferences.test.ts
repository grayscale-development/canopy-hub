import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("user UI preferences RLS", { timeout: 60_000 }, () => {
  let service: SupabaseClient
  let owner: SupabaseClient
  let other: SupabaseClient
  let anonymous: SupabaseClient
  let ownerId: string
  let otherId: string
  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
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
    anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    owner = await signIn("wiki-manager@canopy.test")
    other = await signIn("standard@canopy.test")
    ownerId = (await owner.auth.getUser()).data.user!.id
    otherId = (await other.auth.getUser()).data.user!.id
    const { error } = await service
      .from("user_ui_preferences")
      .delete()
      .in("user_id", [ownerId, otherId])
    if (error) throw error
  })
  afterAll(async () => {
    if (service && ownerId && otherId) {
      const { error } = await service
        .from("user_ui_preferences")
        .delete()
        .in("user_id", [ownerId, otherId])
      if (error) throw error
    }
  })
  it("allows only own reads, inserts and updates", async () => {
    const insert = await owner
      .from("user_ui_preferences")
      .insert({ user_id: ownerId })
      .select()
      .single()
    expect(insert.error).toBeNull()
    expect(insert.data.milo_corner).toBe("bottom-right")
    expect(
      (await other.from("user_ui_preferences").insert({ user_id: ownerId }))
        .error
    ).not.toBeNull()
    const read = await other
      .from("user_ui_preferences")
      .select()
      .eq("user_id", ownerId)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([])
    const update = await other
      .from("user_ui_preferences")
      .update({ milo_corner: "top-left" })
      .eq("user_id", ownerId)
      .select()
    expect(update.error).toBeNull()
    expect(update.data).toEqual([])
    expect(
      (
        await owner
          .from("user_ui_preferences")
          .update({ user_id: otherId })
          .eq("user_id", ownerId)
      ).error
    ).not.toBeNull()
    const ownUpdate = await owner
      .from("user_ui_preferences")
      .update({ milo_corner: "top-right" })
      .eq("user_id", ownerId)
      .select()
      .single()
    expect(ownUpdate.error).toBeNull()
    expect(ownUpdate.data.milo_corner).toBe("top-right")
    expect(
      (await owner.from("user_ui_preferences").delete().eq("user_id", ownerId))
        .error
    ).not.toBeNull()
  })
  it("revokes anonymous access", async () => {
    expect(
      (await anonymous.from("user_ui_preferences").select()).error
    ).not.toBeNull()
    expect(
      (await anonymous.from("user_ui_preferences").insert({ user_id: otherId }))
        .error
    ).not.toBeNull()
  })
  it("rejects invalid corners", async () => {
    const result = await owner
      .from("user_ui_preferences")
      .upsert({ user_id: ownerId, milo_corner: "center" })
    expect(result.error?.code).toBe("23514")
  })
})
