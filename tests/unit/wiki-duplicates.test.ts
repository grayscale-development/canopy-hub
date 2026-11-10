import { describe, expect, it } from "vitest"
import { createEmbeddingsWithOpenAI } from "@/lib/ai/provider"
import {
  EMBEDDING_THRESHOLD,
  NEAR_EXACT_THRESHOLD,
  nearExactScore,
  wikiPassages,
} from "@/lib/wiki-duplicates"
import pairs from "@/tests/fixtures/wiki-duplicates/pairs.json"

function metrics(actual: boolean[], expected: boolean[]) {
  const tp = actual.filter((value, i) => value && expected[i]).length
  const fp = actual.filter((value, i) => value && !expected[i]).length
  const fn = actual.filter((value, i) => !value && expected[i]).length
  return { precision: tp / (tp + fp), recall: tp / (tp + fn) }
}

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0)
  return (
    dot /
    Math.sqrt(
      a.reduce((sum, value) => sum + value * value, 0) *
        b.reduce((sum, value) => sum + value * value, 0)
    )
  )
}

describe("duplicate matching fixture", () => {
  it("reports the measured lexical and fake-vector precision and recall", async () => {
    const previous = process.env.OPENAI_EMBEDDING_MODEL
    process.env.OPENAI_EMBEDDING_MODEL = "fake-embedding"
    try {
      const examples = pairs.filter((pair) => pair.label !== "boilerplate")
      const embeddings = await createEmbeddingsWithOpenAI(
        examples.flatMap((pair) => [pair.a, pair.b])
      )
      const lexical = examples.map(
        (pair) => nearExactScore(pair.a, pair.b) >= NEAR_EXACT_THRESHOLD
      )
      const hybrid = lexical.map(
        (value, i) =>
          value ||
          cosine(embeddings[2 * i], embeddings[2 * i + 1]) >=
            EMBEDDING_THRESHOLD
      )
      const lexicalExpected = examples.map((pair) => pair.label === "duplicate")
      const hybridExpected = examples.map(
        (pair) => pair.label === "duplicate" || pair.label === "paraphrase"
      )
      const scores = {
        lexical: metrics(lexical, lexicalExpected),
        hybrid: metrics(hybrid, hybridExpected),
      }
      expect(scores).toEqual({
        lexical: { precision: 1, recall: 1 },
        hybrid: { precision: 1, recall: 0.5 },
      })
      for (const pair of pairs.filter((pair) => pair.label === "boilerplate")) {
        expect(nearExactScore(pair.a, pair.b)).toBeGreaterThanOrEqual(
          NEAR_EXACT_THRESHOLD
        )
      }
    } finally {
      if (previous === undefined) delete process.env.OPENAI_EMBEDDING_MODEL
      else process.env.OPENAI_EMBEDDING_MODEL = previous
    }
  })
  it("visits nested blocks once and skips headings and short text", () => {
    const blocks = [
      {
        id: "head",
        type: "heading",
        content: [
          { text: "A long heading that is not a passage despite its length" },
        ],
      },
      {
        id: "outer",
        type: "paragraph",
        content: [
          {
            text: "A long parent paragraph that should be checked independently.",
          },
        ],
        children: [
          {
            id: "child",
            type: "bulletListItem",
            content: [
              {
                text: "A nested item with enough meaningful content to check independently.",
              },
            ],
          },
          { id: "tiny", type: "paragraph", content: [{ text: "Short" }] },
        ],
      },
    ]
    expect(wikiPassages(blocks).map((p) => p.blockId)).toEqual([
      "outer",
      "child",
    ])
  })
})
