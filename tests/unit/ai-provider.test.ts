import { afterEach, describe, expect, it, vi } from "vitest"

const createResponse = vi.hoisted(() => vi.fn())

vi.mock("openai", () => ({
  default: class {
    responses = { create: createResponse }
  },
}))

import {
  createChatResponseWithOpenAI,
  streamMiloResponse,
} from "@/lib/ai/provider"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("OpenAI chat responses", () => {
  it("forwards Responses API text deltas as they arrive with cancellation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-test-key")
    async function* events() {
      yield { type: "response.output_text.delta", delta: "First " }
      yield { type: "response.output_text.delta", delta: "second" }
      yield { type: "response.completed", response: { output: [] } }
    }
    createResponse.mockResolvedValueOnce(events())
    const signal = new AbortController().signal
    const tokens: string[] = []
    const result = await streamMiloResponse(
      {
        model: "test-model",
        input: "question",
        prompt_cache_key: "milo-agent",
        store: false,
      },
      (token) => tokens.push(token),
      signal
    )
    expect(tokens).toEqual(["First ", "second"])
    expect(result).toMatchObject({ output_text: "First second" })
    expect(createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        prompt_cache_key: "milo-agent",
        store: false,
      }),
      expect.objectContaining({ signal })
    )
  })
  it("streams the fake incrementally and stops when aborted", async () => {
    const controller = new AbortController()
    const tokens: string[] = []
    await expect(
      streamMiloResponse(
        { model: "fake-chat", input: "test" },
        (token) => {
          tokens.push(token)
          controller.abort()
        },
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(tokens).toHaveLength(1)
    expect(createResponse).not.toHaveBeenCalled()
  })
  it("forwards the stable instructions and cache key to the SDK", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-test-key")
    createResponse.mockResolvedValueOnce({ output_text: "ok" })
    await createChatResponseWithOpenAI({
      model: "fake-chat",
      instructions: "Fixed instructions",
      input: "Page data",
      prompt_cache_key: "wiki-alert-recommendation",
    })
    expect(createResponse).toHaveBeenCalledWith({
      model: "fake-chat",
      instructions: "Fixed instructions",
      input: "Page data",
      prompt_cache_key: "wiki-alert-recommendation",
    })
  })
})
