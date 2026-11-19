import { beforeEach, describe, expect, it, vi } from "vitest"

type MockMiloToolResult = {
  ok: boolean
  toolName: string
  content: unknown
  sources: Array<{
    title: string
    url: string | null
    snippet: string
    sourceType?: string
    knowledgeChunkId?: string
  }>
}

const aiProvider = vi.hoisted(() => ({
  createEmbeddingsWithOpenAI: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  createChatResponseWithOpenAI: vi.fn(async () => ({
    output_text: "Use /wiki [1].",
  })),
  createAgentResponseWithOpenAI: vi.fn(async (): Promise<unknown> => {
    throw new Error("agent unavailable")
  }),
  streamMiloResponse: vi.fn(
    async (_params: unknown, onToken: (token: string) => void) => {
      onToken("Wiki documentation ")
      onToken("lives at /wiki.")
      return { output_text: "Wiki documentation lives at /wiki." }
    }
  ),
  getChatModel: vi.fn(() => "fake-chat"),
}))

vi.mock("@/lib/ai/provider", () => aiProvider)
vi.mock("@/lib/wiki-knowledge-urls", () => ({
  resolveWikiKnowledgeRows: async (
    _client: unknown,
    rows: Array<Record<string, unknown>>
  ) =>
    rows.map((row) =>
      row.source_type === "wiki_page"
        ? { ...row, source_url: "/wiki/1/22" }
        : row
    ),
}))

const miloMcp = vi.hoisted(() => ({
  MILO_MCP_TOOLS: [
    { name: "knowledge_search", description: "Search knowledge." },
    { name: "wiki_tag_search", description: "Search Wiki tags." },
    { name: "db_search", description: "Search database." },
    { name: "db_schema", description: "List schema." },
    { name: "storage_list", description: "List storage." },
  ],
  callMiloMcpTool: vi.fn(
    async (toolName: string, args?: unknown): Promise<MockMiloToolResult> => {
      void args
      return {
        ok: true,
        toolName,
        content: { rows: [] },
        sources: [],
      }
    }
  ),
}))

vi.mock("@/lib/milo/mcp/tools", () => miloMcp)

const hubData = vi.hoisted(() => ({
  fetchEmployeeDirectoryRows: vi.fn(async () => [] as unknown[]),
  fetchBranchesDirectoryRows: vi.fn(async () => [] as unknown[]),
}))

vi.mock("@/lib/hub-data", () => hubData)

vi.mock("@/lib/support-directory-data", () => ({
  fetchSupportDirectoryData: async () => ({
    generalHelpSection: null,
    rushSections: [],
    departments: [],
  }),
}))

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
}

