import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  user: { id: "manager" } as { id: string } | null,
  writes: [] as Array<{ change: unknown; id: string }>,
}))

vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async ({ code }: { code: string }) =>
    state.permissions.has(code),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      update: (change: unknown) => ({
        eq: (_column: string, id: string) => ({
          eq: async (column: string, value: boolean) => {
            if (column !== "acknowledged" || value !== true)
              throw new Error("Flags must be explicitly shared")
            state.writes.push({ change, id })
            return { error: null }
          },
        }),
      }),
    }),
  }),
}))

import { PATCH } from "@/app/api/settings/milo-flags/[flagId]/route"

const request = (body: unknown) =>
  new Request("http://localhost/api/settings/milo-flags/item", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
const params = { params: Promise.resolve({ flagId: "item" }) }

describe("Milo feedback queue", () => {
  beforeEach(() => {
    state.user = { id: "manager" }
    state.permissions = new Set([
      "settings.access",
      "ai.settings.access",
      "beta.1",
      "wiki.manage",
    ])
    state.writes = []
  })
  it("requires every manager permission before using the privileged client", async () => {
    for (const permission of [...state.permissions]) {
      state.permissions.delete(permission)
      expect((await PATCH(request({ status: "closed" }), params)).status).toBe(
        403
      )
      state.permissions.add(permission)
    }
    state.user = null
    expect((await PATCH(request({ status: "closed" }), params)).status).toBe(
      401
    )
    expect(state.writes).toEqual([])
  })
  it("allows resolution and eval markers but rejects invalid changes", async () => {
    expect((await PATCH(request({ status: "closed" }), params)).status).toBe(
      200
    )
    expect(
      (await PATCH(request({ addedToEvalSet: true }), params)).status
    ).toBe(200)
    expect((await PATCH(request({ status: "invalid" }), params)).status).toBe(
      400
    )
    expect(
      (await PATCH(request({ addedToEvalSet: "yes" }), params)).status
    ).toBe(400)
    expect(state.writes).toEqual([
      { change: { status: "closed" }, id: "item" },
      { change: { added_to_eval_set: true }, id: "item" },
    ])
  })
})
