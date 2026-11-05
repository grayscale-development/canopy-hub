import { describe, expect, it } from "vitest"

import { deterministicWikiImportOutput } from "@/lib/ai/wiki-import-test-provider"
import { blockNoteToPlainText } from "@/lib/wiki"
import { createWikiImportDraft } from "@/lib/wiki-import"

describe("reviewed long page blocks", () => {
  it("keeps the reviewed sentence, link, and table in the saved blocks", () => {
    const lines = Array.from(
      { length: 40 },
      (_, index) => `Procedure step ${index + 1} stays in place.`
    )
    const changed = lines.map((line, index) =>
      index === 20 ? "Procedure step 21 now says LONGPAGE-TOKEN." : line
    )
    changed.push("Send the file")
    const text = `${changed.join("\n\n")}\n\n[Send the file](https://example.com/new-guide)\n\n![Reviewed chart](https://example.com/chart.png)\n\n| Fee | Amount |\n| --- | --- |\n| Review | 125 |`
    const draft = createWikiImportDraft({
      text,
      fileName: "Pasted text",
      aiOutput: deterministicWikiImportOutput(text, "Pasted text"),
    })
    const rendered = blockNoteToPlainText(draft.blocks)

    expect(rendered).toContain("LONGPAGE-TOKEN")
    expect(rendered).toContain("Send the file")
    expect(rendered).toContain("Fee")
    expect(rendered).toContain("125")
    expect(draft.blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining(["table", "image"])
    )
    const table = draft.blocks.find((block) => block.type === "table")
    expect(table).toMatchObject({
      children: [],
      content: { type: "tableContent", columnWidths: [undefined, undefined] },
    })
    expect(JSON.stringify(draft.blocks)).toContain(
      "https://example.com/new-guide"
    )
  })
})
