import { parseFeedbackUrl } from "../lib/feedback-links"

const ISSUE_REFERENCE =
  /(?:closes?|fix(?:es|ed)?|feedback)\s*:?\s*(?:https:\/\/github\.com\/grayscale-development\/canopy-hub\/issues\/|#)(\d+)/gi
const URL_CANDIDATE = /https?:\/\/[^\s<>()]+/g

export function feedbackUrls(text: string): string[] {
  return [
    ...new Set(
      (text.match(URL_CANDIDATE) ?? []).filter((value) => {
        const parsed = parseFeedbackUrl(value)
        return !("error" in parsed)
      })
    ),
  ]
}

export function referencedIssues(text: string): string[] {
  return [...text.matchAll(ISSUE_REFERENCE)].map((match) => match[1])
}

async function githubJson(path: string) {
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repository || !token)
    throw new Error("GitHub context is not configured.")
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  )
  if (!response.ok)
    throw new Error(`GitHub API request failed (${response.status}).`)
  return response.json() as Promise<{ body?: string | null }>
}

async function main() {
  const pullRequest = process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER
  const secret = process.env.FEEDBACK_SYNC_SECRET?.trim()
  if (!pullRequest) throw new Error("Pull request context is not configured.")
  if (!secret) throw new Error("FEEDBACK_SYNC_SECRET is not configured.")

  const pr = await githubJson(`/pulls/${pullRequest}`)
  const issueNumbers = referencedIssues(pr.body ?? "")
  const issueBodies = await Promise.all(
    issueNumbers.map(
      async (number) => (await githubJson(`/issues/${number}`)).body ?? ""
    )
  )
  const urls = feedbackUrls([pr.body ?? "", ...issueBodies].join("\n"))
  if (!urls.length) {
    console.log("No feedback links found.")
    return
  }

  for (const url of urls) {
    const parsed = parseFeedbackUrl(url)
    if ("error" in parsed) continue
    if (parsed.env === "dev") {
      console.warn(`::warning::Skipped local feedback link ${parsed.id}.`)
      continue
    }
    const origin = new URL(url).origin
    const response = await fetch(`${origin}/api/internal/feedback/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ url, status: "resolved" }),
    })
    if (!response.ok)
      throw new Error(
        `Feedback sync failed for ${parsed.id} (${response.status}).`
      )
    console.log(`Resolved ${parsed.kind} feedback ${parsed.id}.`)
  }
}

if (process.argv[1]?.endsWith("sync-feedback-from-pr.ts")) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Feedback sync failed."
    )
    process.exitCode = 1
  })
}
