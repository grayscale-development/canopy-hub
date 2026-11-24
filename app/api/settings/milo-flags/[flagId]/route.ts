import { NextResponse } from "next/server"

import { FEEDBACK_MANAGE_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { parseGithubIssueUrl } from "@/lib/feedback-links"

export const runtime = "nodejs"

const VALID_STATUSES = new Set([
  "open",
  "reviewed",
  "closed",
  "in_progress",
  "verified",
])

interface UpdateFlagStatusBody {
  status?: unknown
  addedToEvalSet?: unknown
  githubIssueUrl?: unknown
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ flagId: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManageFeedback = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: FEEDBACK_MANAGE_PERMISSION,
  })
  if (!canManageFeedback) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { flagId } = await params
  const payload = (await request
    .json()
    .catch(() => null)) as UpdateFlagStatusBody | null
  const status = typeof payload?.status === "string" ? payload.status : ""
  const githubIssueUrl = payload?.githubIssueUrl

  const addedToEvalSet = payload?.addedToEvalSet
  if (
    (!VALID_STATUSES.has(status) && status !== "") ||
    (addedToEvalSet !== undefined && typeof addedToEvalSet !== "boolean") ||
    (githubIssueUrl !== undefined &&
      (typeof githubIssueUrl !== "string" ||
        !parseGithubIssueUrl(githubIssueUrl))) ||
    (status === "in_progress" &&
      (typeof githubIssueUrl !== "string" ||
        !parseGithubIssueUrl(githubIssueUrl))) ||
    (!status && addedToEvalSet === undefined)
  ) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 })
  }

  const adminSupabase = createSupabaseAdminClient()
  const { error } = await adminSupabase
    .from("ai_chat_message_flags")
    .update({
      ...(status ? { status } : {}),
      ...(githubIssueUrl !== undefined
        ? { github_issue_url: githubIssueUrl }
        : {}),
      ...(status === "verified"
        ? { verified_by: user.id, verified_at: new Date().toISOString() }
        : status === "open" ||
            status === "reviewed" ||
            status === "closed" ||
            status === "in_progress"
          ? { verified_by: null, verified_at: null }
          : {}),
      ...(addedToEvalSet !== undefined
        ? { added_to_eval_set: addedToEvalSet }
        : {}),
    })
    .eq("id", flagId)
    .eq("acknowledged", true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
