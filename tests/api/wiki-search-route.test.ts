import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ canAccess: true, select: vi.fn() }))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.canAccess,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
    rpc: async () => ({ data: [], error: null }),
    from: () => ({
      select: (columns: string) => {
        state.select(columns)
        return {
          ilike: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    id: "tag-id",
                    name: "Closing Guide",
                    scope: "global",
                    section_id: null,
                  },
                ],
              }),
            }),
          }),
        }
      },
    }),
  }),
}))

import { GET } from "@/app/api/wiki/search/route"

describe("wiki tag search", () => {
  it("keeps name-based deep links when the catalog returns scoped columns", async () => {
    state.canAccess = true
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=closing")
    )
    expect(state.select).toHaveBeenCalledWith("id,name,scope,section_id")
    expect((await response.json()).results).toEqual([
      expect.objectContaining({
        title: "Closing Guide",
        url: "/wiki/tags?tag=Closing%20Guide#tag-closing-guide",
      }),
    ])
  })
  it("does not expose wiki tags without wiki access", async () => {
    state.canAccess = false
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=closing")
    )
    expect((await response.json()).results).toEqual([])
  })
})
