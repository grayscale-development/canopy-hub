import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  row: null as { milo_corner: string } | null,
  error: null as object | null,
  writes: [] as unknown[],
  selectedId: "",
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: (_key: string, id: string) => {
          state.selectedId = id
          return {
            maybeSingle: async () => ({ data: state.row, error: state.error }),
          }
        },
      }),
      upsert: async (row: unknown) => {
        state.writes.push(row)
        return { error: state.error }
      },
    }),
  }),
}))
import { GET, PUT } from "@/app/api/milo/preferences/route"
const request = (body: unknown) =>
  new Request("http://localhost/api/milo/preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("Milo preferences", () => {
  beforeEach(() => {
    state.user = { id: "owner" }
    state.row = null
    state.error = null
    state.writes = []
    state.selectedId = ""
  })
  it("requires authentication for reads and writes", async () => {
    state.user = null
    expect((await GET()).status).toBe(401)
    expect((await PUT(request({ corner: "top-left" }))).status).toBe(401)
    expect(state.writes).toEqual([])
  })
  it("returns the default or the signed-in user's saved value", async () => {
    expect(await (await GET()).json()).toEqual({ corner: "bottom-right" })
    expect(state.selectedId).toBe("owner")
    state.row = { milo_corner: "top-left" }
    expect(await (await GET()).json()).toEqual({ corner: "top-left" })
    state.error = {}
    expect((await GET()).status).toBe(500)
  })
  it("validates input and writes only for the authenticated user", async () => {
    expect((await PUT(request({ corner: "middle" }))).status).toBe(400)
    expect(
      (await PUT(request({ corner: "top-right", user_id: "other" }))).status
    ).toBe(200)
    expect(state.writes).toEqual([
      { user_id: "owner", milo_corner: "top-right" },
    ])
    state.error = {}
    expect((await PUT(request({ corner: "bottom-left" }))).status).toBe(500)
  })
})
