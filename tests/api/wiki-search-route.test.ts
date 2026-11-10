import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ canAccess: true }))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.canAccess,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => ({
      select: () =>
        table === "wiki_tags"
          ? {
              ilike: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "g",
                      name: "Closing",
                      scope: "global",
                      section_id: null,
                    },
                    {
                      id: "s",
                      name: "Closing",
                      scope: "section",
                      section_id: "visible",
                    },
                    {
                      id: "h",
                      name: "Closing hidden",
                      scope: "section",
                      section_id: "hidden",
                    },
                  ],
                }),
              }),
            }
          : {
              in: async () => ({
                data: [{ id: "visible", title: "Operations" }],
                error: null,
              }),
            },
    }),
  }),
}))
import { GET } from "@/app/api/wiki/search/route"

describe("wiki tag search", () => {
  it("labels levels, links to the correct section, and hides inaccessible sections", async () => {
    state.canAccess = true
    const response = await GET(
      new NextRequest("http://localhost/api/wiki/search?q=closing")
    )
    expect((await response.json()).results).toEqual([
      expect.objectContaining({
        title: "Closing",
        snippet: "Global",
        url: "/wiki/tags?tag=Closing#tag-closing",
      }),
      expect.objectContaining({
        title: "Closing",
        snippet: "Operations",
        url: "/wiki/tags?tag=Closing&section=visible#tag-closing-visible",
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
