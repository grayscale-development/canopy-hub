import { NextResponse } from "next/server"

import { cardActionSchema, miloCardSchema } from "@/lib/milo/chat-cards"
import { isEditablePage } from "@/lib/milo/find-page"
import { prepareMiloProposal } from "@/lib/milo/proposed-edit"
import { getMiloProposal, saveMiloProposal } from "@/lib/milo/proposal-store"
import { indexMiloPage, miloPagePath } from "@/lib/milo/page-index"
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
    ((action.action === "approve" || action.action === "regenerate") &&
      card.data.type === "proposed-edit") ||
    (action.action === "undo" && card.data.type === "applied-edit")
  if (!matches)
    return NextResponse.json(
      { error: "Action is not available for this card." },
      { status: 400 }
    )

  if (card.data.type !== "page-candidates") {
    const stored = await getMiloProposal(thread.id, action.messageId, user.id)
    if (!stored || !(await isEditablePage(supabase, stored.node_id))) {
      return NextResponse.json(
        { error: "This page or proposal is no longer available." },
        { status: 403 }
      )
    }
    if (action.action === "regenerate" && card.data.type === "proposed-edit") {
      if (stored.applied_revision_id)
        return NextResponse.json(
          { error: "This proposal was already applied." },
          { status: 409 }
        )
      try {
        const state = stored.edit_state
        const prepared = await prepareMiloProposal({
          supabase,
          pageId: stored.node_id,
          extraction: state.extraction,
          feedback: state.feedback ?? [],
        })
        const nextState = { ...state, baseRevisionId: prepared.baseRevisionId }
        await saveMiloProposal({
          threadId: thread.id,
          messageId: action.messageId,
          userId: user.id,
          card: prepared.card,
          state: nextState,
          replace: true,
        })
        const updatedCards = cards.map((value) => {
          const parsed = miloCardSchema.safeParse(value)
          return parsed.success && parsed.data.id === action.cardId
            ? prepared.card
            : value
        })
        const { error } = await supabase
          .from("ai_chat_messages")
          .update({
            metadata: {
              ...message.metadata,
              miloEdit: nextState,
              cards: updatedCards,
            },
          })
          .eq("id", action.messageId)
          .eq("thread_id", thread.id)
          .eq("user_id", user.id)
        if (error) throw error
        return NextResponse.json({
          status: "ok",
          card: prepared.card,
          notice: "Proposal updated. Review it before approving.",
        })
      } catch {
        return NextResponse.json(
          { error: "Couldn't redo the proposal. Please try again." },
          { status: 400 }
        )
      }
    }
    if (action.action !== "approve" && action.action !== "undo") {
      return NextResponse.json(
        { error: "Action is not available for this card." },
        { status: 400 }
      )
    }
    const { path } = await miloPagePath(supabase, stored.node_id)
    const { data: applied, error } = await supabase.rpc("apply_milo_edit", {
      p_thread_id: thread.id,
      p_message_id: action.messageId,
      p_card_id: action.cardId,
      p_action: action.action,
      p_page_url: `/wiki/${path}`,
    })
    if (error) {
      if (error.message.includes("stale_revision")) {
        return NextResponse.json(
          {
            error:
              action.action === "approve"
                ? "This page changed since the proposal. Want me to redo it?"
                : "This page changed again, so Undo is unavailable.",
            stale: true,
          },
          { status: 409 }
        )
      }
      if (error.message.includes("rate_limited"))
        return NextResponse.json(
          { error: "Too many edits. Please wait a minute and try again." },
          { status: 429 }
        )
      return NextResponse.json(
        { error: "This proposal is no longer available. Please start again." },
        { status: 409 }
      )
    }
    let notice =
      action.action === "undo" ? "Previous version restored." : "Edit applied."
    try {
      await indexMiloPage(supabase, stored.node_id)
    } catch {
      notice += " Search indexing couldn't finish; please reindex this page."
    }
    return NextResponse.json({ status: "ok", card: applied, notice })
  }

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
  let proposal:
    | Awaited<ReturnType<typeof prepareMiloProposal>>["card"]
    | undefined
  if (action.action === "select-page") {
    if (!candidate || candidate.id !== action.candidateId)
      return NextResponse.json(
        { error: "Choose the page currently shown." },
        { status: 400 }
      )
    try {
      const prepared = await prepareMiloProposal({
        supabase,
        pageId: candidate.id,
        extraction: state.extraction,
      })
      proposal = prepared.card
      updated = { ...updated, outcome: "confirmed" }
      nextState = {
        ...state,
        stage: "page_confirmed",
        pageId: candidate.id,
        baseRevisionId: prepared.baseRevisionId,
        rounds: 0,
        feedback: [],
      }
      await saveMiloProposal({
        threadId: thread.id,
        messageId: action.messageId,
        userId: user.id,
        card: prepared.card,
        state: nextState,
      })
      notice = "Page confirmed. No changes have been made."
    } catch {
      return NextResponse.json(
        { error: "Couldn't prepare the edit. Please try again." },
        { status: 400 }
      )
    }
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
        cards: [
          ...cards.map((value: unknown) => {
            const parsed = miloCardSchema.safeParse(value)
            return parsed.success && parsed.data.id === action.cardId
              ? updated
              : value
          }),
          ...(proposal ? [proposal] : []),
        ],
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
  return NextResponse.json({ status: "ok", card: updated, proposal, notice })
}
