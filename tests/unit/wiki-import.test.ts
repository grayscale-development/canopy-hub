import { describe, expect, it } from "vitest"

import {
  createUniqueWikiImportSlug,
  createWikiImportContentHash,
  createWikiImportDraft,
  isFaithfulWikiImportOutput,
  markdownToWikiImportBlocks,
  normalizeWikiImportText,
} from "@/lib/wiki-import"

describe("Wiki import core", () => {
  it("normalizes equivalent source text before hashing", () => {
    expect(normalizeWikiImportText("  One\r\n\r\n\r\nTwo  ")).toBe("One\n\nTwo")
    expect(createWikiImportContentHash("One\r\nTwo")).toBe(
      createWikiImportContentHash("One\nTwo")
    )
  })

  it("uses AI formatting only when every source token is retained", () => {
    const source = "Review file 123 before submitting to Ada."
    expect(
      isFaithfulWikiImportOutput(
        source,
        "## Review\n\nReview file 123 before submitting to Ada."
      )
    ).toBe(true)
    expect(
      isFaithfulWikiImportOutput(source, "Review file before submitting.")
    ).toBe(false)

    const draft = createWikiImportDraft({
      text: source,
      fileName: "review-policy.pdf",
      aiOutput: {
        title: "Review Policy",
        tags: ["Operations", "Review"],
        markdown: "Review file before submitting.",
      },
    })
    expect(draft.usedAi).toBe(false)
    expect(draft.markdown).toBe(source)
    expect(draft.title).toBe("Review Policy")
    expect(draft.tags).toEqual(["Operations", "Review"])
  })

  it("turns clean Markdown into editor blocks without losing list content", () => {
    expect(
      markdownToWikiImportBlocks(
        "## Steps\n\n1. Open the loan\n2. Save it\n\n- Tell Ada"
      )
    ).toEqual([
      { type: "heading", props: { level: 2 }, content: "Steps" },
      { type: "numberedListItem", content: "Open the loan" },
      { type: "numberedListItem", content: "Save it" },
      { type: "bulletListItem", content: "Tell Ada" },
    ])
  })

  it("creates a readable collision-free slug", () => {
    expect(
      createUniqueWikiImportSlug("Loan Review", [
        "loan-review",
        "loan-review-2",
      ])
    ).toBe("loan-review-3")
  })
})
