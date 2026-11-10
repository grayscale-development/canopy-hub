import { NextResponse } from "next/server"

import { cardActionSchema, miloCardSchema } from "@/lib/milo/chat-cards"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  for (const code of [BETA_1_PERMISSION, "wiki.manage"]) {
    if (!(await userHasPermissionCode({ supabase, userId: user.id, code }))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const parsed = cardActionSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid card action." }, { status: 400 })
  const action = parsed.data

  const { data: thread, error: threadError } = await supabase
    .from("ai_chat_threads")
    .select("id")
    .eq("id", action.threadId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (threadError)
    return NextResponse.json({ error: "Unable to load chat." }, { status: 400 })
  if (!thread)
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })

  const { data: message, error: messageError } = await supabase
    .from("ai_chat_messages")
    .select("metadata")
    .eq("id", action.messageId)
    .eq("thread_id", thread.id)
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .maybeSingle()
  if (messageError)
    return NextResponse.json(
      { error: "Unable to load message." },
      { status: 400 }
    )
  if (!message)
    return NextResponse.json({ error: "Message not found." }, { status: 404 })

  const cards: unknown[] = Array.isArray(message.metadata?.cards)
    ? message.metadata.cards
    : []
  const card = cards
    .map((value: unknown) => miloCardSchema.safeParse(value))
    .find((value) => value.success && value.data.id === action.cardId)
  if (!card?.success)
    return NextResponse.json({ error: "Card not found." }, { status: 404 })

  const matches =
    (action.action === "select-page" &&
      card.data.type === "page-candidates" &&
      card.data.candidates.some(
        (candidate) => candidate.id === action.candidateId
      )) ||
    (action.action === "approve" && card.data.type === "proposed-edit") ||
    (action.action === "undo" && card.data.type === "applied-edit")
  if (!matches)
    return NextResponse.json(
      { error: "Action is not available for this card." },
      { status: 400 }
    )

  return NextResponse.json({ status: "not-implemented" as const })
}
