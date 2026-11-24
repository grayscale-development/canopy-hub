import {
  isFeedbackId,
  parseGithubIssueUrl,
  type FeedbackKind,
} from "@/lib/feedback-links"

export type FeedbackStatus = "open" | "in_progress" | "resolved" | "verified"
export type FeedbackWorkflowFields = {
  status: string
  github_issue_url?: string
  resolved_by?: string | null
  resolved_at?: string | null
  verified_by?: string | null
  verified_at?: string | null
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return (
    value === "open" ||
    value === "in_progress" ||
    value === "resolved" ||
    value === "verified"
  )
}

export function workflowUpdate({
  kind,
  status,
  githubIssueUrl,
  actorId,
  now = new Date().toISOString(),
}: {
  kind: FeedbackKind
  status: FeedbackStatus
  githubIssueUrl?: string
  actorId?: string
  now?: string
}): FeedbackWorkflowFields | { error: string } {
  if (githubIssueUrl !== undefined && !parseGithubIssueUrl(githubIssueUrl))
    return { error: "GitHub issue URL is invalid." }
  if (status === "in_progress" && !githubIssueUrl)
    return { error: "An In progress item requires a GitHub issue URL." }
  if (
    (status === "resolved" || status === "verified") &&
    (!actorId || !isFeedbackId(actorId))
  )
    return { error: "Feedback sync actor is not configured." }

  const issue =
    githubIssueUrl === undefined ? {} : { github_issue_url: githubIssueUrl }
  if (kind === "item") {
    if (status === "open")
      return {
        ...issue,
        status,
        resolved_by: null,
        resolved_at: null,
        verified_by: null,
        verified_at: null,
      }
    if (status === "in_progress")
      return {
        ...issue,
        status,
        resolved_by: null,
        resolved_at: null,
        verified_by: null,
        verified_at: null,
      }
    if (status === "resolved")
      return {
        ...issue,
        status,
        resolved_by: actorId!,
        resolved_at: now,
        verified_by: null,
        verified_at: null,
      }
    return { ...issue, status, verified_by: actorId!, verified_at: now }
  }

  if (status === "open" || status === "in_progress")
    return {
      ...issue,
      status,
      verified_by: null,
      verified_at: null,
    }
  if (status === "resolved")
    return { ...issue, status: "closed", verified_by: null, verified_at: null }
  return { ...issue, status, verified_by: actorId!, verified_at: now }
}
