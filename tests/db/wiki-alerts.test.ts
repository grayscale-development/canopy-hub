import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("wiki alerts RLS", { timeout: 60_000 }, () => {
  let service: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  const pages = Array.from({ length: 8 }, () => randomUUID())
  const fixture = randomUUID()

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) {
      throw new Error("Local Supabase required")
    }
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const signIn = async (email: string) => {
      const client = createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { persistSession: false },
        }
      )
      const { error } = await client.auth.signInWithPassword({
        email,
        password: "canopy-test-password",
      })
      if (error) throw error
      return client
    }
    manager = await signIn("wiki-manager@canopy.test")
    viewer = await signIn("standard@canopy.test")
    const { error } = await service.from("wiki_nodes").insert(
      pages.map((id, index) => ({
        id,
        type: "page",
        slug: `alerts-${fixture}-${index}`,
        title: `Alerts ${fixture} ${index}`,
        status: "published",
      }))
    )
    if (error) throw error
  })

  afterAll(async () => {
    if (service) {
      const { error } = await service
        .from("wiki_nodes")
        .delete()
        .in("id", pages)
      if (error) throw error
    }
  })

  it("allows service inserts and managers to read, dismiss and apply", async () => {
    const rows = [0, 2].map((index) => ({
      page_id: pages[index],
      other_page_id: pages[index + 1],
      page_hash: `hash-${index}`,
      other_page_hash: `other-hash-${index}`,
      recommendation: { action: "merge" },
    }))
    const inserted = await service.from("wiki_alerts").insert(rows).select()
    expect(inserted.error).toBeNull()
    expect(inserted.data).toHaveLength(2)
    const ids = inserted.data!.map((row) => row.id)

    const read = await manager.from("wiki_alerts").select("*").in("id", ids)
    expect(read.error).toBeNull()
    expect(read.data).toHaveLength(2)

    const managerId = (await manager.auth.getUser()).data.user!.id
    const timestamp = new Date().toISOString()
    const dismissed = await manager
      .from("wiki_alerts")
      .update({
        status: "dismissed",
        dismissed_by: managerId,
        dismissed_at: timestamp,
      })
      .eq("id", ids[0])
      .select()
      .single()
    expect(dismissed.error).toBeNull()
    expect(dismissed.data).toMatchObject({
      status: "dismissed",
      dismissed_by: managerId,
    })
    expect(new Date(dismissed.data!.dismissed_at).toISOString()).toBe(timestamp)
    const applied = await manager
      .from("wiki_alerts")
      .update({
        status: "applied",
        applied_by: managerId,
        applied_at: timestamp,
      })
      .eq("id", ids[1])
      .select()
      .single()
    expect(applied.error).toBeNull()
    expect(applied.data).toMatchObject({
      status: "applied",
      applied_by: managerId,
    })
    expect(new Date(applied.data!.applied_at).toISOString()).toBe(timestamp)

    for (const update of [
      { page_id: pages[4] },
      { other_page_id: pages[4] },
      { page_hash: "changed" },
      { recommendation: { action: "changed" } },
      { created_by: managerId },
      { updated_at: timestamp },
    ]) {
      const result = await manager
        .from("wiki_alerts")
        .update(update)
        .eq("id", ids[0])
      expect(result.error).not.toBeNull()
    }
  })

  it("denies viewers and denies authenticated scan inserts", async () => {
    const row = { page_id: pages[4], other_page_id: pages[5] }
    const inserted = await service
      .from("wiki_alerts")
      .insert(row)
      .select("id")
      .single()
    expect(inserted.error).toBeNull()
    const id = inserted.data!.id

    for (const client of [viewer, manager]) {
      expect(
        (await client.from("wiki_alerts").insert(row)).error
      ).not.toBeNull()
    }
    const read = await viewer.from("wiki_alerts").select("id").eq("id", id)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([])
    const update = await viewer
      .from("wiki_alerts")
      .update({ status: "dismissed" })
      .eq("id", id)
      .select()
    expect(update.error).toBeNull()
    expect(update.data).toEqual([])
    expect(
      (await viewer.from("wiki_alerts").delete().eq("id", id)).error
    ).not.toBeNull()
    const unchanged = await service
      .from("wiki_alerts")
      .select("status")
      .eq("id", id)
      .single()
    expect(unchanged.data).toEqual({ status: "open" })

    for (const client of [viewer, manager]) {
      expect(
        (await client.from("wiki_alert_scan_state").select()).error
      ).not.toBeNull()
      expect(
        (await client.from("wiki_alert_scan_state").upsert({ singleton: true }))
          .error
      ).not.toBeNull()
    }
    expect(
      (await service.from("wiki_alert_scan_state").select()).error
    ).toBeNull()
  })

  it("enforces unordered open-pair uniqueness while retaining closed history", async () => {
    const row = { page_id: pages[6], other_page_id: pages[7] }
    const first = await service
      .from("wiki_alerts")
      .insert({ ...row, status: "dismissed" })
      .select("id")
      .single()
    expect(first.error).toBeNull()
    const open = await service
      .from("wiki_alerts")
      .insert(row)
      .select("id")
      .single()
    expect(open.error).toBeNull()
    const reversed = await service
      .from("wiki_alerts")
      .insert({ page_id: row.other_page_id, other_page_id: row.page_id })
    expect(reversed.error?.code).toBe("23505")
    expect(
      (
        await service
          .from("wiki_alerts")
          .insert({ ...row, page_id: row.other_page_id })
      ).error
    ).not.toBeNull()
  })
})
