import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { MiloCard } from "@/lib/milo/chat-cards"
import type { MiloEditState } from "@/lib/milo/source-workflow"

export async function saveMiloProposal({
  threadId,
  messageId,
  userId,
  card,
  state,
  replace = false,
}: {
  threadId: string
  messageId: string
  userId: string
  card: Extract<MiloCard, { type: "proposed-edit" }>
  state: Extract<MiloEditState, { stage: "page_confirmed" }>
  replace?: boolean
}) {
  if (
    !card.pageId ||
    card.pageId !== state.pageId ||
    !card.blocks ||
    card.baseRevisionId !== state.baseRevisionId ||
    Buffer.byteLength(JSON.stringify(card)) > 1_000_000 ||
    (card.plain_text?.length ?? 0) > 500_000 ||
    (card.changeNote?.length ?? 0) > 1000
  ) {
    throw new Error("This proposal is too large or invalid.")
  }
  const table = createSupabaseAdminClient().from("milo_edit_proposals")
  const row = {
    thread_id: threadId,
    message_id: messageId,
    user_id: userId,
    node_id: card.pageId,
    base_revision_id: card.baseRevisionId,
    card,
    edit_state: state,
  }
  const result = replace
    ? await table
        .update(row)
        .eq("message_id", messageId)
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .is("applied_revision_id", null)
        .select("message_id")
        .maybeSingle()
    : await table.insert(row).select("message_id").maybeSingle()
  if (result.error || !result.data)
    throw new Error("Unable to save the proposal.")
}

export async function getMiloProposal(
  threadId: string,
  messageId: string,
  userId: string
) {
  const { data, error } = await createSupabaseAdminClient()
    .from("milo_edit_proposals")
    .select("*")
    .eq("thread_id", threadId)
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error("Unable to load the proposal.")
  return data
}
