import { afterEach, describe, expect, it, vi } from "vitest"

const createResponse = vi.hoisted(() => vi.fn())

vi.mock("openai", () => ({
  default: class {
    responses = { create: createResponse }
  },
}))

import { createChatResponseWithOpenAI } from "@/lib/ai/provider"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("OpenAI chat responses", () => {
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
