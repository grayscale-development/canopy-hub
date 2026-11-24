import { loadEnvConfig } from "@next/env"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  parseFeedbackUrl,
  parseGithubIssueUrl,
  type FeedbackEnvironment,
  type FeedbackKind,
} from "../lib/feedback-links"
import { isFeedbackStatus, workflowUpdate } from "../lib/feedback-workflow"

loadEnvConfig(process.cwd())

type FeedbackTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}
type FeedbackDatabase = {
  public: {
    Tables: {
      feedback_items: FeedbackTable
      ai_chat_message_flags: FeedbackTable
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

type Command =
  | { action: "show"; url: string; environment?: FeedbackEnvironment }
  | {
      action: "link"
      url: string
      issueUrl: string
      environment?: FeedbackEnvironment
    }
  | {
      action: "status"
      url: string
      status: string
      environment?: FeedbackEnvironment
    }

function usage(): never {
  throw new Error(
    "Usage: pnpm feedback show <url> [--env dev|staging|prod] | link <url> --issue <github issue url> [--env ...] | status <url> --set open|in_progress|resolved|verified [--env ...]"
  )
}

function environmentOption(args: string[]): FeedbackEnvironment | undefined {
  const index = args.indexOf("--env")
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || !["dev", "staging", "prod"].includes(value)) usage()
  args.splice(index, 2)
  return value as FeedbackEnvironment
}

export function parseCommand(argv: string[]): Command {
  const args = [...argv]
  const environment = environmentOption(args)
  const [action, url, option, value, ...rest] = args
  if (!action || !url || rest.length) usage()
  if (action === "show" && !option) return { action, url, environment }
  if (action === "link" && option === "--issue" && value)
    return { action, url, issueUrl: value, environment }
  if (action === "status" && option === "--set" && value)
    return { action, url, status: value, environment }
  usage()
}

function credentials(environment: FeedbackEnvironment) {
  const values =
    environment === "dev"
      ? {
          url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
          key: process.env.SUPABASE_SERVICE_ROLE_KEY,
          actor: process.env.FEEDBACK_SYNC_ACTOR_ID,
        }
      : environment === "prod"
        ? {
            url: process.env.CANOPY_PROD_SUPABASE_URL,
            key: process.env.CANOPY_PROD_SUPABASE_SERVICE_ROLE_KEY,
            actor: process.env.CANOPY_PROD_FEEDBACK_SYNC_ACTOR_ID,
          }
        : {
            url: process.env.CANOPY_STAGING_SUPABASE_URL,
            key: process.env.CANOPY_STAGING_SUPABASE_SERVICE_ROLE_KEY,
            actor: process.env.CANOPY_STAGING_FEEDBACK_SYNC_ACTOR_ID,
          }
  if (!values.url || !values.key) {
    const name =
      environment === "prod"
        ? "Production"
        : environment === "staging"
          ? "Staging"
          : "Local Supabase service role"
    throw new Error(`${name} credentials not configured.`)
  }
  if (
    environment === "dev" &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(values.url)
  )
    throw new Error("Dev feedback commands require local Supabase.")
  return { actor: values.actor, key: values.key, url: values.url }
}

async function submitterName(
  client: SupabaseClient<FeedbackDatabase>,
  userId: string | null
) {
  if (!userId) return "Unknown user"
  const { data } = await client.auth.admin.getUserById(userId)
  const metadata = data.user?.user_metadata
  const name = metadata?.full_name ?? metadata?.name
  return typeof name === "string" && name.trim() ? name.trim() : "Unknown user"
}

async function show(
  client: SupabaseClient<FeedbackDatabase>,
  kind: FeedbackKind,
  id: string,
  environment: FeedbackEnvironment
) {
  const table = kind === "item" ? "feedback_items" : "ai_chat_message_flags"
  const columns =
    kind === "item"
      ? "id,created_by,type,status,created_at,message,page_path,github_issue_url"
      : "id,user_id,status,created_at,reason,user_message_content,assistant_message_content,github_issue_url"
  const { data, error } = (await client
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle()) as {
    data: Record<string, unknown> | null
    error: unknown
  }
  if (error) throw new Error("Could not read feedback.")
  if (!data) throw new Error("Feedback not found.")

  if (kind === "item") {
    console.log(
      JSON.stringify(
        {
          env: environment,
          kind,
          id,
          type: data.type,
          status: data.status,
          submitter: await submitterName(
            client,
            typeof data.created_by === "string" ? data.created_by : null
          ),
          created_at: data.created_at,
          message: data.message,
          page_path: data.page_path,
          github_issue_url: data.github_issue_url,
        },
        null,
        2
      )
    )
    return
  }
  console.log(
    JSON.stringify(
      {
        env: environment,
        kind,
        id,
        type: "milo",
        status: data.status === "closed" ? "resolved" : data.status,
        submitter: await submitterName(
          client,
          typeof data.user_id === "string" ? data.user_id : null
        ),
        created_at: data.created_at,
        message: data.reason,
        page_path: null,
        github_issue_url: data.github_issue_url,
        question: data.user_message_content,
        answer: data.assistant_message_content,
        reason: data.reason,
      },
      null,
      2
    )
  )
}

export async function runFeedbackCommand(argv: string[]) {
  const command = parseCommand(argv)
  const parsed = parseFeedbackUrl(command.url, {
    environmentOverride: command.environment,
  })
  if ("error" in parsed) throw new Error(parsed.error)
  const connection = credentials(parsed.env)
  const client = createClient<FeedbackDatabase>(
    connection.url,
    connection.key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )

  if (command.action === "show") {
    await show(client, parsed.kind, parsed.id, parsed.env)
    return
  }
  const table =
    parsed.kind === "item" ? "feedback_items" : "ai_chat_message_flags"
  const status = command.action === "link" ? "in_progress" : command.status
  if (!isFeedbackStatus(status))
    throw new Error("Status must be open, in_progress, resolved, or verified.")
  const githubIssueUrl =
    command.action === "link" ? command.issueUrl : undefined
  if (githubIssueUrl && !parseGithubIssueUrl(githubIssueUrl))
    throw new Error("GitHub issue URL is invalid.")
  const update = workflowUpdate({
    kind: parsed.kind,
    status,
    githubIssueUrl,
    actorId: connection.actor,
  })
  if ("error" in update) throw new Error(update.error)
  const { error } = await client.from(table).update(update).eq("id", parsed.id)
  if (error) throw new Error("Could not update feedback.")
  console.log(`Feedback marked ${status.replace("_", " ")}.`)
}

if (process.argv[1]?.endsWith("feedback.ts")) {
  runFeedbackCommand(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Feedback command failed."
    console.error(message)
    process.exitCode = 1
  })
}
