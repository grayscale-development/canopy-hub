import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("AI action log permissions", { timeout: 60_000 }, () => {
  let service: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  let anonymous: SupabaseClient
  const target = randomUUID()

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const options = { auth: { persistSession: false } }
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
    const createUserClient = () =>
      createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options)
    anonymous = createUserClient()
    const signIn = async (email: string) => {
      const client = createUserClient()
      const { error } = await client.auth.signInWithPassword({
        email,
        password: "canopy-test-password",
      })
      if (error) throw error
      return client
    }
    manager = await signIn("wiki-manager@canopy.test")
    viewer = await signIn("standard@canopy.test")
  })

  it("records all three actions and authenticates user actors", async () => {
    const scan = await service
      .from("ai_action_log")
      .insert({
        action_type: "alert_recommendation",
        target_page_id: target,
        target_alert_id: target,
        summary: "Recommendation",
      })
    expect(scan.error).toBeNull()
    expect(
      (
        await viewer.rpc("log_user_ai_action", {
          p_action_type: "milo_answer",
          p_target_page_id: target,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await manager.rpc("log_user_ai_action", {
          p_action_type: "alert_apply",
          p_target_page_id: target,
          p_target_alert_id: target,
        })
      ).error
    ).toBeNull()
    const rows = await service
      .from("ai_action_log")
      .select("action_type,actor_user_id,target_alert_id")
      .eq("target_page_id", target)
    expect(rows.error).toBeNull()
    expect(rows.data).toEqual(
      expect.arrayContaining([
        {
          action_type: "alert_recommendation",
          actor_user_id: null,
          target_alert_id: target,
        },
        {
          action_type: "milo_answer",
          actor_user_id: (await viewer.auth.getUser()).data.user!.id,
          target_alert_id: null,
        },
        {
          action_type: "alert_apply",
          actor_user_id: (await manager.auth.getUser()).data.user!.id,
          target_alert_id: target,
        },
      ])
    )
    expect(rows.data).toHaveLength(3)
  })

  it("rejects invalid types, direct user writes, unauthenticated calls and viewer applies", async () => {
    expect(
      (
        await service
          .from("ai_action_log")
          .insert({ action_type: "invalid", summary: "Invalid" })
      ).error
    ).not.toBeNull()
    for (const client of [anonymous, viewer, manager]) {
      expect(
        (
          await client
            .from("ai_action_log")
            .insert({ action_type: "milo_answer", summary: "Direct" })
        ).error
      ).not.toBeNull()
    }
    expect(
      (
        await anonymous.rpc("log_user_ai_action", {
          p_action_type: "milo_answer",
        })
      ).error
    ).not.toBeNull()
    expect(
      (
        await viewer.rpc("log_user_ai_action", {
          p_action_type: "alert_recommendation",
        })
      ).error
    ).not.toBeNull()
    expect(
      (await viewer.rpc("log_user_ai_action", { p_action_type: "alert_apply" }))
        .error
    ).not.toBeNull()
  })

  it("denies updates and deletes to all application roles", async () => {
    for (const client of [manager, viewer, service]) {
      expect(
        (
          await client
            .from("ai_action_log")
            .update({ summary: "changed" })
            .eq("target_page_id", target)
        ).error
      ).not.toBeNull()
      expect(
        (
          await client
            .from("ai_action_log")
            .delete()
            .eq("target_page_id", target)
        ).error
      ).not.toBeNull()
    }
    const rows = await service
      .from("ai_action_log")
      .select("id")
      .eq("target_page_id", target)
    expect(rows.data).toHaveLength(3)
  })
})
