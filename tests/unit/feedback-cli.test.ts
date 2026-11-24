import { describe, expect, it } from "vitest"

import { parseCommand } from "../../scripts/feedback"

describe("feedback CLI", () => {
  it("parses the show, link, and status commands without credentials", () => {
    const url =
      "http://localhost:3000/settings/feedback?item=8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9"
    expect(parseCommand(["show", url])).toEqual({ action: "show", url })
    expect(
      parseCommand([
        "link",
        url,
        "--issue",
        "https://github.com/grayscale-development/canopy-hub/issues/254",
      ])
    ).toMatchObject({
      action: "link",
      issueUrl: expect.stringContaining("/254"),
    })
    expect(
      parseCommand(["status", url, "--set", "resolved", "--env", "dev"])
    ).toMatchObject({
      action: "status",
      status: "resolved",
      environment: "dev",
    })
  })
})
