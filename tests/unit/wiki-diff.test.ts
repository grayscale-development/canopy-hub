import { describe, expect, it } from "vitest"

import { buildWikiPlainDiff } from "@/lib/wiki-diff"
import { formatWikiRestoreChangeNote } from "@/lib/wiki"

describe("plain-language wiki diff", () => {
  it("says when nothing changed", () => {
    const diff = buildWikiPlainDiff(
      "Keep the lock steps.",
      "Keep the lock steps."
    )

    expect(diff.summary).toBe(
      "Nothing changed. These two versions use the same words."
    )
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.stayed).toEqual(["Keep the lock steps."])
  })

  it("separates removed words, added words, and lines that stayed", () => {
    const diff = buildWikiPlainDiff(
      "Keep the lock steps.\nSend the file today.",
      "Keep the lock steps.\nSend the file tomorrow."
    )

    expect(diff.removed).toEqual(["today."])
    expect(diff.added).toEqual(["tomorrow."])
    expect(diff.stayed).toEqual(["Keep the lock steps."])
    expect(diff.summary).toBe(
      "1 part was removed. 1 part was added. 1 part stayed the same."
    )
    expect(diff.summary.toLowerCase()).not.toContain("hunk")
    expect(diff.summary.toLowerCase()).not.toContain("diff")
  })

  it("explains an empty page in plain language", () => {
    expect(buildWikiPlainDiff("", "Add the escrow note.").summary).toBe(
      "This version is empty right now. Everything below will be added."
    )
    expect(buildWikiPlainDiff("Remove this page.", "").summary).toBe(
      "Everything below will be removed. The result is empty."
    )
  })
})

describe("formatWikiRestoreChangeNote", () => {
  it("names the older version by its timestamp", () => {
    expect(formatWikiRestoreChangeNote("2026-11-04T15:15:00.000Z")).toBe(
      "Restored from Nov 4, 2026, 3:15 PM UTC"
    )
  })
})
