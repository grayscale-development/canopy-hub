import { describe, expect, it } from "vitest"
import { followUpRetrievalQuery, trimMiloHistory } from "@/lib/milo/history"
import { splitSource } from "@/lib/milo/source-workflow"

describe("Milo conversation history", () => {
  it("keeps the newest six text turns within the character budget and omits errors", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `${index}:` + "x".repeat(1600),
    }))
    const history = trimMiloHistory([
      ...rows,
      { role: "assistant", content: "error", metadata: { error: true } },
      { role: "assistant", content: "", metadata: { stopped: true } },
    ])
    expect(
      history.map((turn) => turn.content.length).reduce((a, b) => a + b, 0)
    ).toBe(4000)
    expect(history.at(-1)?.content).toHaveLength(1500)
    expect(history.every((turn) => turn.content.length <= 1500)).toBe(true)
    expect(history).not.toContainEqual(
      expect.objectContaining({ content: "error" })
    )
  })

  it("combines short or cued follow-ups with the most recent user question", () => {
    const history = [
      { role: "user" as const, content: "Explain conventional loans" },
      { role: "assistant" as const, content: "Details" },
    ]
    expect(followUpRetrievalQuery("What about VA loans?", history)).toBe(
      "Explain conventional loans\nWhat about VA loans?"
    )
    expect(
      followUpRetrievalQuery(
        "And explain the other options that are available to borrowers",
        history
      )
    ).toContain("Explain conventional loans")
    expect(
      followUpRetrievalQuery(
        "What are all the requirements for an entirely different product?",
        history
      )
    ).toBe("What are all the requirements for an entirely different product?")
  })
})

describe("Milo source detection", () => {
  it("treats short two-line questions as questions", () => {
    expect(
      splitSource("What must the closer confirm\nbefore funding?", false)
        .hasSource
    ).toBe(false)
  })
  it("recognizes files, email headers, long text and multi-line source material", () => {
    expect(splitSource("question", true).hasSource).toBe(true)
    expect(splitSource("Subject: update", false).hasSource).toBe(true)
    expect(splitSource("Update this page\nFrom: Alex", false).hasSource).toBe(
      true
    )
    expect(splitSource("x".repeat(501), false).hasSource).toBe(true)
    expect(splitSource("one\ntwo\nthree", false).hasSource).toBe(true)
    expect(
      splitSource("x".repeat(150) + "\n" + "y".repeat(140), false).hasSource
    ).toBe(true)
  })
})
