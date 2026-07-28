import { describe, expect, it } from "vitest"

import {
  buildNewsletterFileName,
  compareNewsletterFilesDescending,
  parseNewsletterFileName,
} from "@/lib/newsletters"

describe("newsletter helpers", () => {
  it("parses canonical newsletter PDF names", () => {
    expect(parseNewsletterFileName("january 2026.pdf")).toMatchObject({
      fileName: "january 2026.pdf",
      label: "January 2026",
      month: "January",
      monthIndex: 0,
      year: 2026,
    })
  })

  it("rejects non-newsletter filenames", () => {
    expect(parseNewsletterFileName("January.pdf")).toBeNull()
    expect(parseNewsletterFileName("NotAMonth 2026.pdf")).toBeNull()
    expect(parseNewsletterFileName("January 2026.docx")).toBeNull()
  })

  it("sorts newsletters by year and month descending", () => {
    const files = [
      parseNewsletterFileName("January 2025.pdf"),
      parseNewsletterFileName("March 2026.pdf"),
      parseNewsletterFileName("February 2026.pdf"),
    ].filter((file): file is NonNullable<typeof file> => Boolean(file))

    expect(files.sort(compareNewsletterFilesDescending).map((f) => f.label)).toEqual(
      ["March 2026", "February 2026", "January 2025"]
    )
  })

  it("builds canonical newsletter filenames", () => {
    expect(buildNewsletterFileName("July", 2026)).toBe("July 2026.pdf")
  })
})
