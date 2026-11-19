import { beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => ({
  active: null as null | {
    question: string
    intent: "hub" | "page" | "other"
    covered: boolean
    related: boolean
    source: { title: string; url: string; snippet: string }
  },
  fallback: false,
}))

const provider = vi.hoisted(() => ({
  getChatModel: () => "fixture-chat",
  getFormatModel: () => "fixture-format",
  createEmbeddingsWithOpenAI: vi.fn(async () => [[0.1, 0.2]]),
  createChatResponseWithOpenAI: vi.fn(async () => ({
    output_text: fixture.active!.source.snippet,
  })),
  streamMiloResponse: vi.fn(),
  createAgentResponseWithOpenAI: vi.fn(
    async (params: { text?: { format?: { name?: string } } }) => {
      const active = fixture.active!
      if (params.text?.format?.name === "milo_intent")
        return {
          output_text: JSON.stringify({ intent: active.intent }),
          output: [],
        }
      if (params.text?.format?.name === "milo_evidence")
        return {
          output_text: JSON.stringify({
            covered: active.covered,
            related: active.related ? [0] : [],
          }),
          output: [],
        }
      if (fixture.fallback) throw new Error("Agent unavailable")
      return { output_text: active.source.snippet, output: [] }
    }
  ),
}))
vi.mock("@/lib/ai/provider", () => provider)
vi.mock("@/lib/wiki-knowledge-urls", () => ({
  resolveWikiKnowledgeRows: async (_: unknown, rows: unknown[]) => rows,
}))
vi.mock("@/lib/hub-data", () => ({
  fetchEmployeeDirectoryRows: async () => [],
  fetchBranchesDirectoryRows: async () => [],
}))
vi.mock("@/lib/support-directory-data", () => ({
  fetchSupportDirectoryData: async () => ({
    generalHelpSection: null,
    rushSections: [],
    departments: [],
  }),
}))
const mcp = vi.hoisted(() => ({
  MILO_MCP_TOOLS: [
    { name: "knowledge_search", description: "Search knowledge" },
  ],
  callMiloMcpTool: vi.fn(async (name: string, args: { query?: string }) => {
    const active = fixture.active!
    const found =
      name === "knowledge_search" &&
      (active.intent === "other" ||
        args.query?.toLowerCase().includes("canopy hub"))
    return {
      ok: true,
      toolName: name,
      content: {},
      sources: found
        ? [
            {
              ...active.source,
              sourceType: "wiki_page",
              knowledgeSourceId: "source",
              knowledgeChunkId: "chunk",
            },
          ]
        : [],
    }
  }),
}))
vi.mock("@/lib/milo/mcp/tools", () => mcp)

import { answerKnowledgeQuestion } from "@/lib/wiki-ai"
import { hasRetrievalConfidence } from "@/lib/milo/evidence"

const hub = {
  title: "Getting Started",
  url: "/wiki/hub/getting-started",
  snippet:
    "Canopy Hub is Canopy Mortgage's internal home for employee resources.",
}
const home = {
  title: "Home Dashboard",
  url: "/wiki/hub/home",
  snippet: "The Home dashboard shows production summaries and quick links.",
}
const feedback = {
  title: "Settings and Feedback",
  url: "/wiki/hub/feedback",
  snippet: "Send feedback from the feedback button in the sidebar.",
}
const publishing = {
  title: "Writing and Publishing",
  url: "/wiki/hub/publishing",
  snippet: "Publish a wiki page by choosing Published and saving it.",
}
const wiki = {
  title: "Closing Checklist",
  url: "/wiki/closing",
  snippet: "Review the closing checklist before funding.",
}
const unrelated = {
  title: "Getting Started",
  url: "/wiki/hub/getting-started",
  snippet: "Canopy Hub provides employee resources.",
}
const partial = {
  title: "Benefits",
  url: "/wiki/benefits",
  snippet: "Our 401k plan information is available through HR.",
}
const cases = [
  {
    question: "tell me about this website",
    intent: "hub",
    source: hub,
    covered: true,
    related: true,
  },
  {
    question: "what is this site",
    intent: "hub",
    source: hub,
    covered: true,
    related: true,
  },
  {
    question: "what can I do here",
    intent: "hub",
    source: hub,
    covered: true,
    related: true,
  },
  {
    question: "what's this tool for",
    intent: "hub",
    source: hub,
    covered: true,
    related: true,
  },
  {
    question: "where am I",
    intent: "hub",
    source: hub,
    covered: true,
    related: true,
  },
  {
    question: "what is this page about",
    intent: "page",
    source: home,
    covered: true,
    related: true,
  },
  {
    question: "how do I send feedback",
    intent: "hub",
    source: feedback,
    covered: true,
    related: true,
  },
  {
    question: "how do I publish a wiki page",
    intent: "hub",
    source: publishing,
    covered: true,
    related: true,
  },
  {
    question: "what should I review before funding",
    intent: "other",
    source: wiki,
    covered: true,
    related: true,
  },
  {
    question: "what is the CEO's favorite color",
    intent: "other",
    source: unrelated,
    covered: false,
    related: false,
  },
  {
    question: "what is our 401k match",
    intent: "other",
    source: partial,
    covered: false,
    related: true,
  },
] as const

