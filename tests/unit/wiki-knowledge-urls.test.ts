import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/wiki", async (original) => ({
  ...(await original<typeof import("@/lib/wiki")>()),
  fetchWikiNodes: async () => [
    { id: "root", parent_id: null, short_id: 1, type: "folder" },
    { id: "new-parent", parent_id: "root", short_id: 9, type: "folder" },
    { id: "page", parent_id: "new-parent", short_id: 22, type: "page" },
    { id: "orphan", parent_id: "missing", short_id: 23, type: "page" },
  ],
}))

import { resolveWikiKnowledgeRows } from "@/lib/wiki-knowledge-urls"

describe("Wiki knowledge URLs", () => {
  it("resolves old page and asset records after a move and omits missing sources or ancestry", async () => {
    const sources = [
      { id: "page-source", source_type: "wiki_page", source_id: "page" },
      { id: "asset-source", source_type: "wiki_asset", source_id: "asset" },
      { id: "orphan-source", source_type: "wiki_page", source_id: "orphan" },
    ]
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          in: async () => ({
            data:
              table === "knowledge_sources"
                ? sources
                : [{ id: "asset", node_id: "page" }],
            error: null,
          }),
        }),
      }),
    }
    const rows = [
      {
        source_id: "page-source",
        source_type: "wiki_page",
        source_url: "/wiki/old/page",
        metadata: { path: "old/page" },
      },
      {
        source_id: "asset-source",
        source_type: "wiki_asset",
        source_url: "/wiki/1/2/22",
        metadata: { pagePath: "1/2/22" },
      },
      {
        source_id: "orphan-source",
        source_type: "wiki_page",
        source_url: "/wiki/old/orphan",
        metadata: {},
      },
      {
        source_id: "denied-source",
        source_type: "wiki_page",
        source_url: "/wiki/old/denied",
        metadata: {},
      },
      {
        source_id: "report",
        source_type: "report",
        source_url: "/reports",
        metadata: {},
      },
    ]
    expect(await resolveWikiKnowledgeRows(supabase as never, rows)).toEqual([
      { ...rows[0], source_url: "/wiki/1/9/22", metadata: { path: "1/9/22" } },
      {
        ...rows[1],
        source_url: "/wiki/1/9/22",
        metadata: { pagePath: "1/9/22" },
      },
      rows[4],
    ])
  })
})
