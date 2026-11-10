import { describe, expect, it } from "vitest"

import {
  findSimilarWikiTags,
  matchWikiTagName,
  rankWikiTags,
} from "@/lib/wiki-tag-similarity"

describe("tag name similarity", () => {
  const tags = [
    "Closing",
    "Loan officer compensation",
    "Mortgage insurance",
    "Down payment assistance",
    "Debt to income",
    "Credit",
    "Assets",
  ].map((name) => ({ name }))
  it.each([
    ["Closings", "Closing", "plural of"],
    ["closing!", "Closing", "same word"],
    ["LO comp", "Loan officer compensation", "abbreviation of"],
    ["MI", "Mortgage insurance", "abbreviation of"],
    ["DPA", "Down payment assistance", "abbreviation of"],
    ["DTI", "Debt to income", "abbreviation of"],
    ["Closng", "Closing", "similar spelling"],
    ["Assets", "Credit", null],
    ["", "Closing", null],
  ])("matches %s and %s", (input, tag, reason) => {
    expect(matchWikiTagName(input!, tag!)).toBe(reason)
  })
  it("returns only matching fixture tags", () => {
    expect(
      findSimilarWikiTags("LO comp", tags).map((match) => match.tag.name)
    ).toEqual(["Loan officer compensation"])
  })
  it("ranks exact, prefix, word-prefix, spelling, then semantic matches", () => {
    const fixture = [
      "Disclosure",
      "Closing costs",
      "Loan closing",
      "Closng",
      "Closing",
      "Finance",
    ].map((name) => ({ name }))
    expect(
      rankWikiTags("Closing", fixture, [fixture[5], fixture[0]]).map(
        ({ tag, reason }) => [tag.name, reason]
      )
    ).toEqual([
      ["Closing", null],
      ["Closing costs", null],
      ["Loan closing", null],
      ["Closng", "close spelling"],
      ["Finance", "similar meaning"],
      ["Disclosure", "similar meaning"],
    ])
    expect(rankWikiTags("mortgage insurance", [{ name: "MI" }])[0].reason).toBe(
      "abbreviation"
    )
    expect(rankWikiTags("los", [{ name: "Closing" }])[0].tag.name).toBe(
      "Closing"
    )
  })
})
