import { beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => ({
  active: null as null | {
    question: string
    intent:
      | "hub"
      | "page"
      | "other"
      | "navigation"
      | "identity"
      | "hub_context"
      | "page_context"
    covered: boolean
    related: boolean
    source: { title: string; url: string; snippet: string }
    sourceType?: string
    answer?: string
    answerSupported?: boolean
    extraChunk?: string
    toolContent?: unknown
    vectorSimilarity?: number
    multipleChunks?: boolean
    coverage?: "covered" | "partial" | "not_covered"
  },
  fallback: false,
}))

const provider = vi.hoisted(() => ({
  getChatModel: () => "fixture-chat",
  getFormatModel: vi.fn(() => "fixture-format"),
  createEmbeddingsWithOpenAI: vi.fn(async () => [[0.1, 0.2]]),
  createChatResponseWithOpenAI: vi.fn(async () => ({
    output_text: fixture.active!.answer ?? fixture.active!.source.snippet,
  })),
  streamMiloResponse: vi.fn(
    async (
      _params: unknown,
      onToken: (token: string) => void,
      signal?: AbortSignal
    ) => {
      signal?.throwIfAborted()
      const answer = fixture.active!.answer ?? fixture.active!.source.snippet
      const midpoint = Math.ceil(answer.length / 2)
      onToken(answer.slice(0, midpoint))
      onToken(answer.slice(midpoint))
      return { output_text: answer, output: [] }
    }
  ),
  createAgentResponseWithOpenAI: vi.fn(
    async (
      params: { text?: { format?: { name?: string } } },
      _options?: { signal?: AbortSignal }
    ) => {
      void _options
      const active = fixture.active!
      if (params.text?.format?.name === "milo_intent")
        return {
          output_text: JSON.stringify({ intent: active.intent }),
          output: [] as unknown[],
        }
      if (params.text?.format?.name === "milo_coverage")
        return {
          output_text: JSON.stringify({
            coverage:
              active.coverage ?? (active.covered ? "covered" : "not_covered"),
            relevantIds: active.related ? ["0"] : [],
          }),
          output: [] as unknown[],
        }
      if (params.text?.format?.name === "milo_evidence")
        return {
          output_text: JSON.stringify({
            covered: active.covered,
            answerSupported: active.answerSupported ?? active.covered,
            related: active.related ? [0] : [],
          }),
          output: [] as unknown[],
        }
      if (fixture.fallback) throw new Error("Agent unavailable")
      return {
        output_text: active.answer ?? active.source.snippet,
        output: [] as unknown[],
      }
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
      content: active.toolContent ?? {},
      sources: found
        ? [
            {
              ...active.source,
              sourceType: active.sourceType ?? "wiki_page",
              knowledgeSourceId: "source",
              knowledgeChunkId: "chunk",
              vectorSimilarity: active.vectorSimilarity ?? 0.9,
            },
          ]
        : [],
    }
  }),
}))
vi.mock("@/lib/milo/mcp/tools", () => mcp)

