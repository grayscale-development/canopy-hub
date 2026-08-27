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
  }>
}

const aiProvider = vi.hoisted(() => ({
  createEmbeddingsWithOpenAI: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  createChatResponseWithOpenAI: vi.fn(async () => ({
    output_text: "Use /wiki/canopy-wiki [1].",
  })),
  createAgentResponseWithOpenAI: vi.fn(async (): Promise<unknown> => {
    throw new Error("agent unavailable")
  }),
  getChatModel: vi.fn(() => "fake-chat"),
}))

vi.mock("@/lib/ai/provider", () => aiProvider)

const miloMcp = vi.hoisted(() => ({
  MILO_MCP_TOOLS: [
    { name: "knowledge_search", description: "Search knowledge." },
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

  it("answers short greetings without retrieving knowledge or calling OpenAI", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        supabase: supabase as never,
        question: "hi milo",
      })
    ).resolves.toEqual({
      answer: "Howdy! How can I help with Canopy Hub?",
      model: null,
      citations: [],
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
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
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("does not fall back to unrelated RAG sources when employee data is empty", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({
        supabase: supabase as never,
        question: "who is aaron brown",
      })
    ).resolves.toEqual({
      answer:
        "I do not have employee rows available in the People directory right now, so I cannot look up aaron brown. Open [People](/people) after the employee data sync is populated.",
      model: null,
      citations: [],
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
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
                source_url:
                  "/wiki/nano-wiki/processing/how-to-send-a-borrowers-authorization",
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
      supabase: supabase as never,
      question: "tell me about borrower auth",
    })

    expect(result.answer).toBe("Use /wiki/canopy-wiki [1].")
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
        supabase: supabase as never,
        question: "what documents are available",
      })
    ).resolves.toEqual({
      answer: "Aaron Brown is listed in People.",
      model: "fake-chat",
      citations: [],
      metadata: {
        mode: "agentic_mcp",
        toolCalls: [
          { toolName: "knowledge_search", ok: true, error: undefined },
          { toolName: "knowledge_search", ok: true, error: undefined },
          { toolName: "db_search", ok: true, error: undefined },
          { toolName: "storage_list", ok: true, error: undefined },
          { toolName: "storage_list", ok: true, error: undefined },
        ],
      },
    })
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "storage_list",
      expect.objectContaining({ bucket: "Newsletters" })
    )
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
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
                  source_url: "/wiki/canopy-wiki/lo-loa/cancel-a-loan",
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
                url: "/wiki/canopy-wiki/lo-loa/cancel-a-loan",
                snippet: "Policy guidance from the Wiki.",
                sourceType: "wiki_page",
              },
              {
                title: "Cancel a Loan",
                url: "/wiki/canopy-wiki/lo-loa/cancel-a-loan",
                snippet: "HOW TO CANCEL A LOAN: Step 1...",
                sourceType: "wiki_page",
              },
              {
                title: "Cancel a Loan",
                url: "/wiki/canopy-wiki/lo-loa/cancel-a-loan",
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
      output_text:
        "Use the Cancel a Loan wiki page for the cancellation workflow.",
      output: [],
    })
    const supabase = {
      rpc: vi.fn(),
    }

    const result = await answerKnowledgeQuestion({
      supabase: supabase as never,
      question:
        "how do i cancel a loan, give me a step by step on how to do it",
    })

    expect(result).toMatchObject({
      answer: "Use the Cancel a Loan wiki page for the cancellation workflow.",
      model: "fake-chat",
      citations: [
        {
          title: "Cancel a Loan",
          url: "/wiki/canopy-wiki/lo-loa/cancel-a-loan",
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
      expect.objectContaining({ query: expect.stringContaining("cancel") })
    )
    expect(miloMcp.callMiloMcpTool).toHaveBeenCalledWith(
      "db_search",
      expect.objectContaining({ relation: "public.wiki_nodes" })
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
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("retrieves keyword and vector chunks, calls the fake provider, and returns citations", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
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
                source_url: "/wiki/canopy-wiki",
                content: "Wiki documentation lives at /wiki/canopy-wiki.",
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
              source_url: "/wiki/canopy-wiki",
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
        supabase: supabase as never,
        question: "Where is the Wiki?",
      })
    ).resolves.toMatchObject({
      answer: "Use /wiki/canopy-wiki [1].",
      model: "fake-chat",
      citations: [
        {
          knowledgeSourceId: "source-1",
          knowledgeChunkId: "chunk-1",
          title: "Wiki",
          url: "/wiki/canopy-wiki",
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
  })
})
