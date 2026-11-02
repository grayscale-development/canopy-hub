import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { extractWikiDocumentText } from "@/lib/wiki-extract"
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

  it("turns headings, lists, tables, bold text, and links into editor blocks", () => {
    expect(
      markdownToWikiImportBlocks(
        "## Steps\n\n1. Open the loan\n2. Save it\n\n- Tell **Ada** at [Canopy](https://canopy.example)\n\n| Section | Items |\n| --- | --- |\n| Products | **538** |"
      )
    ).toEqual([
      { type: "heading", props: { level: 2 }, content: "Steps" },
      { type: "numberedListItem", content: "Open the loan" },
      { type: "numberedListItem", content: "Save it" },
      {
        type: "bulletListItem",
        content: [
          { type: "text", text: "Tell ", styles: {} },
          { type: "text", text: "Ada", styles: { bold: true } },
          { type: "text", text: " at ", styles: {} },
          {
            type: "link",
            href: "https://canopy.example",
            content: [{ type: "text", text: "Canopy", styles: {} }],
          },
        ],
      },
      {
        type: "table",
        content: {
          type: "tableContent",
          headerRows: 1,
          rows: [
            { cells: ["Section", "Items"] },
            {
              cells: [
                "Products",
                [{ type: "text", text: "538", styles: { bold: true } }],
              ],
            },
          ],
        },
      },
    ])
  })

  it("converts bold text in paragraphs and separates consecutive headline statistics", () => {
    expect(
      markdownToWikiImportBlocks(
        "The import includes **critical records**\nthat need review.\n\n**~918** items to move\n**623** PDFs and Drive files (bulk upload)\n**228** Google Docs (convert to wiki pages)"
      )
    ).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The import includes ", styles: {} },
          { type: "text", text: "critical records", styles: { bold: true } },
          { type: "text", text: "\nthat need review.", styles: {} },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "~918", styles: { bold: true } },
          { type: "text", text: " items to move", styles: {} },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "623", styles: { bold: true } },
          {
            type: "text",
            text: " PDFs and Drive files (bulk upload)",
            styles: {},
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "228", styles: { bold: true } },
          {
            type: "text",
            text: " Google Docs (convert to wiki pages)",
            styles: {},
          },
        ],
      },
    ])
  })

  it("uses a lossless structured fallback for flattened PDF layout", () => {
    const source = `Training Wiki → Canopy Hub: what needs
to move
Items still to bring over · October 29, 2026
Items to move, by section
Section \tItems
Products & Guidelines \t538
Loan Officers & LOAs \t99
Biggest chunks: start here
Wholesale Lender Resources · 308
items
Also in the mix
36 Sheets and Slides · upload or embed
-- 1 of 2 --`
    const draft = createWikiImportDraft({
      text: source,
      fileName: "wiki-import-cid-text.pdf",
      aiOutput: {
        title: "Wrong but valid title",
        tags: [],
        markdown:
          "Everything is here: Training Wiki Canopy Hub what needs to move Items still to bring over October 29 2026 Items to move by section Section Items Products Guidelines 538 Loan Officers LOAs 99 Biggest chunks start here Wholesale Lender Resources 308 items Also in the mix 36 Sheets and Slides upload or embed.",
      },
    })

    expect(draft.usedAi).toBe(false)
    expect(draft.title).toBe("Training Wiki → Canopy Hub: what needs to move")
    expect(draft.markdown).not.toContain("-- 1 of 2 --")
    expect(
      isFaithfulWikiImportOutput(
        normalizeWikiImportText(source),
        draft.markdown,
        draft.title
      )
    ).toBe(true)
    expect(draft.markdown).toContain("| Products & Guidelines | 538 |")
    expect(draft.blocks).toContainEqual(
      expect.objectContaining({ type: "table" })
    )
    expect(draft.blocks).toContainEqual(
      expect.objectContaining({ type: "bulletListItem" })
    )
  })

  it("retains the CID fixture's headings, both tables, key figures, and notes when AI layout is rejected", async () => {
    const source = await extractWikiDocumentText(
      new File(
        [await readFile("tests/fixtures/wiki-import-cid-text.pdf")],
        "wiki-import-cid-text.pdf",
        { type: "application/pdf" }
      )
    )
    const draft = createWikiImportDraft({
      text: source,
      fileName: "wiki-import-cid-text.pdf",
      aiOutput: {
        title: "Training Wiki → Canopy Hub: what needs to move",
        tags: [],
        markdown:
          "# Training Wiki → Canopy Hub: what needs to move\n\n| Section | Items |\n| --- | --- |\n| Products & Guidelines | 538 |",
      },
    })

    expect(draft.usedAi).toBe(false)
    expect(draft.markdown).toContain("## Items to move, by section")
    expect(draft.markdown).toContain("## Biggest chunks: start here")
    expect(draft.markdown).toContain("## Also in the mix")
    expect(draft.markdown).toContain("## What was left out of these numbers")
    expect(draft.markdown).toContain("**~918** items to move")
    expect(draft.markdown).toContain(
      "**623** PDFs and Drive files (bulk upload)"
    )
    expect(draft.markdown).toContain(
      "**228** Google Docs (convert to wiki pages)"
    )
    expect(draft.markdown).toContain("| Removed | Items | Why |")
    expect(draft.markdown).toContain("**Total left out: 396**")
    expect(draft.markdown).toContain("**Without exclusions:** ~1,314 items")
    expect(draft.markdown).toContain("## Notes")
    expect(draft.markdown).toContain("- **Links, not items:**")
    expect(draft.markdown).toContain("- **Notes:**")

    const tables = draft.blocks.filter((block) => block.type === "table")
    expect(tables).toHaveLength(2)
    expect(tables[1]).toMatchObject({
      content: {
        rows: expect.arrayContaining([
          { cells: ["Removed", "Items", "Why"] },
          expect.objectContaining({
            cells: [
              "Executive Announcements",
              "353",
              "Announcements, not reference material",
            ],
          }),
        ]),
      },
    })
  })

  it("counts an H1 page title during fidelity validation but keeps it out of the body", () => {
    const source = "Quarterly Report\nSection\tItems\nProducts\t538"
    const draft = createWikiImportDraft({
      text: source,
      fileName: "quarterly-report.pdf",
      aiOutput: {
        title: "Different title",
        tags: [],
        markdown:
          "# Quarterly Report\n\n## Section\n\n| Section | Items |\n| --- | --- |\n| Products | **538** |",
      },
    })

    expect(draft.usedAi).toBe(true)
    expect(draft.title).toBe("Quarterly Report")
    expect(draft.markdown).not.toContain("# Quarterly Report")
    expect(draft.blocks[1]).toMatchObject({ type: "table" })
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
