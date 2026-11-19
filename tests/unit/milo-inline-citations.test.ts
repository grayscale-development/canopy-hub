import { describe, expect, it } from "vitest"
import {
  inlineCitations,
  INLINE_CITATION_INSTRUCTIONS,
} from "@/lib/milo/inline-citations"

const citations = [
  { title: "Overview", url: "/wiki/1/16" },
  { title: "Funding Checklist", url: "/wiki/1/16/17" },
  { title: "Funding Checklist", url: "/wiki/1/16/17" },
  { title: "Closing Desk Notes", url: "/wiki/1/16/18" },
  {
    title: "Tag: Hub Process (Global)",
    url: "/wiki/tags?tag=Hub%20Process#tag-hub-process",
  },
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

  it("cleans the staging-shaped funding answer without trailing citations", () => {
    const answer = `The funding process is documented in Funding Checklist: /wiki/1/16/17. [2]
Before a loan can fund, the closer must: [2]
- confirm the wire instructions on file match the title company callback [3]
- verify the CD was signed [2]
- check that the hazard insurance binder lists Canopy Mortgage as mortgagee [3]
If any of those three items is missing, pause funding and notify the processor in the loan file notes. [2]
There's also a related page, Closing Desk Notes: /wiki/1/16/18, with the same funding paragraph. [4]
Funding Checklist: /wiki/1/16/17 and [Closing Desk Notes: /wiki/1/16/18](/wiki/1/16/18) contain more details. [3] [4]
- [Hub Process](/wiki/tags?tag=Hub%20Process)`
    const result = inlineCitations(answer, citations)
    expect(result).toContain(
      "documented in [Funding Checklist](/wiki/1/16/17)."
    )
    expect(result).toContain(
      "related page, [Closing Desk Notes](/wiki/1/16/18),"
    )
    expect(
      result.match(/\[Funding Checklist\]\(\/wiki\/1\/16\/17\)/g)
    ).toHaveLength(1)
    expect(
      result.match(/\[Closing Desk Notes\]\(\/wiki\/1\/16\/18\)/g)
    ).toHaveLength(1)
    expect(result).toContain("the closer must:\n- confirm")
    expect(result).toContain("callback\n- verify the CD was signed\n- check")
    expect(result).toContain("Funding Checklist and Closing Desk Notes contain")
    expect(result).toContain(
      "[Hub Process](/wiki/tags?tag=Hub%20Process#tag-hub-process)"
    )
    expect(result).not.toMatch(/\[\d+\]/)
    expect(result.replace(/\]\([^)]+\)/g, "]")).not.toContain("/wiki/")
    expect(inlineCitations(result, citations)).toBe(result)
  })

  it("links the first natural mention and drops later links and markers", () => {
    const answer =
      "Read Funding Checklist. [2] Funding Checklist has steps. [3] See [Funding Checklist](/wiki/1/16/17). [2]"
    expect(inlineCitations(answer, citations)).toBe(
      "Read [Funding Checklist](/wiki/1/16/17). Funding Checklist has steps. See Funding Checklist."
    )
  })

  it("links only returned tags on their first mention using the canonical scoped URL", () => {
    const answer =
      "Hub Process helps. [Hub Process](/wiki/tags?tag=Hub%20Process) and [Hub Process](/wiki/tags?tag=Hub%20Process#tag-hub-process) help. [Unknown](/wiki/tags?tag=Unknown) is unverified."
    expect(inlineCitations(answer, citations)).toBe(
      "[Hub Process](/wiki/tags?tag=Hub%20Process#tag-hub-process) helps. Hub Process and Hub Process help. Unknown is unverified."
    )
    expect(inlineCitations("Hub Process", [])).toBe("Hub Process")
    expect(
      inlineCitations(
        '[Unknown](</wiki/tags?tag=Unknown>) and [Other](https://example.com/wiki/tags?tag=Other "title")',
        citations
      )
    ).toBe("Unknown and Other")
  })

  it("drops markers without inventing a link when no title is mentioned", () => {
    expect(
      inlineCitations(
        "Funding steps on that page: [2]\n- Confirm the **wire instructions**. [3]",
        citations
      )
    ).toBe("Funding steps on that page:\n- Confirm the **wire instructions**.")
  })

  it("instructs the model to link each page once, naturally, without numbered markers", () => {
    expect(INLINE_CITATION_INSTRUCTIONS).toMatch(
      /each page once, naturally at its first mention/i
    )
    expect(INLINE_CITATION_INSTRUCTIONS).toMatch(
      /each wiki tag once, at its first mention/i
    )
    expect(INLINE_CITATION_INSTRUCTIONS).toMatch(
      /never repeat a page link or use numbered citation markers/i
    )
    expect(INLINE_CITATION_INSTRUCTIONS).toMatch(
      /never append a bare page name or path/i
    )
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
