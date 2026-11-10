import { NextResponse } from "next/server"

import { cardActionSchema, miloCardSchema } from "@/lib/milo/chat-cards"
import { isEditablePage } from "@/lib/milo/find-page"
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
    ((action.action === "next-page" || action.action === "create-page") &&
      card.data.type === "page-candidates") ||
    (action.action === "approve" && card.data.type === "proposed-edit") ||
    (action.action === "undo" && card.data.type === "applied-edit")
  if (!matches)
    return NextResponse.json(
      { error: "Action is not available for this card." },
      { status: 400 }
    )

  if (card.data.type !== "page-candidates")
    return NextResponse.json({ status: "not-implemented" as const })

  // Message metadata is user-writable: neither the card nor its IDs grant access.
  const state = message.metadata?.miloEdit
  if (state?.stage !== "ready_to_find_page" || card.data.outcome)
    return NextResponse.json(
      { error: "This choice is no longer available." },
      { status: 409 }
    )
  const { data: latest, error: latestError } = await supabase
    .from("ai_chat_messages")
    .select("id")
    .eq("thread_id", thread.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError || latest?.id !== action.messageId)
    return NextResponse.json(
      { error: "This choice is no longer available." },
      { status: 409 }
    )
  const current = card.data.current ?? 0
  const candidate = card.data.candidates[current]
  if (candidate && !(await isEditablePage(supabase, candidate.id)))
    return NextResponse.json(
      {
        error:
          "This page is no longer available to edit. Please find a page again.",
      },
      { status: 403 }
    )

  let updated = card.data
  let nextState = state
  let notice = ""
  if (action.action === "select-page") {
    if (!candidate || candidate.id !== action.candidateId)
      return NextResponse.json(
        { error: "Choose the page currently shown." },
        { status: 400 }
      )
    updated = { ...updated, outcome: "confirmed" }
    nextState = { ...state, stage: "page_confirmed", pageId: candidate.id }
    notice =
      "Page confirmed. A future update will let Milo prepare a proposed edit for your review. No changes have been made."
  } else if (action.action === "next-page") {
    if (card.data.candidates.length < 2)
      return NextResponse.json(
        { error: "There are no other matches." },
        { status: 400 }
      )
    const next = (current + 1) % card.data.candidates.length
    if (!(await isEditablePage(supabase, card.data.candidates[next].id)))
      return NextResponse.json(
        {
          error:
            "This page is no longer available to edit. Please find a page again.",
        },
        { status: 403 }
      )
    updated = { ...updated, current: next }
  } else if (action.action === "create-page") {
    updated = { ...updated, outcome: "create" }
    notice =
      "Open the Wiki, turn on editor mode, and choose Add > AI Create. Paste your source there to create a page."
  } else {
    return NextResponse.json(
      { error: "Action is not available for this card." },
      { status: 400 }
    )
  }
  const { error: updateError } = await supabase
    .from("ai_chat_messages")
    .update({
      metadata: {
        ...message.metadata,
        miloEdit: nextState,
        cards: cards.map((value: unknown) => {
          const parsed = miloCardSchema.safeParse(value)
          return parsed.success && parsed.data.id === action.cardId
            ? updated
            : value
        }),
      },
    })
    .eq("id", action.messageId)
    .eq("thread_id", thread.id)
    .eq("user_id", user.id)
  if (updateError)
    return NextResponse.json(
      { error: "Unable to save your choice." },
      { status: 400 }
    )
  return NextResponse.json({ status: "ok", card: updated, notice })
}
