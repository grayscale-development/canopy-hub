import { describe, expect, it } from "vitest"
import { replaceDuplicateBlock } from "@/lib/wiki-duplicate-resolution"

describe("duplicate replacement", () => {
  it("replaces only the selected block while preserving nested and neighboring blocks", () => {
    const child = { id: "child", type: "paragraph", content: "Keep child" }
    const neighbor = {
      id: "neighbor",
      type: "paragraph",
      content: "Keep neighbor",
    }
    const blocks = [
      {
        id: "outer",
        type: "bulletListItem",
        content: "Duplicate",
        children: [child],
      },
      neighbor,
    ]
    const result = replaceDuplicateBlock(
      blocks,
      "outer",
      "Checklist",
      "/wiki/1/2"
    )
    expect(result).toEqual([
      {
        id: "outer",
        type: "paragraph",
        content: [
          {
            type: "link",
            href: "/wiki/1/2",
            content: [{ type: "text", text: "See Checklist", styles: {} }],
          },
        ],
        children: [child],
      },
      neighbor,
    ])
    expect(blocks[0].content).toBe("Duplicate")
    expect(
      replaceDuplicateBlock(blocks, "missing", "Checklist", "/wiki/1/2")
    ).toBeNull()
    expect(
      replaceDuplicateBlock(
        [blocks[0], blocks[0]],
        "outer",
        "Checklist",
        "/wiki/1/2"
      )
    ).toBeNull()
  })
})
