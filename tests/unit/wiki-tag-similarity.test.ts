import { describe, expect, it } from "vitest"

import {
  findSimilarWikiTags,
  matchWikiTagName,
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
})
