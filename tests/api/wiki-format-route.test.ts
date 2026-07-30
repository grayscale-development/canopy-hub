import { beforeEach, describe, expect, it, vi } from "vitest"

const testState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  canManageWiki: false,
  node: { id: "node-1", type: "page" } as Record<string, unknown> | null,
  aiResponses: [
    {
      output_text: JSON.stringify({
        summary: "Improved headings and bullets.",
        sections: [
          {
            id: "section-1",
            markdown:
              "## Loan Cancellation\n\nCancel a loan by reviewing all required borrower, property, loan amount, credit score, and program information before taking action.",
          },
        ],
      }),
    },
  ] as unknown[],
  aiResponse: {
    output_text: JSON.stringify({
      summary: "Improved headings and bullets.",
      sections: [
        {
          id: "section-1",
          markdown:
            "## Loan Cancellation\n\nCancel a loan by reviewing all required borrower, property, loan amount, credit score, and program information before taking action.",
        },
      ],
    }),
  } as unknown,
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: testState.user } }),
    },
    from: () => new FakeWikiNodesQuery(),
  }),
}))

vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(async () => testState.canManageWiki),
}))

const aiProvider = vi.hoisted(() => ({
  createAgentResponseWithOpenAI: vi.fn(async () => {
    return testState.aiResponses.shift() ?? testState.aiResponse
  }),
  getFormatModel: vi.fn(() => "fake-format"),
}))

vi.mock("@/lib/ai/provider", () => aiProvider)

class FakeWikiNodesQuery {
  private filters: Array<{ key: string; value: unknown }> = []

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  async maybeSingle() {
    const node = testState.node
    const matches =
      node && this.filters.every((filter) => node[filter.key] === filter.value)

    return {
      data: matches ? node : null,
      error: null,
    }
  }
}

const originalMarkdown =
  "Cancel a loan by reviewing all required borrower, property, loan amount, credit score, and program information before taking action."
const originalSections = [{ id: "section-1", markdown: originalMarkdown }]
const originalItems = [
  { type: "text", id: "text-1", markdown: "Lock policy introduction." },
  {
    type: "media",
    id: "media-2",
    blockType: "image",
    name: "lock.png",
    caption: "Old caption",
  },
  { type: "text", id: "text-3", markdown: "Review lock steps." },
]

