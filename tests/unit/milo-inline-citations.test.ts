import { describe, expect, it } from "vitest"
import { inlineCitations } from "@/lib/milo/inline-citations"

const citations = [
  { title: "Overview", url: "/wiki/1/16" },
  { title: "Funding Checklist", url: "/wiki/1/16/17" },
  { title: "Funding Checklist", url: "/wiki/1/16/17" },
  { title: "Closing Desk Notes", url: "/wiki/1/16/18" },
]

describe("inline citations", () => {
  it.each([
    "Funding Checklist: /wiki/1/16/17",
    "Funding Checklist: `/wiki/1/16/17`",
    "**Funding Checklist**: `/wiki/1/16/17`",
    "**Funding Checklist: /wiki/1/16/17**",
    "[Funding Checklist: /wiki/1/16/17](/wiki/1/16/17)",
    "[`/wiki/1/16/17`](/wiki/1/16/17)",
    "`/wiki/1/16/17`",
  ])("renders the page name for %s", (answer) => {
    expect(inlineCitations(answer, citations)).toBe(
      "[Funding Checklist](/wiki/1/16/17)"
    )
  })

  it("cleans the funding fixture and inserts a source only for an unlinked sentence", () => {
    const answer = `The best match is the published wiki page **Funding Checklist: /wiki/1/16/17**. [2]
Funding steps on that page: [2]
- Confirm the **wire instructions**. [3]
Related page:
- **Closing Desk Notes**: \`/wiki/1/16/18\` contains closing notes. [4]
- [Hub Process](/wiki/tags?tag=Hub%20Process)`
    const result = inlineCitations(answer, citations)
    expect(result).toContain("[Funding Checklist](/wiki/1/16/17)")
    expect(result).toContain("[Closing Desk Notes](/wiki/1/16/18)")
    expect(result).toContain(
      "Confirm the **wire instructions** [Funding Checklist](/wiki/1/16/17)."
    )
    expect(result).toContain("[Hub Process](/wiki/tags?tag=Hub%20Process)")
    expect(result).not.toMatch(/\[\d+\]/)
    expect(result).not.toContain("**Funding Checklist")
    expect(result.replace(/\]\([^)]+\)/g, "]")).not.toContain("/wiki/")
    expect(inlineCitations(result, citations)).toBe(result)
  })

  it("cleans an existing named link without needing a citation", () => {
    expect(
      inlineCitations("[Funding Checklist: /wiki/1/16/17](/wiki/1/16/17)", [])
    ).toBe("[Funding Checklist](/wiki/1/16/17)")
    expect(
      inlineCitations("Open /wiki.", [{ title: "Wiki", url: "/wiki" }])
    ).toBe("Open [Wiki](/wiki).")
  })

  it("does not invent inaccessible sources or add links for multiple markers", () => {
    expect(
      inlineCitations("Details [1] and [2].", [
        { title: "", url: null },
        citations[1],
      ])
    ).toBe("Details and.")
    expect(inlineCitations("Unknown [9].", citations)).toBe("Unknown.")
  })
})
