import { describe, expect, it } from "vitest"
import { getWikiLandingTags, type WikiTagRow } from "@/lib/wiki"

describe("landing tag filters", () => {
  it("uses assignments and permits only global and current section tags", () => {
    const tags: WikiTagRow[] = [
      { id: "g", name: "Global", scope: "global", section_id: null },
      { id: "a", name: "Shared", scope: "section", section_id: "a" },
      { id: "b", name: "Shared", scope: "section", section_id: "b" },
      { id: "unused", name: "Unused", scope: "section", section_id: "a" },
    ]
    const assignments = [
      { node_id: "page", tag_id: "g" },
      { node_id: "page", tag_id: "a" },
      { node_id: "page", tag_id: "b" },
    ]
    expect(
      getWikiLandingTags(tags, "a", ["page"], assignments).map((tag) => tag.id)
    ).toEqual(["g", "a"])
    expect(
      getWikiLandingTags(tags, "b", ["page"], assignments).map((tag) => tag.id)
    ).toEqual(["g", "b"])
    expect(getWikiLandingTags(tags, "a", ["other"], assignments)).toEqual([])
  })
})
