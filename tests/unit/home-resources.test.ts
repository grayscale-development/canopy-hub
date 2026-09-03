import { describe, expect, it } from "vitest"

import {
  CANOPY_WIKI_URL,
  getHelpfulResourceLinks,
  LEGACY_TRAINING_WIKI_URL,
} from "@/lib/home-resources"

describe("getHelpfulResourceLinks", () => {
  it("uses the Hub wiki for users with beta access", () => {
    const [wikiLink] = getHelpfulResourceLinks(true)

    expect(wikiLink).toMatchObject({
      href: "/wiki/canopy-wiki",
      external: false,
    })
    expect(CANOPY_WIKI_URL).toBe("/wiki/canopy-wiki")
  })

  it("uses the external legacy wiki for users without beta access", () => {
    const [wikiLink] = getHelpfulResourceLinks(false)

    expect(wikiLink).toMatchObject({
      href: "https://sites.google.com/canopymortgage.com/trainingwiki/home?authuser=0",
      external: true,
    })
    expect(LEGACY_TRAINING_WIKI_URL).toBe(
      "https://sites.google.com/canopymortgage.com/trainingwiki/home?authuser=0",
    )
  })
})
