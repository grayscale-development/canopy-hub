import { readFileSync } from "node:fs"
import { beforeEach, expect, it, vi } from "vitest"
import type { SupabaseWikiClient } from "@/lib/wiki"
import { buildWikiPlainDiff } from "@/lib/wiki-diff"
import { prepareMiloProposal } from "@/lib/milo/proposed-edit"

const model = vi.hoisted(() => ({
  output: "",
  fail: false,
  prompts: [] as string[],
}))
vi.mock("@/lib/ai/provider", () => ({
  getWikiImportModel: () => "fake-chat",
  createAgentResponseWithOpenAI: async ({ input }: { input: string }) => {
    model.prompts.push(input)
    if (model.fail) throw new Error("timeout")
    return { output_text: model.output }
  },
}))
vi.mock("@/lib/milo/find-page", () => ({ isEditablePage: async () => true }))

const fact = "The escalation desk now closes at 5 p.m. Mountain time."
const extraction = {
  facts: [fact],
  chatter: "Greeting and signature",
  unclear: [],
  source: {
    sender: "Jordan Example",
    date: "June 12, 2026",
    subject: "Escalation hours",
  },
}
const before = "The escalation desk now closes at 4 p.m. Mountain time."
const blocks = [
  { type: "paragraph", content: before },
  { type: "image", props: { url: "/api/wiki/assets/1" } },
]
let includeImage = true
const writes: unknown[] = []
const supabase = {
  from(table: string) {
    const filters: Record<string, string> = {}
    return {
      select() {
        return this
      },
      eq(key: string, value: string) {
        filters[key] = value
        return this
      },
      async maybeSingle() {
        if (table === "wiki_nodes")
          return {
            data: {
              id: "page",
              title: "Escalation",
              current_revision_id: "newer",
            },
            error: null,
          }
        if (
          table === "wiki_page_revisions" &&
          filters.id === "base" &&
          filters.node_id === "page"
        )
          return {
            data: {
              id: "base",
              node_id: "page",
              blocks: includeImage ? blocks : [blocks[0]],
              plain_text: before,
            },
            error: null,
          }
        return { data: null, error: null }
      },
      insert(value: unknown) {
        writes.push(value)
      },
      update(value: unknown) {
        writes.push(value)
      },
    }
  },
} as unknown as SupabaseWikiClient

beforeEach(() => {
  model.output = JSON.stringify({
    title: "Escalation",
    tags: [],
    markdown: `# Escalation\n\n${before}\n\n${fact}`,
  })
  model.fail = false
  model.prompts = []
  writes.length = 0
  includeImage = true
})

it("uses the update provider and preserves the base and complex blocks", async () => {
  expect(
    readFileSync("tests/fixtures/milo/operations-thread.txt", "utf8")
  ).toContain(fact)
  const { card } = await prepareMiloProposal({
    supabase,
    pageId: "page",
    extraction,
    baseRevisionId: "base",
    feedback: ["Keep the old phone number too"],
  })
  expect(card.baseRevisionId).toBe("base")
  expect(card.changeNote).toBe(
    "Updated from email thread from Jordan Example, June 12, 2026"
  )
  expect(card.blocks).toContainEqual(blocks[1])
  expect(card.nonTextNotes?.join(" ")).toContain("picture")
  expect(card.after).toContain(fact)
  expect(model.prompts[0]).toContain("Keep the old phone number too")
  expect(writes).toEqual([])
  expect(buildWikiPlainDiff(card.before, card.after)).toMatchSnapshot()
})

it.each(["timeout", "malformed", "invalid schema"])(
  "keeps the original page and facts on %s",
  async (failure) => {
    model.fail = failure === "timeout"
    model.output =
      failure === "malformed"
        ? "not json"
        : JSON.stringify({ markdown: "partial" })
    const { card } = await prepareMiloProposal({
      supabase,
      pageId: "page",
      extraction,
      baseRevisionId: "base",
    })
    expect(card.after).toContain(before)
    expect(card.after).toContain(fact)
    expect(card.blocks).toContainEqual(blocks[1])
    expect(card.notAdded).toEqual([])
    expect(writes).toEqual([])
  }
)

it("rejects an unavailable base revision", async () => {
  await expect(
    prepareMiloProposal({
      supabase,
      pageId: "page",
      extraction,
      baseRevisionId: "missing",
    })
  ).rejects.toThrow("Base revision")
})

it("proposes a source-grounded replacement on a text-only page", async () => {
  includeImage = false
  model.output = JSON.stringify({
    title: "Escalation",
    tags: [],
    markdown: `# Escalation\n\n${fact}`,
  })
  const { card } = await prepareMiloProposal({
    supabase,
    pageId: "page",
    extraction,
    baseRevisionId: "base",
  })
  expect(card.after).toContain(fact)
  expect(card.after).not.toContain("4 p.m.")
  expect(buildWikiPlainDiff(card.before, card.after)).toMatchSnapshot()
})

it("lists a fact that the model did not place in the page body", async () => {
  includeImage = false
  model.output = JSON.stringify({
    title: fact,
    tags: [],
    markdown: `# ${fact}\n\n${before}`,
  })
  const { card } = await prepareMiloProposal({
    supabase,
    pageId: "page",
    extraction,
    baseRevisionId: "base",
  })
  expect(card.notAdded).toEqual([fact])
  expect(card.summary).toContain("couldn't place")
})

it("tells the user when a requested adjustment could not be applied", async () => {
  model.fail = true
  const { card } = await prepareMiloProposal({
    supabase,
    pageId: "page",
    extraction,
    baseRevisionId: "base",
    feedback: ["Keep the old phone number too"],
  })
  expect(card.summary).toContain("couldn't make that adjustment safely")
  expect(card.after).toContain(before)
  expect(card.after).toContain(fact)
})
