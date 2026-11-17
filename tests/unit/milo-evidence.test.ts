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
  it("cites supported details and warns once about unsupported details", () => {
    const result = checkAnswer(
      "Track returned checks in the refund ledger.\n\nThe CEO approves every refund.",
      [source]
    )
    expect(result.answer).toBe(
      "Track returned checks in the refund ledger [Refunds](/wiki/1/2#servicing-refund-status).\n\nThe CEO approves every refund.\n\nSome details could not be verified in the wiki."
    )
    expect(result.citations).toMatchObject([
      {
        url: "/wiki/1/2#servicing-refund-status",
        snippet: "Track returned checks in the refund ledger.",
      },
    ])
  })
  it("warns about an unsupported sentence even inside a supported paragraph", () => {
    const result = checkAnswer(
      "Track returned checks in the refund ledger. The CEO approves every refund.",
      [source]
    )
    expect(result.answer).toBe(
      "Track returned checks in the refund ledger [Refunds](/wiki/1/2#servicing-refund-status). The CEO approves every refund.\n\nSome details could not be verified in the wiki."
    )
  })
  it("recognizes funding page paths, tags, and section names as references", () => {
    const funding = {
      title: "Funding Checklist",
      url: "/wiki/1/16/17",
      snippet: "Complete the funding steps.",
    }
    const closing = {
      title: "Closing Desk Notes",
      url: "/wiki/1/16/18",
      snippet: "Notes for the closing desk.",
    }
    const tag = {
      title: "Tag: Hub Process (v2.2 Test Section)",
      url: "/wiki/tags?tag=Hub%20Process",
      snippet: "Accessible pages: Funding Checklist",
      sourceType: "wiki_tag",
    }
    const answer =
      "The best match is **Funding Checklist**: `/wiki/1/16/17`.\n\n- **Closing Desk Notes**: `/wiki/1/16/18`\n- Hub Process tag, section v2.2 Test Section"
    const result = checkAnswer(
      answer,
      [funding, closing],
      [funding, closing, tag]
    )
    expect(result.answer).toBe(
      "The best match is [Funding Checklist](/wiki/1/16/17).\n\n- [Closing Desk Notes](/wiki/1/16/18)\n- Hub Process tag, section v2.2 Test Section"
    )
    expect(result.citations.map((item) => item.url)).toEqual([
      funding.url,
      closing.url,
      tag.url,
    ])
  })

  it("warns only once when several claims cannot be verified", () => {
    const result = checkAnswer(
      "The CEO approves refunds. Every refund takes 20 days.",
      [source]
    )
    expect(result.answer).toContain(
      "Some details could not be verified in the wiki."
    )
    expect(result.answer.match(/could not be verified/g)).toHaveLength(1)
    expect(result.citations).toEqual([])
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
