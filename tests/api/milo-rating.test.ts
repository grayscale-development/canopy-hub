import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  allowed: true,
  error: null as { message: string } | null,
  writes: [] as unknown[],
}))

vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      upsert: async (row: unknown) => {
        state.writes.push(row)
        return { error: state.error }
      },
    }),
  }),
}))

import { POST } from "@/app/api/wiki/chat/rating/route"

const request = (body: unknown) =>
  new Request("http://localhost/api/wiki/chat/rating", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("Milo answer ratings", () => {
  beforeEach(() => {
    state.user = { id: "owner" }
    state.allowed = true
    state.error = null
    state.writes = []
  })
  it("requires an authenticated, permitted user", async () => {
    state.user = null
    expect((await POST(request({}))).status).toBe(401)
    state.user = { id: "owner" }
    state.allowed = false
    expect((await POST(request({}))).status).toBe(403)
    expect(state.writes).toEqual([])
  })
  it("accepts only valid ratings and uses the authenticated identity", async () => {
    expect(
      (await POST(request({ assistantMessageId: "answer", rating: "other" })))
        .status
    ).toBe(400)
    expect(
      (
        await POST(
          request({
            assistantMessageId: "answer",
            rating: "down",
            userId: "someone-else",
          })
        )
      ).status
    ).toBe(200)
    expect(state.writes).toEqual([
      { assistant_message_id: "answer", user_id: "owner", rating: "down" },
    ])
    state.error = { message: "row-level security" }
    expect(
      (
        await POST(
          request({ assistantMessageId: "another-answer", rating: "up" })
        )
      ).status
    ).toBe(400)
  })
})
