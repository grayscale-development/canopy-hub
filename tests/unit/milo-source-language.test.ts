import { beforeEach, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => [] as { instructions: string }[])
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/provider", () => ({
  getChatModel: () => "fake-chat",
  createAgentResponseWithOpenAI: async (request: { instructions: string }) => {
    calls.push(request)
    return {
      output_text: JSON.stringify({
        facts: ["Cut-off moves to 2:00 PM Arizona time."],
        chatter: "",
        unclear: [],
        source: { sender: "Dana", date: "Nov 20, 2026", subject: "" },
      }),
    }
  },
}))

import {
  answerMiloSourceQuestion,
  extractMiloFacts,
  MILO_SOURCE_LANGUAGE_RULE,
} from "@/lib/milo/source-workflow"

beforeEach(() => {
  calls.length = 0
})

it("tells the model to keep extracted facts in the source's language", async () => {
  await extractMiloFacts("Hi team,\nThe cut-off moves to 2:00 PM.\nThanks")
  expect(calls[0]?.instructions).toContain(MILO_SOURCE_LANGUAGE_RULE)
  expect(MILO_SOURCE_LANGUAGE_RULE).toMatch(/English source, write in English/)
})

it("keeps source answers in the source's language", async () => {
  await answerMiloSourceQuestion("The cut-off moves to 2:00 PM.", "When?")
  expect(calls[0]?.instructions).toContain(MILO_SOURCE_LANGUAGE_RULE)
})
