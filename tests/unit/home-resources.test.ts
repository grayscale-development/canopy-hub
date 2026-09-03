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
      href: CANOPY_WIKI_URL,
      external: false,
    })
  })

  it("uses the external legacy wiki for users without beta access", () => {
    const [wikiLink] = getHelpfulResourceLinks(false)

    expect(wikiLink).toMatchObject({
      href: LEGACY_TRAINING_WIKI_URL,
      external: true,
    })
  })
})
