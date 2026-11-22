import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  allowed: true,
  limited: false,
  calls: [] as { name: string; args: Record<string, unknown> }[],
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => state.allowed,
}))
vi.mock("@/lib/wiki-ai", async () => {
  const provider = await import("@/lib/ai/provider")
  return { embedTexts: provider.createEmbeddingsWithOpenAI }
})
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "manager" } } }) },
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      state.calls.push({ name, args })
      if (name === "consume_wiki_tag_suggestion_rate")
        return { data: !state.limited, error: null }
      if (name === "match_wiki_tags")
        return {
          data: [
            {
              id: "g",
              name: "Mortgage insurance",
              scope: "global",
              section_id: null,
              section_name: null,
            },
          ],
          error: null,
        }
      return { data: null, error: null }
    },
    from: (table: string) => ({
      select: () =>
        table === "wiki_tags"
          ? Promise.resolve({
              data: [
                {
                  id: "visible",
                  name: "Closings",
                  scope: "section",
                  section_id: "visible-section",
                },
                {
                  id: "hidden",
                  name: "Closings",
                  scope: "section",
                  section_id: "hidden-section",
                },
              ],
              error: null,
            })
          : {
              in: async () => ({
                data: [{ id: "visible-section", title: "Operations" }],
                error: null,
              }),
            },
    }),
  }),
}))
import { POST } from "@/app/api/wiki/tag-suggestions/route"

const request = (body: unknown) =>
  new Request("http://localhost/api/wiki/tag-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  state.allowed = true
  state.limited = false
  state.calls = []
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "fake-embedding")
})
afterEach(() => vi.unstubAllEnvs())

describe("tag suggestions", () => {
  it("uses a fake query embedding and excludes invisible sections", async () => {
    const response = await POST(request({ name: "Closing", sectionId: null }))
    const data = await response.json()
    expect(data.results).toEqual([
      expect.objectContaining({
        id: "visible",
        section_name: "Operations",
        reason: "plural of",
      }),
      expect.objectContaining({ id: "g", reason: "similar meaning" }),
    ])
    const call = state.calls.find((item) => item.name === "match_wiki_tags")!
    expect(call.args.query_embedding).toHaveLength(1536)
    expect(call.args.match_threshold).toBe(0.8)
  })
  it("degrades to lexical matches without a model", async () => {
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "")
    const data = await (
      await POST(request({ name: "Closing", sectionId: null }))
    ).json()
    expect(data.results).toHaveLength(1)
    expect(state.calls.some((call) => call.name === "match_wiki_tags")).toBe(
      false
    )
  })
  it("requires manager access and observes the request limit", async () => {
    state.allowed = false
    expect(
      (await POST(request({ name: "Closing", sectionId: null }))).status
    ).toBe(403)
    state.allowed = true
    state.limited = true
    expect(
      (await (await POST(request({ name: "Closing", sectionId: null }))).json())
        .results
    ).toEqual([])
  })
})
