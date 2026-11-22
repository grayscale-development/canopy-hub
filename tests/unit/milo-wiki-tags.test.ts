import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => true,
}))
import { callMiloMcpTool } from "@/lib/milo/mcp/tools"

describe("Milo wiki tag search", () => {
  it("accepts scoped catalog rows while retaining name-based links and accessible pages", async () => {
    const select = vi.fn()
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
      from: (table: string) => ({
        select: (columns: string) => {
          select(table, columns)
          if (table === "wiki_tags")
            return {
              order: async () => ({
                data: [
                  {
                    id: "tag",
                    name: "Closing Guide",
                    scope: "section",
                    section_id: "folder",
                  },
                ],
                error: null,
              }),
            }
          if (table === "wiki_page_tags")
            return {
              in: async () => ({
                data: [{ tag_id: "tag", node_id: "page" }],
                error: null,
              }),
            }
          return {
            in: async () => ({
              data:
                table === "milo_wiki_nodes" && columns === "id,title"
                  ? [
                      { id: "folder", title: "Operations" },
                      { id: "page", title: "Checklist" },
                    ]
                  : [],
              error: null,
            }),
          }
        },
      }),
    }
    const result = await callMiloMcpTool(
      "wiki_tag_search",
      { query: "closing" },
      client as never
    )
    expect(select).toHaveBeenCalledWith("wiki_tags", "id,name,scope,section_id")
    expect(result).toMatchObject({
      ok: true,
      content: {
        matches: [
          {
            tag: "Closing Guide",
            scope: "section",
            section: "Operations",
            url: "/wiki/tags?tag=Closing%20Guide&section=folder#tag-closing-guide-folder",
            pages: ["Checklist"],
          },
        ],
      },
    })
  })
})