describe("wiki AI orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hubData.fetchEmployeeDirectoryRows.mockResolvedValue([])
    hubData.fetchBranchesDirectoryRows.mockResolvedValue([])
    miloMcp.callMiloMcpTool.mockImplementation(
      async (toolName: string, args?: unknown): Promise<MockMiloToolResult> => {
        void args
        return {
          ok: true,
          toolName,
          content: { rows: [] },
          sources: [],
        }
      }
    )
  })

  it("answers a broad summary from relevant pages and links each page once", async () => {
    const { answerMiloQuestionWithAgent } = await import("@/lib/milo/agent")
    const sources = [
      {
        title: "Funding Checklist",
        url: "/wiki/1/1",
        snippet: "Funding steps are reviewed.",
        sourceType: "wiki_page",
        knowledgeChunkId: "funding",
      },
      {
        title: "Closing Guide",
        url: "/wiki/1/2",
        snippet: "Closing steps are documented.",
        sourceType: "wiki_page",
        knowledgeChunkId: "closing",
      },
      {
        title: "Wiki Basics",
        url: "/wiki/1/3",
        snippet: "Wiki basics explain navigation.",
        sourceType: "wiki_page",
        knowledgeChunkId: "basics",
      },
    ]
    miloMcp.callMiloMcpTool.mockImplementation(async (toolName: string) => ({
      ok: true,
      toolName,
      content: {},
      sources: toolName === "knowledge_search" ? sources : [],
    }))
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text:
        "See Funding Checklist. Funding steps are reviewed.\n\nSee Closing Guide. Closing steps are documented.\n\nSee Wiki Basics. Wiki basics explain navigation.",
      output: [],
    })
    const result = await answerMiloQuestionWithAgent({
      question:
        "Summarize everything in the wiki about funding, closing, and wiki basics",
      supabase: {} as never,
      userContext,
    })
    expect(result.metadata.abstained).toBe(false)
    for (const source of sources) {
      expect(result.answer.split(`](${source.url})`)).toHaveLength(2)
      expect(result.citations).toEqual(
        expect.arrayContaining([expect.objectContaining({ url: source.url })])
      )
    }
    expect(result.answer).not.toContain("couldn't find")
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalled()
  })

  it("searches the requested tag phrase in a multi-part question and accepts tag evidence", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    miloMcp.callMiloMcpTool.mockImplementation(async (toolName, args) => ({
      ok: true,
      toolName,
      content: {},
      sources:
        toolName === "wiki_tag_search" &&
        (args as { query?: string }).query === "Hub Process"
          ? [
              {
                title: "Tag: Hub Process (Global)",
                url: "/wiki/tags?tag=Hub%20Process",
                snippet: "Accessible pages: Funding Checklist",
                sourceType: "wiki_tag",
              },
            ]
          : [],
    }))
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "Hub Process includes Funding Checklist.",
      output: [],
    })
    const answer = await answerKnowledgeQuestion({
      supabase: { rpc: vi.fn() } as never,
      userContext,
      question:
        "Which wiki tags are used, and which pages are tagged Hub Process?",
    })
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "wiki_tag_search",
      { query: "Hub Process", limit: 8 },
      expect.anything()
    )
    expect(answer.metadata?.abstained).toBe(false)
    expect(
      answer.citations.some(
        (citation) => citation.url === "/wiki/tags?tag=Hub%20Process"
      )
    ).toBe(true)
  })

  it("places prior turns after permission notes and searches the previous question", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "No data.",
      output: [],
    })
    await answerKnowledgeQuestion({
      supabase: { rpc: vi.fn() } as never,
      userContext,
      question: "What about VA loans?",
      history: [
        { role: "user", content: "Tell me about conventional loans" },
        { role: "assistant", content: "Here is the policy." },
      ],
    })
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "knowledge_search",
      expect.objectContaining({
        query: expect.stringContaining("tell me about conventional loans"),
      }),
      expect.anything()
    )
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_cache_key: "milo-agent",
        input: [
          expect.objectContaining({ role: "developer" }),
          { role: "user", content: "Tell me about conventional loans" },
          { role: "assistant", content: "Here is the policy." },
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("What about VA loans?"),
          }),
        ],
      })
    )
  })

  it("streams the fallback and includes history in its prompt and retrieval", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    miloMcp.callMiloMcpTool.mockRejectedValueOnce(new Error("tool unavailable"))
    const chunks = [
      {
        chunk_id: "chunk-1",
        source_id: "source-1",
        source_type: "site",
        source_title: "Wiki",
        source_url: "/wiki",
        content: "Wiki documentation lives at /wiki.",
        metadata: {},
        similarity: 0.95,
      },
    ]
    const supabase = {
      rpc: vi.fn(async (name: string) => ({
        data: name.startsWith("match_knowledge") ? chunks : null,
        error: null,
      })),
    }
    const tokens: string[] = []
    const answer = await answerKnowledgeQuestion({
      supabase: supabase as never,
      userContext,
      question: "Where is it?",
      history: [
        { role: "user", content: "Tell me about Wiki documentation" },
        { role: "assistant", content: "The Wiki has documentation." },
      ],
      onToken: (token) => tokens.push(token),
    })
    expect(tokens).toEqual(["Wiki documentation ", "lives at /wiki."])
    expect(answer.citations).toHaveLength(1)
    expect(aiProvider.streamMiloResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Tell me about Wiki documentation"),
      }),
      expect.any(Function),
      undefined
    )
    expect(supabase.rpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_keyword",
      expect.objectContaining({
        search_query: expect.stringContaining(
          "Tell me about Wiki documentation"
        ),
      })
    )
  })

  it("honours a recorded stop after a research tool and does not call the model or log", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const controller = new AbortController()
    let stopped = false
    miloMcp.callMiloMcpTool.mockImplementationOnce(async (toolName) => {
      stopped = true
      return { ok: true, toolName, content: {}, sources: [] }
    })
    const rpc = vi.fn()
    const checkStop = async () => {
      if (stopped) controller.abort()
      controller.signal.throwIfAborted()
    }
    await expect(
      answerKnowledgeQuestion({
        supabase: { rpc } as never,
        userContext,
        question: "Summarize funding and closing wiki procedures",
        signal: controller.signal,
        checkStop,
        onToken: vi.fn(),
      })
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(aiProvider.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
    expect(aiProvider.streamMiloResponse).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.anything()
    )
  })

  it("can defer logging until the chat route finishes persisting", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const rpc = vi.fn()
    await answerKnowledgeQuestion({
      supabase: { rpc } as never,
      userContext,
      question: "hi milo",
      deferActionLog: true,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("does not log when answer generation fails", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createAgentResponseWithOpenAI.mockRejectedValueOnce(
      new Error("agent unavailable")
    )
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "retrieval failed" } })
    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: { rpc } as never,
        question: "Where are the lending procedures?",
      })
    ).rejects.toThrow("retrieval failed")
    expect(rpc).not.toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.anything()
    )
  })

  it("answers short greetings without retrieving knowledge or calling OpenAI", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: supabase as never,
        question: "hi milo",
      })
    ).resolves.toEqual({
      answer: "Howdy! How can I help with Canopy Hub?",
      model: null,
      citations: [],
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.objectContaining({ p_action_type: "milo_answer" })
    )
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("answers exact employee lookups from the People directory without OpenAI", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    hubData.fetchEmployeeDirectoryRows.mockResolvedValue([
      {
        id: "u-aaron",
        employee: "Aaron Brown",
        jobTitle: "Loan Officer",
        workEmail: "aaron.brown@canopy.test",
        mobilePhone: "555-0102",
        divisionId: "d-1",
        division: "Retail",
        branch: "Phoenix",
        branchId: "b-1",
      },
    ])
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: supabase as never,
        question: "tell me about aaron brown",
      })
    ).resolves.toEqual({
      answer: [
        "Aaron Brown is listed in the People directory.",
        "Job title: Loan Officer",
        "Work email: aaron.brown@canopy.test",
        "Phone: 555-0102",
        "Division: Retail",
        "Branch: Phoenix",
        "Branch ID: b-1",
        "Profile: [Aaron Brown](/employee/u-aaron)",
      ].join("\n"),
      model: null,
      citations: [],
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.objectContaining({ p_action_type: "milo_answer" })
    )
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("does not fall back to unrelated RAG sources when employee data is empty", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: supabase as never,
        question: "who is aaron brown",
      })
    ).resolves.toEqual({
      answer:
        "I do not have employee rows available in the People directory right now, so I cannot look up aaron brown. Open [People](/people) after the employee data sync is populated.",
      model: null,
      citations: [],
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.objectContaining({ p_action_type: "milo_answer" })
    )
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("does not treat short topic lookups as failed People searches", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(async (name: string) => {
        if (name === "match_knowledge_chunks_keyword") {
          return {
            data: [
              {
                chunk_id: "chunk-borrower-auth",
                source_id: "source-borrower-auth",
                source_type: "wiki_page",
                source_title: "How to Send a Borrower's Authorization",
                source_url: "/wiki/old-slug",
                content:
                  "Borrower authorization steps are documented in this Wiki page.",
                metadata: {},
                similarity: 0.95,
              },
            ],
            error: null,
          }
        }

        return {
          data: [],
          error: null,
        }
      }),
    }

    const result = await answerKnowledgeQuestion({
      userContext,
      supabase: supabase as never,
      question: "tell me about borrower auth",
    })

    expect(result.answer).toContain("could not be verified in the wiki")
    expect(result.citations).toEqual([])
    expect(result.answer).not.toContain("People directory")
    expect(hubData.fetchEmployeeDirectoryRows).toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_keyword",
      expect.objectContaining({
        search_query: expect.stringContaining("authorization"),
      })
    )
    expect(aiProvider.createEmbeddingsWithOpenAI).toHaveBeenCalledWith([
      expect.stringContaining("authorization"),
    ])
  })

  it("uses the agentic MCP path when the agent returns an answer", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "Aaron Brown is listed in People.",
      output: [],
    })
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: supabase as never,
        question: "what documents are available",
      })
    ).resolves.toEqual({
      answer:
        "I couldn't find an answer in the wiki. You can ask a manager or flag this gap.",
      model: "fake-chat",
      citations: [],
      metadata: {
        abstained: true,
        abstainReason: "not_covered",
        mode: "agentic_mcp",
        toolCalls: [
          { toolName: "knowledge_search", ok: true, error: undefined },
          { toolName: "wiki_tag_search", ok: true, error: undefined },
          { toolName: "knowledge_search", ok: true, error: undefined },
          { toolName: "db_search", ok: true, error: undefined },
          { toolName: "storage_list", ok: true, error: undefined },
          { toolName: "storage_list", ok: true, error: undefined },
        ],
      },
    })
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "storage_list",
      expect.objectContaining({ bucket: "Newsletters" }),
      expect.anything()
    )
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.objectContaining({ p_action_type: "milo_answer" })
    )
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.not.stringContaining('"wiki.manage":false'),
        prompt_cache_key: "milo-agent",
        input: [
          expect.objectContaining({
            role: "developer",
            content: expect.stringContaining('"wiki.manage":false'),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringMatching(
              /User question:\nwhat documents are available$/
            ),
          }),
        ],
      })
    )
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            role: "developer",
            content: expect.stringContaining("draft proposed text"),
          }),
        ]),
      })
    )
  })

  it("uses the current page chunks as evidence for a page-relative question", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const pageContext = {
      pageId: "page-1",
      title: "Closing checklist",
      url: "/wiki/1/2",
    }
    const sourceQuery = {
      select: () => sourceQuery,
      eq: () => sourceQuery,
      maybeSingle: async () => ({ data: { id: "source-1" } }),
    }
    const chunksQuery = {
      select: () => chunksQuery,
      eq: () => chunksQuery,
      order: () => chunksQuery,
      limit: async () => ({
        data: [
          { id: "chunk-1", content: "Review the checklist before closing." },
        ],
      }),
    }
    const supabase = {
      from: (table: string) =>
        table === "knowledge_sources" ? sourceQuery : chunksQuery,
      rpc: vi.fn(),
    }
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "Review the checklist before closing.",
      output: [],
    })
    const result = await answerKnowledgeQuestion({
      userContext,
      supabase: supabase as never,
      question: "Summarize this page",
      pageContext,
    })
    expect(result.metadata).toMatchObject({
      mode: "agentic_mcp",
      abstained: false,
    })
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Closing checklist",
          url: "/wiki/1/2",
        }),
      ])
    )
    const calls = aiProvider.createAgentResponseWithOpenAI.mock
      .calls as unknown as Array<
      [{ instructions: string; input: Array<{ content?: string }> }]
    >
    const request = calls[0][0]
    expect(request.instructions).not.toContain("Closing checklist")
    expect(JSON.stringify(request.input)).toContain(
      "Review the checklist before closing."
    )
  })

  it("retains current-page evidence when the agent falls back to retrieval", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const pageContext = {
      pageId: "page-1",
      title: "Closing checklist",
      url: "/wiki/1/2",
    }
    const sourceQuery = {
      select: () => sourceQuery,
      eq: () => sourceQuery,
      maybeSingle: async () => ({ data: { id: "source-1" } }),
    }
    const chunksQuery = {
      select: () => chunksQuery,
      eq: () => chunksQuery,
      order: () => chunksQuery,
      limit: async () => ({
        data: [
          { id: "chunk-1", content: "Review the checklist before closing." },
        ],
      }),
    }
    const supabase = {
      from: (table: string) =>
        table === "knowledge_sources" ? sourceQuery : chunksQuery,
      rpc: vi.fn(async () => ({ data: [], error: null })),
    }
    aiProvider.createAgentResponseWithOpenAI.mockRejectedValueOnce(
      new Error("agent unavailable")
    )
    aiProvider.createChatResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "Review the checklist before closing.",
    })
    const result = await answerKnowledgeQuestion({
      userContext,
      supabase: supabase as never,
      question: "Summarize this page",
      pageContext,
    })
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Closing checklist",
          url: "/wiki/1/2",
        }),
      ])
    )
    expect(aiProvider.createChatResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Review the checklist before closing."),
      })
    )
  })

  it("keeps the Milo instruction prefix stable across users and research", async () => {
    const { buildMiloAgentPrompt, MILO_AGENT_INSTRUCTIONS } =
      await import("@/lib/milo/agent")
    const first = buildMiloAgentPrompt(MILO_AGENT_INSTRUCTIONS, {
      question: "Where is the first page?",
      researchBrief: "First page text",
      userContext,
    })
    const second = buildMiloAgentPrompt(MILO_AGENT_INSTRUCTIONS, {
      question: "Where is the second page?",
      researchBrief: "Second page text",
      userContext: {
        ...userContext,
        capabilities: { ...userContext.capabilities, "wiki.manage": true },
        wikiManagers: ["A manager"],
      },
    })
    const changed = buildMiloAgentPrompt(
      `${MILO_AGENT_INSTRUCTIONS}\nNew rule`,
      {
        question: "Where is the first page?",
        researchBrief: "First page text",
        userContext,
      }
    )

    expect(Buffer.from(first.instructions)).toEqual(
      Buffer.from(second.instructions)
    )
    expect(Buffer.from(first.instructions)).not.toEqual(
      Buffer.from(changed.instructions)
    )
    expect(first.input).not.toEqual(second.input)
    expect(first.input).toEqual([
      expect.objectContaining({
        role: "developer",
        content: expect.stringContaining('"wiki.manage":false'),
      }),
      {
        role: "user",
        content: "First page text\n\nUser question:\nWhere is the first page?",
      },
    ])
    expect(second.input[0]).toEqual(
      expect.objectContaining({
        role: "developer",
        content: expect.stringContaining("A manager"),
      })
    )
  })

  it("retains the prompt and tool results across agent steps", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createAgentResponseWithOpenAI
      .mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            name: "milo_mcp_call",
            call_id: "call-1",
            arguments: JSON.stringify({
              toolName: "db_search",
              arguments: { query: "help" },
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ output_text: "No data.", output: [] })

    await answerKnowledgeQuestion({
      userContext,
      supabase: { rpc: vi.fn() } as never,
      question: "Where can I find help?",
    })

    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledTimes(2)
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt_cache_key: "milo-agent",
        input: expect.arrayContaining([
          expect.objectContaining({
            role: "developer",
            content: expect.stringContaining('"wiki.manage":false'),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringMatching(
              /User question:\nWhere can I find help\?$/
            ),
          }),
          expect.objectContaining({
            type: "function_call_output",
            call_id: "call-1",
          }),
        ]),
      })
    )
  })

  it("instructs the agent to use inline source names", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "No data.",
      output: [],
    })
    await answerKnowledgeQuestion({
      userContext,
      supabase: { rpc: vi.fn() } as never,
      question: "what documents are available",
    })
    const calls = JSON.stringify(
      aiProvider.createAgentResponseWithOpenAI.mock.calls
    )
    expect(calls).toContain(
      "Cite each page once, naturally at its first mention"
    )
    expect(calls).toContain(
      "Never repeat a page link or use numbered citation markers"
    )
  })

  it("preloads procedure questions and only cites final supporting sources", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    miloMcp.callMiloMcpTool.mockImplementation(
      async (toolName: string, args) => {
        if (toolName === "knowledge_search") {
          return {
            ok: true,
            toolName,
            content: {
              rows: [
                {
                  source_type: "wiki_page",
                  source_title: "Cancel a Loan",
                  source_url: "/wiki/1/9/22",
                  content: "HOW TO CANCEL A LOAN: Step 1...",
                },
              ],
              args,
            },
            sources: [
              {
                title: "Richardson Loan Team",
                url: "/branch/900",
                snippet: "Branch: Richardson Loan Team",
                sourceType: "branch",
              },
              {
                title: "Cancel a Loan",
                url: "/wiki/1/9/22",
                snippet: "Policy guidance from the Wiki.",
                sourceType: "wiki_page",
              },
              {
                title: "Cancel a Loan",
                url: "/wiki/1/9/22",
                snippet: "HOW TO CANCEL A LOAN: Step 1...",
                sourceType: "wiki_page",
                knowledgeChunkId: "cancel-chunk",
              },
              {
                title: "Cancel a Loan",
                url: "/wiki/1/9/22",
                snippet: "COMMON CANCELLATION ERRORS...",
                sourceType: "wiki_page",
              },
              {
                title: "Aaron Darby",
                url: "/employee/1181",
                snippet: "Employee: Aaron Darby",
                sourceType: "employee",
              },
            ],
          }
        }

        return {
          ok: true,
          toolName,
          content: { results: [] },
          sources: [],
        }
      }
    )
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "HOW TO CANCEL A LOAN: Step 1...",
      output: [],
    })
    const supabase = {
      rpc: vi.fn(),
    }

    const result = await answerKnowledgeQuestion({
      userContext,
      supabase: supabase as never,
      question:
        "how do i cancel a loan, give me a step by step on how to do it",
    })

    expect(result).toMatchObject({
      answer: "HOW TO [CANCEL A LOAN](/wiki/1/9/22): Step 1...",
      model: "fake-chat",
      citations: [
        {
          title: "Cancel a Loan",
          url: "/wiki/1/9/22",
        },
      ],
      metadata: {
        mode: "agentic_mcp",
      },
    })
    expect(result.citations).toHaveLength(1)
    expect(result.citations.map((citation) => citation.title)).toEqual([
      "Cancel a Loan",
    ])
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "knowledge_search",
      expect.objectContaining({ query: expect.stringContaining("cancel") }),
      expect.anything()
    )
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "db_search",
      expect.objectContaining({ relation: "public.wiki_nodes" }),
      expect.anything()
    )
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Cancel a Loan"),
          }),
        ]),
      })
    )
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_user_ai_action",
      expect.objectContaining({ p_action_type: "milo_answer" })
    )
  })

  it("warns about an unsupported sentence from the fake agent while citing the supported sentence", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    miloMcp.callMiloMcpTool.mockImplementation(async (toolName: string) => ({
      ok: true,
      toolName,
      content: {},
      sources:
        toolName === "knowledge_search"
          ? [
              {
                title: "Refunds",
                url: "/wiki/1/2",
                snippet: "Track returned checks in the refund ledger.",
                sourceType: "wiki_page",
                knowledgeChunkId: "refund-chunk",
              },
            ]
          : [],
    }))
    aiProvider.createAgentResponseWithOpenAI.mockResolvedValueOnce({
      output_text:
        "Track returned checks in the refund ledger. The CEO approves every refund.",
      output: [],
    })
    const result = await answerKnowledgeQuestion({
      userContext,
      supabase: {} as never,
      question: "Where are returned checks tracked?",
    })
    expect(result.answer).toBe(
      "Track returned checks in the refund ledger. The CEO approves every refund.\n\nSome details could not be verified in the wiki."
    )
    expect(result.citations).toMatchObject([
      { snippet: "Track returned checks in the refund ledger." },
    ])
  })

  it("retrieves keyword and vector chunks, calls the fake provider, and returns citations", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    aiProvider.createChatResponseWithOpenAI.mockResolvedValueOnce({
      output_text: "Wiki documentation lives at /wiki.",
    })
    const supabase = {
      rpc: vi.fn(async (name: string) => {
        if (name === "match_knowledge_chunks_keyword") {
          return {
            data: [
              {
                chunk_id: "chunk-1",
                source_id: "source-1",
                source_type: "site",
                source_title: "Wiki",
                source_url: "/wiki",
                content: "Wiki documentation lives at /wiki.",
                metadata: {},
                similarity: 0.95,
              },
            ],
            error: null,
          }
        }

        return {
          data: [
            {
              chunk_id: "chunk-1",
              source_id: "source-1",
              source_type: "site",
              source_title: "Wiki",
              source_url: "/wiki",
              content: "Lower scoring duplicate.",
              metadata: {},
              similarity: 0.6,
            },
          ],
          error: null,
        }
      }),
    }

    await expect(
      answerKnowledgeQuestion({
        userContext,
        supabase: supabase as never,
        question: "Where is the Wiki?",
      })
    ).resolves.toMatchObject({
      answer: "[Wiki](/wiki) documentation lives at Wiki.",
      model: "fake-chat",
      citations: [
        {
          knowledgeSourceId: "source-1",
          knowledgeChunkId: "chunk-1",
          title: "Wiki",
          url: "/wiki",
        },
      ],
    })

    expect(aiProvider.createEmbeddingsWithOpenAI).toHaveBeenCalledWith([
      "Where is the Wiki?",
    ])
    expect(aiProvider.createChatResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fake-chat",
        input: expect.stringContaining("Wiki documentation lives"),
      })
    )
    expect(aiProvider.createChatResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('"wiki.manage":false'),
      })
    )
    const calls = JSON.stringify(
      aiProvider.createChatResponseWithOpenAI.mock.calls
    )
    expect(calls).toContain(
      "Cite each page once, naturally at its first mention"
    )
    expect(calls).toContain(
      "Never repeat a page link or use numbered citation markers"
    )
    expect(calls).not.toContain("cite sources using bracket numbers")
  })
  it("omits Bridge from curated site pages and archives the old entry", async () => {
    const { indexCuratedSiteKnowledge } = await import("@/lib/wiki-ai")
    const sources: Array<Record<string, unknown>> = []
    const updates: Array<Record<string, unknown>> = []
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn((source) => {
        sources.push(source)
        return chain
      }),
      single: vi.fn(async () => ({ data: { id: "source" }, error: null })),
      delete: vi.fn(() => chain),
      update: vi.fn((update) => {
        updates.push(update)
        return chain
      }),
      insert: vi.fn(async () => ({ error: null })),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }
    await indexCuratedSiteKnowledge({ from: vi.fn(() => chain) } as never)
    expect(sources.some((source) => source.url === "/bridge")).toBe(false)
    expect(sources.some((source) => source.url === "/home")).toBe(true)
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "archived" })
    )
    expect(chain.eq).toHaveBeenCalledWith("source_id", "bridge")
  })

  it("indexes draft pages and assets as active while preserving visibility metadata", async () => {
    const { indexWikiPage, indexWikiAsset } = await import("@/lib/wiki-ai")
    const sources: Array<Record<string, unknown>> = []
    const chunks: unknown[] = []
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn((row) => {
        sources.push(row)
        return chain
      }),
      single: vi.fn(async () => ({
        data: { id: "indexed-source" },
        error: null,
      })),
      delete: vi.fn(() => chain),
      update: vi.fn(() => chain),
      insert: vi.fn(async (rows) => {
        chunks.push(...rows)
        return { error: null }
      }),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }
    const supabase = { from: vi.fn(() => chain) }
    await indexWikiPage({
      supabase: supabase as never,
      node: { id: "draft-page", title: "Draft SOP", status: "draft" } as never,
      revision: { id: "revision", plain_text: "Draft procedure" } as never,
      path: "1/22",
      isPublished: false,
    })
    await indexWikiAsset({
      supabase: supabase as never,
      asset: {
        id: "asset",
        node_id: "draft-page",
        status: "active",
        file_name: "draft.md",
        extracted_text: "Draft attachment",
      } as never,
      pageTitle: "Draft SOP",
      pagePath: "1/22",
      isPagePublished: false,
    })
    expect(sources.map((source) => source.status)).toEqual(["active", "active"])
    expect(sources.map((source) => source.url)).toEqual([
      "/wiki/1/22",
      "/wiki/1/22",
    ])
    expect(sources[1].metadata).toMatchObject({
      nodeId: "draft-page",
      pagePath: "1/22",
    })
    expect(sources[0].metadata).toMatchObject({
      nodeId: "draft-page",
      path: "1/22",
      status: "draft",
      isPublished: false,
    })
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("Draft procedure"),
        }),
        expect.objectContaining({
          content: expect.stringContaining("Draft attachment"),
        }),
      ])
    )
  })

  it("retries an interrupted reindex and embeds heading chunks on save", async () => {
    const { indexWikiPage } = await import("@/lib/wiki-ai")
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "fake-embedding")
    aiProvider.createEmbeddingsWithOpenAI.mockImplementation(async () => [
      [0.1, 0.2, 0.3],
      [0.1, 0.2, 0.3],
    ])
    let hash: string | null = null
    let fail = true
    const written: Array<Record<string, unknown>> = []
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: hash ? { id: "source", content_hash: hash } : null,
        error: null,
      })),
      upsert: vi.fn((row: { content_hash: string }) => {
        hash = row.content_hash
        return chain
      }),
      single: vi.fn(async () => ({ data: { id: "source" }, error: null })),
      delete: vi.fn(() => chain),
      update: vi.fn((row: { content_hash: string }) => {
        hash = row.content_hash
        return chain
      }),
      insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
        if (fail) {
          fail = false
          return { error: { message: "interrupted" } }
        }
        written.push(...rows)
        return { error: null }
      }),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }
    const params = {
      supabase: { from: vi.fn(() => chain) } as never,
      node: { id: "page", title: "Guide", status: "published" } as never,
      revision: {
        id: "revision",
        plain_text: "Funding\nInstructions",
        blocks: [
          { type: "heading", props: { level: 1 }, content: "Funding" },
          { type: "paragraph", content: "Instructions" },
        ],
      } as never,
      path: "1/2",
    }
    await expect(indexWikiPage(params)).rejects.toThrow("interrupted")
    expect(hash).toMatch(/^pending:/)
    await indexWikiPage(params)
    expect(written).toContainEqual(
      expect.objectContaining({
        content: "Funding\n\nInstructions",
        metadata: expect.objectContaining({ headingPath: ["Funding"] }),
        embedding: [0.1, 0.2, 0.3],
      })
    )
    expect(hash).not.toMatch(/^pending:/)
    await indexWikiPage(params)
    expect(chain.insert).toHaveBeenCalledTimes(2)
    vi.unstubAllEnvs()
  })

  it("keeps imported drafts out of the index until they are published", async () => {
    const { indexWikiPage } = await import("@/lib/wiki-ai")
    const sources: Array<Record<string, unknown>> = []
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn((row) => {
        sources.push(row)
        return chain
      }),
      single: vi.fn(async () => ({
        data: { id: "indexed-source" },
        error: null,
      })),
      delete: vi.fn(() => chain),
      insert: vi.fn(async () => ({ error: null })),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }
    const supabase = { from: vi.fn(() => chain) }

    await indexWikiPage({
      supabase: supabase as never,
      node: {
        id: "imported-draft",
        title: "Imported SOP",
        status: "draft",
        import_content_hash: "hash",
      } as never,
      revision: { id: "revision", plain_text: "Draft procedure" } as never,
      path: "imported-draft",
      isPublished: false,
    })

    expect(sources[0]?.status).toBe("archived")
  })
})