function createRequest(body: unknown) {
  return new Request("http://localhost/api/wiki/format", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/wiki/format route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testState.user = { id: "user-1" }
    testState.canManageWiki = true
    testState.node = { id: "node-1", type: "page" }
    testState.aiResponse = {
      output_text: JSON.stringify({
        summary: "Improved headings and bullets.",
        sections: [
          {
            id: "section-1",
            markdown: `## Loan Cancellation\n\n${originalMarkdown}`,
          },
        ],
      }),
    }
    testState.aiResponses = [testState.aiResponse]
  })

  it("rejects unauthenticated requests", async () => {
    testState.user = null
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )

    expect(response.status).toBe(401)
  })

  it("rejects users without Wiki manager permission", async () => {
    testState.canManageWiki = false
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )

    expect(response.status).toBe(403)
  })

  it("rejects missing page ID and invalid sections", async () => {
    const { POST } = await import("@/app/api/wiki/format/route")

    const missingPageResponse = await POST(
      createRequest({
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )
    const invalidSectionsResponse = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: [],
      })
    )
    const missingSectionsResponse = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
      })
    )

    expect(missingPageResponse.status).toBe(400)
    expect(invalidSectionsResponse.status).toBe(400)
    expect(missingSectionsResponse.status).toBe(400)
  })

  it("rejects malformed AI JSON", async () => {
    testState.aiResponse = { output_text: "not json" }
    testState.aiResponses = [testState.aiResponse]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("AI returned invalid JSON.")
  })

  it("rejects destructive AI output", async () => {
    testState.aiResponse = {
      output_text: JSON.stringify({
        summary: "Shortened document.",
        sections: [{ id: "section-1", markdown: "Too short." }],
      }),
    }
    testState.aiResponses = [testState.aiResponse]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/removed too much/i)
  })

  it("rejects AI output that changes section IDs", async () => {
    testState.aiResponse = {
      output_text: JSON.stringify({
        summary: "Changed sections.",
        sections: [{ id: "section-x", markdown: originalMarkdown }],
      }),
    }
    testState.aiResponses = [testState.aiResponse]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/section structure/i)
  })

  it("returns formatted sections and summary", async () => {
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        nodeId: "node-1",
        title: "Cancel a Loan",
        sections: originalSections,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.summary).toBe("Improved headings and bullets.")
    expect(payload.sections).toEqual([
      {
        id: "section-1",
        markdown: expect.stringContaining("Loan Cancellation"),
      },
    ])
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fake-format",
        store: false,
        input: expect.stringContaining("Canopy Wiki Rewrite Standard"),
        text: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" }),
        }),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    )
  })

  it("returns a v2 layout that can move rich refs and insert dividers", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Reordered sections around the image.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-3"],
              markdown: "## Steps\n\nReview lock steps.",
            },
            {
              type: "ref",
              id: "media-2",
              mediaPatch: { caption: "Lock policy screenshot" },
            },
            { type: "divider" },
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "## Lock Policy\n\nLock policy introduction.",
            },
          ],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: originalItems,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "markdown", sourceIds: ["text-3"] }),
        expect.objectContaining({
          type: "ref",
          id: "media-2",
          mediaPatch: { caption: "Lock policy screenshot" },
        }),
        { type: "divider" },
        expect.objectContaining({ type: "markdown", sourceIds: ["text-1"] }),
      ])
    )
    expect(payload.items).toContainEqual({ type: "spacer" })
    expect(payload.stats.insertedDividers).toBe(1)
    expect(payload.stats.captionChanges).toBe(1)
  })

  it("removes a leading body heading that duplicates the page title", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Rewrote page content.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "## Cancel a Loan\n\nCancel a loan after review.",
            },
          ],
          rewriteSections: [],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "Cancel a loan after reviewing the required file details.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toBe("Cancel a loan after review.")
  })

  it("removes a generic opening heading from the first body section", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Rewrote page content.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown:
                "## Overview\n\nUse this process to confirm the borrower has consented before continuing.\n\n## Requirements\n\nConfirm the borrower and loan details.",
            },
          ],
          rewriteSections: [],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "How to Send a Borrower's Authorization",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "Use this process to confirm the borrower has consented before continuing. Confirm the borrower and loan details.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toBe(
      "Use this process to confirm the borrower has consented before continuing.\n\n## Requirements\n\nConfirm the borrower and loan details."
    )
  })

  it("removes a near-duplicate title guide heading from the first body section", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Rewrote page content.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown:
                "## Cancel a Loan Guide\n\nCancel a loan after reviewing all required file details.",
            },
          ],
          rewriteSections: [],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "Cancel a loan after reviewing all required file details.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toBe(
      "Cancel a loan after reviewing all required file details."
    )
  })

  it("rejects v2 output that drops a protected rich ref when fallback also fails", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Dropped media.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "Lock policy introduction. Review lock steps.",
            },
          ],
        }),
      },
      {
        output_text: JSON.stringify({
          summary: "Fallback failed.",
          sections: [{ id: "other", markdown: "Fallback failed." }],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: originalItems,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/protected document blocks/i)
  })

  it("uses conservative fallback when v2 layout validation fails", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Duplicated media.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "Lock policy introduction.",
            },
            { type: "ref", id: "media-2" },
            { type: "ref", id: "media-2" },
            {
              type: "markdown",
              sourceIds: ["text-3"],
              markdown: "Review lock steps.",
            },
          ],
        }),
      },
      {
        output_text: JSON.stringify({
          summary: "Conservative cleanup.",
          sections: [
            {
              id: "text-1",
              markdown: "## Lock Policy\n\nLock policy introduction.",
            },
            {
              id: "text-3",
              markdown: "## Steps\n\nReview lock steps.",
            },
          ],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: originalItems,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.summary).toBe("Conservative cleanup.")
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "markdown", sourceIds: ["text-1"] }),
        { type: "ref", id: "media-2" },
        expect.objectContaining({ type: "markdown", sourceIds: ["text-3"] }),
      ])
    )
    expect(payload.items).toContainEqual({ type: "spacer" })
  })

  it("normalizes bold-only headings into spaced Markdown headings", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Planned heading cleanup.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "",
            },
          ],
          rewriteSections: [
            { id: "text-1", instructions: "Clean up headings." },
          ],
        }),
      },
      {
        output_text:
          "**How to Cancel a Loan**\nYou can cancel your own loans in Nano.\n**Complete Loan Data**\nTo have the option to cancel a loan:\n- Borrower name.\n- Property address.",
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "HOW TO CANCEL A LOAN\nYou can cancel your own loans in Nano.\nCOMPLETE LOAN DATA\nTo have the option to cancel a loan:\n- Borrower name.\n- Property address.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toContain(
      "You can cancel your own loans in Nano.\n\n## Complete Loan Data\n\nTo have the option to cancel a loan:\n\n- Borrower name."
    )
    expect(payload.items[0].markdown).not.toMatch(/^## How to Cancel a Loan/)
  })

  it("allows contextual callouts for advisory text instead of section headings", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Highlighted advisory guidance.",
          items: [
            {
              type: "callout",
              sourceIds: ["text-1"],
              tone: "yellow",
              markdown:
                "If the borrower has not consented to electronic disclosures, use this as a good time to explain what that means and give them the opportunity to consent.",
            },
          ],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "How to Send a Borrower's Authorization",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "If the borrower has not consented to electronic disclosures, this is a great time to have a quick conversation about what this means and give them the opportunity to consent.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0]).toEqual({
      type: "callout",
      sourceIds: ["text-1"],
      tone: "yellow",
      markdown:
        "If the borrower has not consented to electronic disclosures, use this as a good time to explain what that means and give them the opportunity to consent.",
    })
    expect(payload.items[0].markdown).not.toMatch(/^#/)
    expect(payload.stats.insertedCallouts).toBe(1)
  })

  it("constrains excessive callouts and visual breaks from v2 output", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Overformatted document.",
          items: [
            {
              type: "callout",
              sourceIds: ["text-1"],
              tone: "yellow",
              markdown: "Confirm the borrower has consented before continuing.",
            },
            { type: "divider" },
            { type: "spacer" },
            {
              type: "callout",
              sourceIds: ["text-2"],
              tone: "blue",
              markdown:
                "This is normal supporting context that should remain readable in the main document flow.",
            },
            { type: "divider" },
            { type: "divider" },
            { type: "spacer" },
            { type: "spacer" },
            {
              type: "markdown",
              sourceIds: ["text-3"],
              markdown:
                "## Next Steps\n\n1. Open the borrower authorization screen.",
            },
          ],
        }),
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "How to Send a Borrower's Authorization",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown: "Confirm the borrower has consented before continuing.",
          },
          {
            type: "text",
            id: "text-2",
            markdown:
              "This is normal supporting context that should remain readable in the main document flow.",
          },
          {
            type: "text",
            id: "text-3",
            markdown: "Next steps. Open the borrower authorization screen.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(
      payload.items.filter((item: { type: string }) => item.type === "callout")
    ).toHaveLength(1)
    expect(
      payload.items.filter((item: { type: string }) => item.type === "divider")
    ).toHaveLength(1)
    expect(
      payload.items.filter((item: { type: string }) => item.type === "spacer")
    ).toHaveLength(1)
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "markdown",
          sourceIds: ["text-2"],
        }),
      ])
    )
  })

  it("downgrades body h1 headings returned by section rewrites", async () => {
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Planned step cleanup.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: "",
            },
          ],
          rewriteSections: [{ id: "text-1", instructions: "Clean up steps." }],
        }),
      },
      {
        output_text:
          "# Next Steps\n# Send the Authorization\nOpen the borrower authorization screen.",
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "How to Send a Borrower's Authorization",
        items: [
          {
            type: "text",
            id: "text-1",
            markdown:
              "NEXT STEPS\nSEND THE AUTHORIZATION\nOpen the borrower authorization screen.",
          },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toContain("## Next Steps")
    expect(payload.items[0].markdown).toContain("## Send the Authorization")
    expect(payload.items[0].markdown).not.toMatch(/^# /m)
  })

  it("plans long v2 documents and rewrites only requested text groups", async () => {
    const longMarkdown = `${originalMarkdown}\n\n`.repeat(70)
    testState.aiResponses = [
      {
        output_text: JSON.stringify({
          summary: "Planned long document cleanup.",
          items: [
            {
              type: "markdown",
              sourceIds: ["text-1"],
              markdown: longMarkdown,
            },
          ],
          rewriteSections: [
            { id: "text-1", instructions: "Make this easier to scan." },
          ],
        }),
      },
      {
        output_text: `## Loan Cancellation\n\n${longMarkdown}`,
      },
    ]
    const { POST } = await import("@/app/api/wiki/format/route")

    const response = await POST(
      createRequest({
        formatVersion: 2,
        nodeId: "node-1",
        title: "Cancel a Loan",
        items: [{ type: "text", id: "text-1", markdown: longMarkdown }],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items[0].markdown).toContain("Loan Cancellation")
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenCalledTimes(2)
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.stringContaining("rewriteSections"),
      }),
      expect.anything()
    )
    expect(aiProvider.createAgentResponseWithOpenAI).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.stringContaining("Canopy Wiki Rewrite Standard"),
      }),
      expect.anything()
    )
  })
})
