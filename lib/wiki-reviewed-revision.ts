import "server-only"

import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  blockNoteToPlainText,
  fetchWikiNodes,
  type WikiNodeRow,
} from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

export async function applyPreparedWikiPreview({
  supabase,
  targetPage,
  sourcePageId,
  sourceRevisionId,
  changeNote,
  blocks,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  targetPage: WikiNodeRow
  sourcePageId: string | null
  sourceRevisionId: string | null
  changeNote: string
  blocks: unknown[]
}) {
  const plainText = blockNoteToPlainText(blocks)
  const { data: revisionId, error: saveError } = await supabase.rpc(
    "apply_wiki_reviewed_revision",
    {
      p_target_id: targetPage.id,
      p_base_revision_id: targetPage.current_revision_id,
      p_blocks: blocks,
      p_plain_text: plainText,
      p_change_note: changeNote,
      p_source_id: sourcePageId,
      p_source_base_revision_id: sourceRevisionId,
    }
  )
  if (saveError || typeof revisionId !== "string" || !revisionId) {
    const message = saveError?.message ?? "Unable to save the reviewed page."
    if (message.includes("stale_revision")) {
      return NextResponse.json(
        {
          error:
            "This page changed after you looked at it. Look again before saving.",
        },
        { status: 409 }
      )
    }
    if (message.includes("forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const nodes = await fetchWikiNodes(supabase)
  const node = nodes.find((item) => item.id === targetPage.id)
  const path = node ? buildNumericWikiPath(nodes, node) : ""
  revalidatePath("/wiki")
  if (path) {
    revalidatePath(`/wiki/${path}`)
  }
  return NextResponse.json({ ok: true, path: `/wiki/${path}` })
}
