import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: "user" as string | null,
  allowed: true,
  rows: new Set<string>(),
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user } : null },
      }),
    },
    from: () => ({
      upsert: async (row: {
        node_id: string
        other_node_id: string
        passage_hash: string
      }) => {
        state.rows.add(
          `${row.node_id}:${row.other_node_id}:${row.passage_hash}`
        )
        return { error: null }
      },
      delete: () => {
        const values: string[] = []
        const query = {
          eq: (_key: string, value: string) => {
            values.push(value)
            if (values.length === 3) {
              state.rows.delete(values.join(":"))
              return Promise.resolve({ error: null })
            }
            return query
          },
        }
        return query
      },
    }),
  }),
}))
import { DELETE, POST } from "@/app/api/wiki/duplicates/dismissals/route"

const body = {
  nodeId: "10000000-0000-4000-8000-000000000001",
  otherNodeId: "10000000-0000-4000-8000-000000000002",
  passageHash: "a".repeat(64),
}
const request = (data: unknown = body) =>
  new Request("http://localhost/api/wiki/duplicates/dismissals", {
    method: "POST",
    body: JSON.stringify(data),
  })

beforeEach(() => {
  state.user = "user"
  state.allowed = true
  state.rows.clear()
})
describe("duplicate dismissals API", () => {
  it("requires a signed-in manager and validates input", async () => {
    state.user = null
    expect((await POST(request())).status).toBe(401)
    state.user = "viewer"
    state.allowed = false
    expect((await POST(request())).status).toBe(403)
    expect((await DELETE(request())).status).toBe(403)
    state.allowed = true
    expect(
      (await POST(request({ ...body, passageHash: "invalid" }))).status
    ).toBe(400)
    expect(
      (await POST(request({ ...body, otherNodeId: body.nodeId }))).status
    ).toBe(400)
  })
  it("dismisses idempotently and undoes the dismissal", async () => {
    expect((await POST(request())).status).toBe(200)
    expect((await POST(request())).status).toBe(200)
    expect(state.rows.size).toBe(1)
    expect((await DELETE(request())).status).toBe(200)
    expect(state.rows.size).toBe(0)
  })
})