import { answerKnowledgeQuestion } from "@/lib/wiki-ai"
import { hasRetrievalConfidence } from "@/lib/milo/evidence"
import { abstention, gateMiloEvidence } from "@/lib/milo/grounding"
import { buildInitialResearchCalls } from "@/lib/milo/agent"
import { MiloTiming } from "@/lib/milo/timing"

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

  it("does not suggest pages when evidence does not answer the question", () => {
    expect(abstention().pages).toEqual([])
  })

  it.each([
    [
      "how do I find someone's phone number?",
      "People",
      "/people",
      "People searches employees by name, job title, work email, mobile phone, division or branch.",
    ],
    [
      "how do I get a branch's address?",
      "Branches",
      "/branches",
      "Branches lists branch names and addresses.",
    ],
  ])(
    "streams the capability answer for %s",
    async (question, title, url, snippet) => {
      fixture.active = {
        question,
        intent: "hub",
        covered: true,
        related: true,
        source: { title, url, snippet },
        sourceType: "site",
        answer: `Open [${title}](${url}).`,
      }
      const tokens: string[] = []
      const result = await answerKnowledgeQuestion({
        question,
        supabase: fixtureClient() as never,
        userContext,
        pageContext,
        onToken: (token) => tokens.push(token),
      })
      expect(result.metadata?.abstained).toBe(false)
      expect(tokens.join("")).toContain(title)
      const gate = provider.createAgentResponseWithOpenAI.mock.calls.find(
        ([params]) => params.text?.format?.name === "milo_coverage"
      )?.[0] as unknown as { instructions: string; input: string }
      expect(gate.instructions).toContain("capability")
      expect(JSON.parse(gate.input).sources[0].snippet).toContain(title)
      expect(JSON.parse(gate.input).sources[0].sourceType).toBe("site")
    }
  )

  it("recognizes identity supported by system context without a wiki warning", async () => {
    fixture.active = {
      question: "who are you?",
      intent: "identity",
      covered: true,
      related: false,
      answerSupported: false,
      source: unrelated,
      answer: "I'm Milo, the Canopy Hub assistant.",
    }
    const tokens: string[] = []
    const timing = new MiloTiming()
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      timing,
      onToken: (token) => tokens.push(token),
    })
    expect(result.answer).toBe(tokens.join(""))
    expect(result.answer).not.toContain("could not be verified")
    expect(timing.gateOutcome).toBe("deterministic")
    expect(result.answer).toContain("Milo")
    expect(provider.streamMiloResponse).not.toHaveBeenCalled()
  })

  it("does not suppress a warning for unsupported claims alongside identity", async () => {
    fixture.active = {
      question: "Are you a Canopy Mortgage employee?",
      intent: "other",
      covered: true,
      related: false,
      answerSupported: false,
      source: unrelated,
      answer: "I'm a Canopy Mortgage employee.",
    }
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: vi.fn(),
    })
    expect(result.answer).toContain("could not be verified")
  })

  it("bypasses the gate for a high-vector navigation title or explicit context", async () => {
    const timing = new MiloTiming()
    const source = {
      title: "Department Directory",
      url: "/department-directory",
      snippet: "Find support departments and contacts.",
      sourceType: "site",
      vectorSimilarity: 0.94,
    }
    await expect(
      gateMiloEvidence(
        "Where do I find the Department Directory?",
        [],
        [source],
        undefined,
        pageContext,
        [],
        "navigation",
        timing
      )
    ).resolves.toMatchObject({ coverage: "covered" })
    expect(timing.gateMode).toBe("deterministic")
    expect(timing.gateMs).toEqual(expect.any(Number))
    expect(provider.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
    await expect(
      gateMiloEvidence(
        "tell me about this website",
        [],
        [],
        undefined,
        pageContext,
        [],
        "hub_context"
      )
    ).resolves.toMatchObject({ coverage: "covered" })
    await expect(
      gateMiloEvidence(
        "what is this page about",
        [],
        [],
        undefined,
        pageContext,
        [],
        "page_context"
      )
    ).resolves.toMatchObject({ coverage: "covered" })
  })

  it("does not bypass the gate for a high-vector title lacking the requested fact", async () => {
    fixture.active = {
      question: "What is the 401k match?",
      intent: "other",
      covered: false,
      related: true,
      source: partial,
    }
    const timing = new MiloTiming()
    const result = await gateMiloEvidence(
      fixture.active.question,
      [],
      [
        {
          title: "401k Match",
          url: "/wiki/benefits",
          snippet: "Details coming soon.",
          sourceType: "wiki_page",
          vectorSimilarity: 0.95,
        },
      ],
      undefined,
      pageContext,
      [],
      "other",
      timing
    )
    expect(timing.gateMode).toBe("model")
    expect(result.coverage).toBe("not_covered")
  })

  it("includes later chunks from the same page in the bounded gate context", async () => {
    fixture.active = {
      question: "explain the process",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    const chunks = [
      "introduction",
      "background",
      `${"x".repeat(1500)}actual procedure`,
    ].map((snippet, index) => ({
      title: "Process",
      url: "/wiki/1/2",
      snippet,
      sourceType: "wiki_page",
      knowledgeSourceId: "source",
      knowledgeChunkId: `chunk-${index}`,
    }))
    while (chunks.length < 15)
      chunks.push({ ...chunks[0], knowledgeChunkId: `chunk-${chunks.length}` })
    chunks.push({
      ...chunks[0],
      title: "Other page",
      knowledgeSourceId: "other",
    })
    await gateMiloEvidence(fixture.active.question, [], chunks)
    const request = provider.createAgentResponseWithOpenAI.mock
      .calls[0][0] as unknown as { input: string }
    expect(JSON.parse(request.input).sources[2].snippet).toContain(
      "actual procedure"
    )
    expect(JSON.parse(request.input).sources[15].title).toBe("Other page")
  })

  it("uses minimal effort and a bounded payload for the nano gate", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    provider.getFormatModel.mockReturnValue("gpt-5-nano")
    try {
      const timing = new MiloTiming()
      await gateMiloEvidence(
        fixture.active.question,
        [],
        [{ ...feedback, snippet: "x".repeat(3000), sourceType: "site" }],
        undefined,
        pageContext,
        [],
        "other",
        timing
      )
      const request = provider.createAgentResponseWithOpenAI.mock
        .calls[0][0] as unknown as {
        reasoning: { effort: string }
        max_output_tokens: number
        input: string
      }
      expect(request.reasoning.effort).toBe("minimal")
      expect(request.max_output_tokens).toBe(192)
      expect(JSON.parse(request.input).sources[0].snippet).toHaveLength(2048)
      expect(timing.gateOutcome).toBe("covered")
    } finally {
      provider.getFormatModel.mockReturnValue("fixture-format")
    }
  })

  it.each([
    "CEO's favorite color",
    "401k match",
    "branch wifi password",
    "vacation days",
    "Friday dress code",
    "HQ parking",
  ])("keeps an unknown without related pages: %s", async (question) => {
    fixture.active = {
      question,
      intent: "other",
      covered: false,
      related: true,
      source: unrelated,
    }
    const result = await answerKnowledgeQuestion({
      question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: vi.fn(),
    })
    expect(result.metadata?.abstained).toBe(true)
    expect(result.citations).toEqual([])
  })

  it.each(["timeout", "parse error"])(
    "streams good evidence after a gate %s",
    async (failure) => {
      fixture.active = {
        question: "explain feedback",
        intent: "other",
        covered: true,
        related: true,
        source: feedback,
      }
      const timing = new MiloTiming()
      let started!: () => void
      const gateStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      provider.createAgentResponseWithOpenAI.mockImplementationOnce(
        async () => ({
          output_text: JSON.stringify({ intent: "other" }),
          output: [],
        })
      )
      provider.createAgentResponseWithOpenAI.mockImplementationOnce(
        (_params, options) => {
          started()
          if (failure === "parse error")
            return Promise.resolve({ output_text: "invalid JSON", output: [] })
          return new Promise((_, reject) =>
            options!.signal!.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            )
          )
        }
      )
      if (failure === "timeout") vi.useFakeTimers()
      try {
        const tokens: string[] = []
        const pending = answerKnowledgeQuestion({
          question: fixture.active.question,
          supabase: fixtureClient() as never,
          userContext,
          pageContext,
          timing,
          onToken: (token) => tokens.push(token),
        })
        await gateStarted
        if (failure === "timeout") await vi.advanceTimersByTimeAsync(6000)
        const result = await pending
        expect(tokens.join("")).toContain("feedback")
        expect(result.metadata?.abstained).toBe(false)
        expect(result.answer).not.toContain("couldn't check")
        expect(result.answer).toContain("could not be verified")
        expect(timing.gateMode).toBe("model")
        expect(timing.gateOutcome).toBe(
          failure === "timeout" ? "timeout" : "error"
        )
        expect(timing.gateMs).toEqual(expect.any(Number))
      } finally {
        vi.useRealTimers()
      }
    }
  )

  it("recovers semantically relevant evidence even when the wording differs", async () => {
    fixture.active = {
      question: "how do I find someone's phone number?",
      intent: "hub",
      covered: true,
      related: true,
      sourceType: "site",
      vectorSimilarity: 0.82,
      source: {
        title: "People",
        url: "/people",
        snippet:
          "Search employees by name, job title, work email, mobile phone, division or branch.",
      },
      answer: "Open People to search for mobile phones.",
    }
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: JSON.stringify({ intent: "hub" }),
      output: [],
    }))
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: "invalid JSON",
      output: [],
    }))
    const tokens: string[] = []
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: (token) => tokens.push(token),
    })
    expect(result.metadata?.abstained).toBe(false)
    expect(tokens.join("")).toContain("People")
    expect(result.answer).toContain("could not be verified")
  })

  it("searches wiki instructions first for a how-to", () => {
    expect(
      buildInitialResearchCalls("how do I send feedback")[0]
    ).toMatchObject({
      toolName: "knowledge_search",
      arguments: { query: "send feedback", sourceTypes: ["wiki_page"] },
    })
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
        expect(answer.citations).toHaveLength(0)
        expect(answer.answer).not.toContain("related pages")
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
      expect(JSON.parse(evidenceRequest.input).currentPage).toMatchObject({
        ...pageContext,
        kind: "app_page",
      })
    })
  }

  function fixtureClient(extraChunk?: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: async () => ({
        data: extraChunk
          ? [
              {
                id: "extra",
                content: extraChunk,
                metadata: { headingPath: ["Steps"] },
              },
            ]
          : [],
      }),
    }
    return {
      from: () => chain,
      rpc: vi.fn(async (name: string) => ({
        data: name.startsWith("match_knowledge_chunks")
          ? [
              {
                chunk_id: "chunk",
                source_id: "source",
                source_type: "wiki_page",
                source_title: fixture.active!.source.title,
                source_url: fixture.active!.source.url,
                content: fixture.active!.source.snippet,
                metadata: {},
                similarity: fixture.active!.vectorSimilarity ?? 0.5,
              },
            ]
          : null,
        error: null,
      })),
    }
  }

  for (const mode of ["agent", "fallback"] as const) {
    it(`${mode}: uses Hub map and successful tool results for a Hub how-to`, async () => {
      fixture.active = {
        question: "how do I find someone's phone number?",
        intent: "hub",
        covered: true,
        related: false,
        source: unrelated,
        answer: "Open [People](/people) to find employees and mobile phones.",
        toolContent: { directory: "People", phone: "mobile phones" },
      }
      fixture.fallback = mode === "fallback"
      const answer = await answerKnowledgeQuestion({
        question: fixture.active.question,
        supabase: fixtureClient() as never,
        userContext,
        pageContext,
      })
      expect(answer.metadata?.abstained).toBe(false)
      expect(answer.answer).toContain("People")
      expect(answer.answer).not.toMatch(/couldn't find|could not be verified/i)
      const request = provider.createAgentResponseWithOpenAI.mock.calls.find(
        (call) => call[0].text?.format?.name === "milo_evidence"
      )![0] as unknown as { input: string }
      const evidence = JSON.parse(request.input)
      expect(evidence.hubMap).toContain("mobile phones")
      if (mode === "agent")
        expect(JSON.stringify(evidence.toolResults)).toContain("mobile phones")
    })

    it(`${mode}: reads additional chunks and answers a covered procedure without a hedge`, async () => {
      fixture.active = {
        question: "how do I publish a wiki page",
        intent: "hub",
        covered: true,
        related: true,
        source: {
          ...publishing,
          snippet: "Writing and Publishing covers editing.",
        },
        extraChunk: "To publish, choose Published and save your changes.",
        answer:
          "In Writing and Publishing, choose Published, then save your changes.",
      }
      fixture.fallback = mode === "fallback"
      const answer = await answerKnowledgeQuestion({
        question: fixture.active.question,
        supabase: fixtureClient(fixture.active.extraChunk) as never,
        userContext,
        pageContext,
      })
      expect(answer.answer).toContain("Published")
      expect(answer.answer).not.toMatch(/can't verify|could not be verified/i)
      const request = provider.createAgentResponseWithOpenAI.mock.calls.find(
        (call) => call[0].text?.format?.name === "milo_evidence"
      )![0] as unknown as { input: string }
      expect(request.input).toContain("choose Published and save your changes")
      if (mode === "agent") {
        const agent = provider.createAgentResponseWithOpenAI.mock.calls.find(
          (call) => !call[0].text?.format?.name
        )![0]
        expect(
          JSON.stringify((agent as unknown as { input: unknown }).input)
        ).toContain("choose Published and save your changes")
      } else
        expect(
          JSON.stringify(provider.createChatResponseWithOpenAI.mock.calls)
        ).toContain("choose Published and save your changes")
    })

    it(`${mode}: abstains without irrelevant sources`, async () => {
      fixture.active = {
        question: "what is the cafeteria menu",
        intent: "other",
        covered: false,
        related: false,
        source: unrelated,
        vectorSimilarity: 0.96,
      }
      fixture.fallback = mode === "fallback"
      const answer = await answerKnowledgeQuestion({
        question: fixture.active.question,
        supabase: fixtureClient() as never,
        userContext,
        pageContext,
      })
      expect(answer.metadata?.abstained).toBe(true)
      expect(answer.citations).toEqual([])
      expect(answer.answer).not.toContain("related pages")
    })

    it(`${mode}: passes wiki and app page types and locations to the model`, async () => {
      for (const page of [
        {
          title: "Home Dashboard",
          url: "/wiki/1/10/11",
          kind: "wiki_page" as const,
          area: "Canopy Wiki",
          section: "Hub",
        },
        { title: "Home", url: "/home", kind: "app_page" as const },
      ]) {
        fixture.active = {
          question: "where am I",
          intent: "page",
          covered: true,
          related: false,
          source: unrelated,
          answer:
            page.kind === "wiki_page"
              ? 'The user is reading the wiki page "Home Dashboard" in the Hub section of the Canopy Wiki.'
              : 'The user is on the Canopy Hub app page "Home".',
        }
        fixture.fallback = mode === "fallback"
        const answer = await answerKnowledgeQuestion({
          question: fixture.active.question,
          supabase: fixtureClient() as never,
          userContext,
          pageContext: page,
        })
        expect(answer.metadata?.abstained).toBe(false)
        expect(answer.answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).toContain(
          page.kind === "wiki_page" ? "wiki page" : "app page"
        )
        const request = provider.createAgentResponseWithOpenAI.mock.calls
          .filter((call) => call[0].text?.format?.name === "milo_evidence")
          .at(-1)![0] as unknown as { input: string }
        const context = JSON.parse(request.input).currentPage
        expect(context).toMatchObject(page)
        if (page.kind === "wiki_page")
          expect(context.description).toContain(
            "in the Hub section of the Canopy Wiki"
          )
      }
    })
  }

  it("warns when semantic assessment finds an unsupported claim even beside a named source", async () => {
    fixture.active = {
      question: "how do I publish a wiki page",
      intent: "hub",
      covered: true,
      related: true,
      answerSupported: false,
      source: publishing,
      answer: "Writing and Publishing says the CEO must approve every page.",
    }
    const answer = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
    })
    expect(answer.answer).toContain("could not be verified")
  })

  it("deduplicates multiple supported chunks of one page", async () => {
    fixture.active = {
      question: "how do I publish a wiki page",
      intent: "hub",
      covered: true,
      related: true,
      source: publishing,
      extraChunk: "Save the wiki page before publishing.",
      answer: `${publishing.snippet} Save the wiki page before publishing.`,
    }
    const answer = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient(fixture.active.extraChunk) as never,
      userContext,
      pageContext,
    })
    expect(
      answer.citations.filter((citation) =>
        citation.url?.startsWith(publishing.url)
      )
    ).toHaveLength(1)
  })

  it("skips evidence assessment for a high-similarity answer supported by a cited source", async () => {
    fixture.active = {
      question: "how do I publish a wiki page",
      intent: "hub",
      covered: true,
      related: true,
      source: publishing,
      vectorSimilarity: 0.96,
    }
    const answer = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
    })
    expect(answer.metadata?.abstained).toBe(false)
    expect(
      provider.createAgentResponseWithOpenAI.mock.calls.filter(
        (call) => call[0].text?.format?.name === "milo_evidence"
      )
    ).toHaveLength(0)
  })

  it("starts the initial retrieval while intent classification is pending", async () => {
    fixture.active = {
      question: "how do I publish a wiki page",
      intent: "hub",
      covered: true,
      related: true,
      source: publishing,
    }
    let finishIntent!: (value: { output_text: string; output: never[] }) => void
    let searchStarted!: () => void
    const search = new Promise<void>((resolve) => {
      searchStarted = resolve
    })
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishIntent = resolve
        })
    )
    mcp.callMiloMcpTool.mockImplementationOnce(async () => {
      searchStarted()
      return {
        ok: true,
        toolName: "knowledge_search",
        content: {},
        sources: [],
      }
    })
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
    })
    await search
    expect(finishIntent).toBeTypeOf("function")
    finishIntent({ output_text: JSON.stringify({ intent: "hub" }), output: [] })
    await expect(pending).resolves.toMatchObject({
      metadata: { abstained: false },
    })
  })

  it("researches while user context is pending, but waits for it before generation", async () => {
    fixture.active = {
      question: "how do I publish a wiki page",
      intent: "hub",
      covered: true,
      related: true,
      source: publishing,
    }
    let finishContext!: (value: typeof userContext) => void
    const context = new Promise<typeof userContext>((resolve) => {
      finishContext = resolve
    })
    let markSearchStarted!: () => void
    const searchStarted = new Promise<void>((resolve) => {
      markSearchStarted = resolve
    })
    mcp.callMiloMcpTool.mockImplementationOnce(async () => {
      markSearchStarted()
      return {
        ok: true,
        toolName: "knowledge_search",
        content: {},
        sources: [],
      }
    })
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext: context,
      pageContext,
    })
    await searchStarted
    expect(
      provider.createAgentResponseWithOpenAI.mock.calls.every(
        ([params]) => params.text?.format?.name === "milo_intent"
      )
    ).toBe(true)
    finishContext(userContext)
    await expect(pending).resolves.toMatchObject({
      metadata: { abstained: false },
    })
  })

  it("reuses an initial knowledge search if the model requests it again", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: JSON.stringify({ intent: "other" }),
      output: [],
    }))
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: "",
      output: [
        {
          type: "function_call",
          name: "milo_mcp_call",
          call_id: "call-1",
          arguments: JSON.stringify({
            toolName: "knowledge_search",
            arguments: { query: "explain feedback" },
          }),
        },
      ],
    }))
    await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
    })
    expect(
      mcp.callMiloMcpTool.mock.calls.filter(
        ([name, args]) =>
          name === "knowledge_search" && args?.query === "explain feedback"
      )
    ).toHaveLength(1)
  })

  it("aborts generation on an uncovered question without exposing held tokens", async () => {
    fixture.active = {
      question: "what is the cafeteria menu",
      intent: "other",
      covered: false,
      related: false,
      source: unrelated,
    }
    let finishGate!: (value: { output_text: string; output: never[] }) => void
    let generationStarted!: () => void
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve
    })
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: JSON.stringify({ intent: "other" }),
      output: [],
    }))
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishGate = resolve
        })
    )
    provider.streamMiloResponse.mockImplementationOnce(
      async (_params, onToken, signal) => {
        onToken("irrelevant answer")
        generationStarted()
        return await new Promise((_, reject) =>
          signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        )
      }
    )
    const onToken = vi.fn()
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken,
    })
    await started
    expect(onToken).not.toHaveBeenCalled()
    finishGate({
      output_text: JSON.stringify({ coverage: "not_covered", relevantIds: [] }),
      output: [],
    })
    const result = await pending
    expect(result.metadata?.abstained).toBe(true)
    expect(result.citations).toEqual([])
    expect(onToken).toHaveBeenCalledExactlyOnceWith(result.answer)
  })

  it("holds tokens during the gate, then streams subsequent tokens before generation completes", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    let finishGate!: (value: { output_text: string; output: never[] }) => void
    let continueStream!: () => void
    let generationStarted!: () => void
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve
    })
    const continuation = new Promise<void>((resolve) => {
      continueStream = resolve
    })
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: JSON.stringify({ intent: "other" }),
      output: [],
    }))
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishGate = resolve
        })
    )
    provider.streamMiloResponse.mockImplementationOnce(
      async (_params, onToken) => {
        onToken("Send ")
        generationStarted()
        await continuation
        onToken("feedback.")
        return { output_text: "Send feedback.", output: [] }
      }
    )
    const events: string[] = []
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onStatus: () => events.push("status"),
      onToken: (token) => events.push(token),
    })
    await started
    expect(events).not.toContain("Send ")
    finishGate({
      output_text: JSON.stringify({
        coverage: "covered",
        relevantIds: ["0"],
      }),
      output: [],
    })
    await vi.waitFor(() => expect(events).toContain("Send "))
    expect(events[0]).toBe("status")
    expect(events).not.toContain("feedback.")
    continueStream()
    const result = await pending
    expect(events.slice(-2)).toEqual(["Send ", "feedback."])
    expect(result.answer).toBe("Send feedback.")
  })

  it("keeps streamed text and adds a note for partial coverage", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      coverage: "partial",
      related: true,
      source: feedback,
      answer: "Send feedback.",
    }
    const tokens: string[] = []
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: (token) => tokens.push(token),
    })
    expect(tokens.length).toBeGreaterThan(1)
    expect(result.answer).toBe(
      tokens.join("") + "\n\nSome details could not be verified in the wiki."
    )
  })

  it("only appends a note when the post-stream claim check fails", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      answerSupported: false,
      source: feedback,
      answer: "Send feedback to the CEO.",
    }
    const tokens: string[] = []
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: (token) => tokens.push(token),
    })
    expect(result.answer).toBe(
      tokens.join("") + "\n\nSome details could not be verified in the wiki."
    )
  })

  it("does not cite a Hub map page that the gate did not select", async () => {
    fixture.active = {
      question: "how do I find someone's phone number?",
      intent: "hub",
      covered: true,
      related: false,
      source: unrelated,
      answer: "Open People to find employees and mobile phones.",
      toolContent: { directory: "People", phone: "mobile phones" },
    }
    const result = await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      onToken: vi.fn(),
    })
    expect(result.citations).toEqual([])
  })

  it("propagates stop mid-stream without producing a completed answer", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    const controller = new AbortController()
    let started!: () => void
    const first = new Promise<void>((resolve) => {
      started = resolve
    })
    provider.streamMiloResponse.mockImplementationOnce(
      async (_params, onToken, signal) => {
        onToken("Send ")
        started()
        return await new Promise((_, reject) =>
          signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        )
      }
    )
    const tokens: string[] = []
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      signal: controller.signal,
      onToken: (token) => tokens.push(token),
    })
    await first
    await vi.waitFor(() => expect(tokens).toEqual(["Send "]))
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(tokens).toEqual(["Send "])
  })

  it("stops while the coverage gate is pending and never exposes held tokens", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    const controller = new AbortController()
    let gateStarted!: () => void
    const started = new Promise<void>((resolve) => {
      gateStarted = resolve
    })
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(async () => ({
      output_text: JSON.stringify({ intent: "other" }),
      output: [],
    }))
    provider.createAgentResponseWithOpenAI.mockImplementationOnce(
      (_params, options) => {
        gateStarted()
        return new Promise((_, reject) =>
          options!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        )
      }
    )
    const tokens: string[] = []
    const pending = answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
      signal: controller.signal,
      onToken: (token) => tokens.push(token),
    })
    await started
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(tokens).toEqual([])
  })

  it("uses low-effort bounded decisions and limits the map for a specific task", async () => {
    fixture.active = {
      question: "how do I send feedback",
      intent: "hub",
      covered: true,
      related: true,
      source: feedback,
    }
    await answerKnowledgeQuestion({
      question: fixture.active.question,
      supabase: fixtureClient() as never,
      userContext,
      pageContext,
    })
    const decisions = provider.createAgentResponseWithOpenAI.mock.calls
      .map(([params]) => params)
      .filter((params) => params.text?.format?.name)
    expect(decisions).toHaveLength(2)
    for (const decision of decisions)
      expect(decision).toMatchObject({
        reasoning: { effort: "low" },
        max_output_tokens: expect.any(Number),
      })
    const evidence = decisions.find(
      (decision) => decision.text?.format?.name === "milo_evidence"
    ) as unknown as { input: string }
    const map = JSON.parse(evidence.input).hubMap as string
    expect(map).toContain("Submit Feedback")
    expect(map).not.toContain("File Quality Dashboard")
  })

  it("omits unsupported reasoning options for a non-reasoning format model", async () => {
    fixture.active = {
      question: "explain feedback",
      intent: "other",
      covered: true,
      related: true,
      source: feedback,
    }
    provider.getFormatModel.mockReturnValue("gpt-4.1")
    try {
      await answerKnowledgeQuestion({
        question: fixture.active.question,
        supabase: fixtureClient() as never,
        userContext,
        pageContext,
      })
      const decisions = provider.createAgentResponseWithOpenAI.mock.calls
        .map(([params]) => params)
        .filter((params) => params.text?.format?.name)
      expect(decisions).toHaveLength(2)
      for (const decision of decisions)
        expect(decision).not.toHaveProperty("reasoning")
    } finally {
      provider.getFormatModel.mockReturnValue("fixture-format")
    }
  })

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
      answerSupported: false,
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
