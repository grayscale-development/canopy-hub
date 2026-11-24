import { beforeEach, describe, expect, it, vi } from "vitest"

const id = "8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9"
const actor = "3c36b484-8e17-4e9c-b7a0-17da6a477c25"

const state = vi.hoisted(() => ({
  current: { status: "open" } as { status: string } | null,
  writes: [] as Array<{ table: string; change: unknown; id: string }>,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.current, error: null }),
        }),
      }),
      update: (change: unknown) => ({
        eq: async (_column: string, id: string) => {
          state.writes.push({ table, change, id })
          return { error: null }
        },
      }),
    }),
  }),
}))

import { POST } from "@/app/api/internal/feedback/sync/route"

function request(body: unknown, token = "test-token") {
  return new Request("http://localhost/api/internal/feedback/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

describe("feedback sync route", () => {
  beforeEach(() => {
    process.env.FEEDBACK_SYNC_SECRET = "test-token"
    process.env.FEEDBACK_SYNC_ACTOR_ID = actor
    state.current = { status: "open" }
    state.writes = []
  })

  it("rejects unauthorized requests without changing feedback", async () => {
    expect(
      (await POST(request({ kind: "item", id, status: "resolved" }, "wrong")))
        .status
    ).toBe(401)
    expect(state.writes).toEqual([])
  })

  it("fails closed when its secret is not configured", async () => {
    delete process.env.FEEDBACK_SYNC_SECRET
    expect(
      (await POST(request({ kind: "item", id, status: "resolved" }))).status
    ).toBe(401)
    expect(state.writes).toEqual([])
  })

  it("applies an authorized resolved transition", async () => {
    expect(
      (await POST(request({ kind: "item", id, status: "resolved" }))).status
    ).toBe(200)
    expect(state.writes).toEqual([
      expect.objectContaining({
        table: "feedback_items",
        id,
        change: expect.objectContaining({
          status: "resolved",
          resolved_by: actor,
        }),
      }),
    ])
  })

  it("does not overwrite an already verified item", async () => {
    state.current = { status: "verified" }
    const response = await POST(
      request({ kind: "item", id, status: "resolved" })
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ skipped: true })
    expect(state.writes).toEqual([])
  })
})
