import { beforeEach, describe, expect, it, vi } from "vitest"

const aiProvider = vi.hoisted(() => ({
  createEmbeddingsWithOpenAI: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  createChatResponseWithOpenAI: vi.fn(async () => ({ output_text: "Use /wiki/canopy-mortgage [1]." })),
  getChatModel: vi.fn(() => "fake-chat"),
}))

vi.mock("@/lib/ai/provider", () => aiProvider)

describe("wiki AI orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("answers short greetings without retrieving knowledge or calling OpenAI", async () => {
    const { answerKnowledgeQuestion } = await import("@/lib/wiki-ai")
    const supabase = {
      rpc: vi.fn(),
    }

    await expect(
      answerKnowledgeQuestion({ supabase: supabase as never, question: "hi milo" })
    ).resolves.toEqual({
      answer: "Howdy! How can I help with Canopy Hub?",
      model: null,
      citations: [],
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(aiProvider.createChatResponseWithOpenAI).not.toHaveBeenCalled()
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
                source_url: "/wiki/canopy-mortgage",
                content: "Wiki documentation lives at /wiki/canopy-mortgage.",
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
              source_url: "/wiki/canopy-mortgage",
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
      answer: "Use /wiki/canopy-mortgage [1].",
      model: "fake-chat",
      citations: [
        {
          knowledgeSourceId: "source-1",
          knowledgeChunkId: "chunk-1",
          title: "Wiki",
          url: "/wiki/canopy-mortgage",
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
