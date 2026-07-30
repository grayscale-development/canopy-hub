import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

interface FlagRequestBody {
  assistantMessageId?: unknown
  reason?: unknown
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  if (!canAccessBeta1) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload = (await request
    .json()
    .catch(() => null)) as FlagRequestBody | null
  const assistantMessageId =
    typeof payload?.assistantMessageId === "string"
      ? payload.assistantMessageId.trim()
      : ""
  const reason =
    typeof payload?.reason === "string" ? payload.reason.trim() : ""

  if (!assistantMessageId) {
    return NextResponse.json(
      { error: "Milo response is required." },
      { status: 400 }
    )
  }

  if (!reason) {
    return NextResponse.json(
      { error: "Please tell us why you are flagging this." },
      { status: 400 }
    )
  }

  if (reason.length > 2000) {
    return NextResponse.json({ error: "Reason is too long." }, { status: 400 })
  }

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("ai_chat_messages")
    .select("id,thread_id,role,content,created_at")
    .eq("id", assistantMessageId)
    .eq("role", "assistant")
    .maybeSingle()

  if (assistantError) {
    return NextResponse.json({ error: assistantError.message }, { status: 400 })
  }

  if (!assistantMessage) {
    return NextResponse.json(
      { error: "Milo response was not found." },
      { status: 404 }
    )
  }

  const { data: userMessage, error: userMessageError } = await supabase
    .from("ai_chat_messages")
    .select("id,content")
    .eq("thread_id", assistantMessage.thread_id)
    .eq("role", "user")
    .lt("created_at", assistantMessage.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (userMessageError) {
    return NextResponse.json(
      { error: userMessageError.message },
      { status: 400 }
    )
  }

  if (!userMessage) {
    return NextResponse.json(
      { error: "The related user message was not found." },
      { status: 404 }
    )
  }

  const { error: insertError } = await supabase
    .from("ai_chat_message_flags")
    .insert({
      user_id: user.id,
      thread_id: assistantMessage.thread_id,
      user_message_id: userMessage.id,
      assistant_message_id: assistantMessage.id,
      reason,
      acknowledged: true,
      user_message_content: userMessage.content,
      assistant_message_content: assistantMessage.content,
    })

  if (insertError) {
    const alreadyFlagged = insertError.code === "23505"
    return NextResponse.json(
      {
        error: alreadyFlagged
          ? "This Milo response has already been flagged."
          : insertError.message,
      },
      { status: alreadyFlagged ? 409 : 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
