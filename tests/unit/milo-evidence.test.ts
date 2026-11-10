import { describe, expect, it } from "vitest"
import {
  checkAnswer,
  hasRetrievalConfidence,
  sourceUrl,
} from "@/lib/milo/evidence"

const source = {
  title: "Refunds",
  url: "/wiki/1/2",
  sourceType: "wiki_page",
  headingPath: ["Servicing", "Refund status"],
  snippet:
    "Servicing > Refund status\n\nTrack returned checks in the refund ledger. Contact the servicing team.",
}

describe("Milo evidence", () => {
  it("uses exact sentences and labels unsupported paragraphs", () => {
    const result = checkAnswer(
      "Track returned checks in the refund ledger.\n\nThe CEO approves every refund.",
      [source]
    )
    expect(result.answer).toBe(
      "Track returned checks in the refund ledger. [1]\n\nThe CEO approves every refund. (Not found in the wiki.)"
    )
    expect(result.citations).toMatchObject([
      {
        url: "/wiki/1/2#servicing-refund-status",
        snippet: "Track returned checks in the refund ledger.",
      },
    ])
  })
  it("labels an unsupported sentence even inside a supported paragraph", () => {
    const result = checkAnswer(
      "Track returned checks in the refund ledger. The CEO approves every refund.",
      [source]
    )
    expect(result.answer).toBe(
      "Track returned checks in the refund ledger. [1] The CEO approves every refund. (Not found in the wiki.)"
    )
  })
  it("rejects unrelated retrieval and preserves closest pages", () => {
    expect(
      hasRetrievalConfidence("Where are returned checks tracked?", [source])
    ).toBe(true)
    expect(
      hasRetrievalConfidence("What is the cafeteria menu?", [source])
    ).toBe(false)
    expect(sourceUrl(source)).toBe("/wiki/1/2#servicing-refund-status")
  })
  it("does not cite a source for changed numbers or negation", () => {
    expect(
      checkAnswer("Do not track returned checks in the refund ledger.", [
        source,
      ]).citations
    ).toEqual([])
    expect(
      checkAnswer("Track 20 returned checks in the refund ledger.", [source])
        .citations
    ).toEqual([])
  })
})
