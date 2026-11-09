import { describe, expect, it } from "vitest"

import { buildWikiPlainDiff } from "@/lib/wiki-diff"
import { formatWikiRestoreChangeNote } from "@/lib/wiki"

describe("plain-language wiki diff", () => {
  it("says when nothing changed", () => {
    const diff = buildWikiPlainDiff(
      "Keep the lock steps.",
      "Keep the lock steps."
    )

    expect(diff.headline).toBe(
      "Nothing changes. The page stays exactly the same."
    )
    expect(diff.changeCount).toBe(0)
    expect(diff.showMarkup).toBe(false)
    expect(diff.headline.toLowerCase()).not.toContain("hunk")
    expect(diff.headline.toLowerCase()).not.toContain("diff")
  })

  it("marks a swapped word in one line", () => {
    const diff = buildWikiPlainDiff(
      "Keep the lock steps.\nSend the file today.",
      "Keep the lock steps.\nSend the file tomorrow."
    )

    expect(diff.headline).toBe("1 change")
    expect(diff.changeCount).toBe(1)
    const changed = diff.segments.find(
      (segment) =>
        segment.type === "text" &&
        segment.pieces.some((piece) => piece.kind !== "stayed")
    )
    expect(changed).toMatchObject({
      type: "text",
      pieces: [
        { kind: "stayed", text: "Send the file" },
        { kind: "removed", text: "today." },
        { kind: "added", text: "tomorrow." },
      ],
    })
  })

  it("shows a heavily rewritten sentence as two whole lines", () => {
    const diff = buildWikiPlainDiff(
      "Skip the notary journal when the borrower is in a hurry. Then count the pages.",
      "Write the notary journal entry before the borrower leaves. Then count the pages."
    )
    const changed = diff.segments.filter((segment) => segment.type === "text")
    expect(changed[0]?.pieces).toEqual([
      {
        kind: "removed",
        text: "Skip the notary journal when the borrower is in a hurry. Then count the pages.",
      },
    ])
    expect(changed[1]?.pieces).toEqual([
      {
        kind: "added",
        text: "Write the notary journal entry before the borrower leaves. Then count the pages.",
      },
    ])
  })

  it("keeps a very different line whole instead of marking every word", () => {
    const diff = buildWikiPlainDiff(
      "Send the file today.",
      "Escrow holdback is 10 percent."
    )

    expect(diff.changeCount).toBe(1)
    expect(diff.segments).toEqual([
      {
        type: "text",
        pieces: [{ kind: "removed", text: "Send the file today." }],
      },
      {
        type: "text",
        pieces: [{ kind: "added", text: "Escrow holdback is 10 percent." }],
      },
    ])
  })

  it("explains an empty page in plain language", () => {
    expect(buildWikiPlainDiff("", "Add the escrow note.").headline).toBe(
      "This page is empty now. All of this will be put in."
    )
    const emptied = buildWikiPlainDiff("Remove this page.", "")
    expect(emptied.headline).toBe(
      "Everything on this page will be taken out. Nothing will be left."
    )
    expect(emptied.revealTakenOut).toBe(true)
    expect(emptied.showMarkup).toBe(false)
  })

  it("folds a long unchanged stretch and keeps the change visible", () => {
    const lines = Array.from(
      { length: 20 },
      (_, index) => `Paragraph ${index + 1} stays the same.`
    )
    const after = [...lines]
    after[10] = "Paragraph 11 is brand new."
    const diff = buildWikiPlainDiff(lines.join("\n"), after.join("\n"))

    expect(diff.changeCount).toBe(1)
    expect(diff.segments.some((segment) => segment.type === "fold")).toBe(true)
    expect(
      diff.segments.some(
        (segment) =>
          segment.type === "text" &&
          segment.pieces.some((piece) => piece.text.includes("brand new"))
      )
    ).toBe(true)
  })
})

describe("non-text wiki changes", () => {
  it("does not call an unchanged page unchanged when a picture, link, or table differs", () => {
    const before = [
      {
        type: "paragraph",
        content: [
          { type: "link", href: "https://example.com/old", text: "Desk" },
        ],
      },
      { type: "image", props: { url: "/api/wiki/assets/old-picture" } },
      { type: "table", content: [[{ text: "Fee" }, { text: "10" }]] },
    ]
    const after = [
      {
        type: "paragraph",
        content: [
          { type: "link", href: "https://example.com/new", text: "Desk" },
        ],
      },
      { type: "image", props: { url: "/api/wiki/assets/new-picture" } },
      { type: "table", content: [[{ text: "Fee" }, { text: "30" }]] },
    ]
    const diff = buildWikiPlainDiff("Desk", "Desk", { before, after })

    expect(diff.headline).not.toMatch(/nothing changes/i)
    expect(
      diff.segments.map(
        (segment) => segment.type === "text" && segment.pieces[0]?.text
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("A picture changed"),
        expect.stringContaining("A link changed"),
        expect.stringContaining("A table changed"),
      ])
    )
  })

  it("says when only formatting changed", () => {
    const diff = buildWikiPlainDiff("Send the file.", "Send the file.", {
      before: [{ type: "paragraph", content: [{ text: "Send the file." }] }],
      after: [
        {
          type: "paragraph",
          content: [{ text: "Send the file.", styles: { bold: true } }],
        },
      ],
    })

    expect(diff.headline).toBe("1 change")
    expect(diff.segments[0]).toMatchObject({
      type: "text",
      pieces: [
        {
          kind: "added",
          text: expect.stringContaining("Formatting changed"),
        },
      ],
    })
  })
})

describe("formatWikiRestoreChangeNote", () => {
  it("names the older version by its timestamp", () => {
    expect(formatWikiRestoreChangeNote("2026-11-04T15:15:00.000Z")).toBe(
      "Restored from Nov 4, 2026, 3:15 PM UTC"
    )
  })
})