const userContext = {
  capabilities: {
    "beta.1": true,
    "wiki.manage": false,
    "settings.access": false,
    "permissions.access": false,
    "advanced-settings.access": false,
    "ai.settings.access": false,
  },
  wikiManagers: null,
  role: "employee",
}
const pageContext = { title: "Home", url: "/home" }

describe("Milo grounding eval: scripted provider and retrieval fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.fallback = false
  })

  for (const mode of ["agent", "fallback"] as const) {
    it.each(cases)(`${mode}: $question`, async (item) => {
      fixture.active = item
      fixture.fallback = mode === "fallback"
      const searches: string[] = []
      const rpc = vi.fn(
        async (name: string, args?: { search_query?: string }) => {
          if (name === "match_knowledge_chunks_keyword")
            searches.push(args?.search_query ?? "")
          if (name.startsWith("match_knowledge_chunks")) {
            const found =
              item.intent === "other" ||
              searches.some((q) => q.toLowerCase().includes("canopy hub"))
            return {
              data: found
                ? [
                    {
                      chunk_id: "chunk",
                      source_id: "source",
                      source_type: "wiki_page",
                      source_title: item.source.title,
                      source_url: item.source.url,
                      content: item.source.snippet,
                      metadata: {},
                      similarity: 0.9,
                    },
                  ]
                : [],
              error: null,
            }
          }
          return { data: null, error: null }
        }
      )
      const answer = await answerKnowledgeQuestion({
        question: item.question,
        supabase: { rpc } as never,
        userContext,
        pageContext,
      })
      expect(answer.metadata?.abstained).toBe(!item.covered)
      if (item.covered) {
        expect(answer.answer).not.toMatch(
          /couldn't find|could not be verified/i
        )
        expect(answer.citations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ url: item.source.url }),
          ])
        )
      } else {
        expect(answer.answer).toContain("couldn't find an answer")
        expect(answer.citations).toHaveLength(item.related ? 1 : 0)
        if (item.related)
          expect(answer.answer).toContain("related pages may help")
      }
      if (item.intent !== "other") {
        const queries =
          mode === "agent"
            ? mcp.callMiloMcpTool.mock.calls.map((call) => call[1]?.query ?? "")
            : searches
        expect(
          queries.some((query) => query.toLowerCase().includes("canopy hub"))
        ).toBe(true)
      }
      const requests = provider.createAgentResponseWithOpenAI.mock.calls.map(
        (call) => call[0]
      )
      const evidenceRequest = requests.find(
        (request) => request.text?.format?.name === "milo_evidence"
      ) as unknown as { input: string }
      expect(JSON.parse(evidenceRequest.input).currentPage).toEqual(pageContext)
    })
  }

  it("reports an assessment failure without claiming the wiki lacks an answer", async () => {
    const { assessMiloEvidence } = await import("@/lib/milo/grounding")
    provider.createAgentResponseWithOpenAI.mockRejectedValueOnce(
      new Error("offline")
    )
    await expect(
      assessMiloEvidence("What is the 401k match?", [], [partial])
    ).resolves.toEqual({
      covered: false,
      related: [],
      unavailable: true,
    })
  })

  it("records the old lexical gate's baseline on the same fixtures", () => {
    const oldCovered = cases.filter((item) =>
      hasRetrievalConfidence(item.question, [
        { ...item.source, sourceType: "wiki_page" },
      ])
    ).length
    expect(oldCovered).toBe(4)
    expect(hasRetrievalConfidence(cases[10].question, [cases[10].source])).toBe(
      true
    )
  })
})
