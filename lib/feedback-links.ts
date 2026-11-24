export type FeedbackEnvironment = "dev" | "staging" | "prod"
export type FeedbackKind = "item" | "milo"

export interface FeedbackLink {
  env: FeedbackEnvironment
  kind: FeedbackKind
  id: string
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISSUE_URL =
  /^https:\/\/github\.com\/grayscale-development\/canopy-hub\/issues\/([0-9]+)$/

export function isFeedbackId(value: string): boolean {
  return UUID.test(value)
}

export function parseGithubIssueUrl(value: string): string | null {
  return ISSUE_URL.test(value) ? value : null
}

export function githubIssueNumber(
  value: string | null | undefined
): string | null {
  return value?.match(ISSUE_URL)?.[1] ?? null
}

function environmentForHost(hostname: string): FeedbackEnvironment | null {
  const host = hostname.toLowerCase()
  if (host === "hub2.canopymortgage.com" || host === "canopy-hub.vercel.app")
    return "prod"
  if (host === "localhost" || host === "127.0.0.1") return "dev"
  if (host.endsWith(".vercel.app")) return "staging"
  return null
}

export function buildFeedbackUrl(
  origin: string,
  kind: FeedbackKind,
  id: string
): string {
  if (!isFeedbackId(id)) throw new Error("Invalid feedback id.")
  const url = new URL("/settings/feedback", origin)
  url.searchParams.set(kind === "item" ? "item" : "milo", id)
  return url.toString()
}

export function parseFeedbackUrl(
  value: string,
  options: { environmentOverride?: FeedbackEnvironment } = {}
): FeedbackLink | { error: string } {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { error: "Feedback URL is invalid." }
  }

  if (url.pathname !== "/settings/feedback")
    return { error: "Feedback URL must point to /settings/feedback." }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { error: "Feedback URL must use http or https." }

  const item = url.searchParams.get("item")
  const milo = url.searchParams.get("milo")
  if ((item === null && milo === null) || (item !== null && milo !== null))
    return { error: "Feedback URL must include exactly one item or milo id." }
  if (
    [...url.searchParams.keys()].some((key) => key !== "item" && key !== "milo")
  )
    return { error: "Feedback URL has unsupported query parameters." }

  const id = item ?? milo!
  if (!isFeedbackId(id)) return { error: "Feedback URL has an invalid id." }

  const env = options.environmentOverride ?? environmentForHost(url.hostname)
  if (!env) return { error: "Feedback URL host is not recognized." }
  return { env, kind: item ? "item" : "milo", id }
}
