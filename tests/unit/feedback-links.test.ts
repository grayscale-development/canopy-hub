import { describe, expect, it } from "vitest"

import { buildFeedbackUrl, parseFeedbackUrl } from "@/lib/feedback-links"
import { workflowUpdate } from "@/lib/feedback-workflow"

const id = "8a10d5c6-7b25-4ef1-8c55-0a5d6ca7d8f9"
const actor = "3c36b484-8e17-4e9c-b7a0-17da6a477c25"
const issue = "https://github.com/grayscale-development/canopy-hub/issues/254"

describe("feedback links", () => {
  it("builds item and Milo links from the current origin", () => {
    expect(buildFeedbackUrl("https://preview.vercel.app", "item", id)).toBe(
      `https://preview.vercel.app/settings/feedback?item=${id}`
    )
    expect(buildFeedbackUrl("http://localhost:3000", "milo", id)).toBe(
      `http://localhost:3000/settings/feedback?milo=${id}`
    )
  })

  it("parses production, staging, and local links", () => {
    expect(
      parseFeedbackUrl(
        `https://hub2.canopymortgage.com/settings/feedback?item=${id}`
      )
    ).toEqual({ env: "prod", kind: "item", id })
    expect(
      parseFeedbackUrl(
        `https://canopy-hub-git-main.vercel.app/settings/feedback?milo=${id}`
      )
    ).toEqual({ env: "staging", kind: "milo", id })
    expect(
      parseFeedbackUrl(`http://127.0.0.1:3000/settings/feedback?item=${id}`)
    ).toEqual({ env: "dev", kind: "item", id })
  })

  it("rejects ambiguous, malformed, and unknown links unless explicitly mapped", () => {
    expect(
      parseFeedbackUrl("https://example.com/settings/feedback?item=nope")
    ).toHaveProperty("error")
    expect(
      parseFeedbackUrl(
        `https://hub2.canopymortgage.com/settings/feedback?item=${id}&milo=${id}`
      )
    ).toHaveProperty("error")
    expect(
      parseFeedbackUrl(`https://example.com/settings/feedback?item=${id}`, {
        environmentOverride: "staging",
      })
    ).toEqual({ env: "staging", kind: "item", id })
  })
})

describe("feedback workflow updates", () => {
  it("requires an issue URL for in progress and audit actor for terminal states", () => {
    expect(
      workflowUpdate({ kind: "item", status: "in_progress" })
    ).toHaveProperty("error")
    expect(workflowUpdate({ kind: "item", status: "resolved" })).toHaveProperty(
      "error"
    )
  })

  it("keeps an issue on reopen and maps Milo resolved to closed", () => {
    expect(
      workflowUpdate({ kind: "item", status: "open", githubIssueUrl: issue })
    ).toMatchObject({
      github_issue_url: issue,
      status: "open",
      resolved_by: null,
    })
    expect(
      workflowUpdate({
        kind: "milo",
        status: "resolved",
        actorId: actor,
        now: "2026-11-23T00:00:00Z",
      })
    ).toMatchObject({ status: "closed", verified_by: null })
  })

  it("writes the required item verification audit fields", () => {
    expect(
      workflowUpdate({
        kind: "item",
        status: "verified",
        actorId: actor,
        now: "2026-11-23T00:00:00Z",
      })
    ).toMatchObject({
      status: "verified",
      verified_by: actor,
      verified_at: "2026-11-23T00:00:00Z",
    })
  })
})
