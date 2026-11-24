import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import {
  isFeedbackId,
  parseFeedbackUrl,
  type FeedbackKind,
} from "@/lib/feedback-links"
import { isFeedbackStatus, workflowUpdate } from "@/lib/feedback-workflow"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

interface SyncBody {
  url?: unknown
  kind?: unknown
  id?: unknown
  status?: unknown
  github_issue_url?: unknown
}

function unauthorized(request: Request) {
  const secret = process.env.FEEDBACK_SYNC_SECRET?.trim()
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1]
  const expected = Buffer.from(secret ?? "")
  const actual = Buffer.from(bearer ?? "")
  return (
    !secret ||
    !bearer ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
}

function targetFrom(
  body: SyncBody
): { kind: FeedbackKind; id: string } | { error: string } {
  if (typeof body.url === "string") {
    const parsed = parseFeedbackUrl(body.url)
    return "error" in parsed ? parsed : { kind: parsed.kind, id: parsed.id }
  }
  if (
    (body.kind === "item" || body.kind === "milo") &&
    typeof body.id === "string" &&
    isFeedbackId(body.id)
  )
    return { kind: body.kind, id: body.id }
  return { error: "A feedback URL or kind and id are required." }
}

export async function POST(request: Request) {
  if (unauthorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as SyncBody | null
  if (!body || !isFeedbackStatus(body.status))
    return NextResponse.json({ error: "Invalid status." }, { status: 400 })
  const target = targetFrom(body)
  if ("error" in target)
    return NextResponse.json({ error: target.error }, { status: 400 })
  if (
    body.github_issue_url !== undefined &&
    typeof body.github_issue_url !== "string"
  )
    return NextResponse.json(
      { error: "Invalid GitHub issue URL." },
      { status: 400 }
    )

  const admin = createSupabaseAdminClient()
  const table =
    target.kind === "item" ? "feedback_items" : "ai_chat_message_flags"
  const { data: current, error: readError } = await admin
    .from(table)
    .select("status")
    .eq("id", target.id)
    .maybeSingle()
  if (readError)
    return NextResponse.json(
      { error: "Could not read feedback." },
      { status: 400 }
    )
  if (!current)
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 })

  const currentStatus =
    target.kind === "milo" && current.status === "closed"
      ? "resolved"
      : current.status
  if (
    currentStatus === "verified" ||
    (currentStatus === "resolved" && body.status === "resolved")
  )
    return NextResponse.json({ ok: true, skipped: true })

  const update = workflowUpdate({
    kind: target.kind,
    status: body.status,
    githubIssueUrl: body.github_issue_url,
    actorId: process.env.FEEDBACK_SYNC_ACTOR_ID,
  })
  if ("error" in update)
    return NextResponse.json({ error: update.error }, { status: 503 })

  const { error: updateError } = await admin
    .from(table)
    .update(update)
    .eq("id", target.id)
  if (updateError)
    return NextResponse.json(
      { error: "Could not update feedback." },
      { status: 400 }
    )
  return NextResponse.json({ ok: true })
}
