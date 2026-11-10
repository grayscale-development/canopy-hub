"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"
import { backfillWikiTagEmbeddings } from "@/lib/wiki-tag-embeddings"

export async function manageWikiTagAction(input: {
  action: "merge" | "rename" | "promote" | "demote" | "delete"
  sourceId?: string
  targetId?: string
  name?: string
  sectionId?: string
  deleteIds?: string[]
  expectedNodeIds?: string[]
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const [canAccess, canManage] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])
  if (!canAccess || !canManage)
    return {
      ok: false,
      message: "You do not have permission to manage the Wiki.",
    }

  const { error } = await supabase.rpc("manage_wiki_tag", {
    p_action: input.action,
    p_source_id: input.sourceId ?? null,
    p_target_id: input.targetId ?? null,
    p_name: input.name?.trim().replace(/\s+/g, " ") ?? null,
    p_section_id: input.sectionId ?? null,
    p_delete_ids: input.deleteIds ?? null,
    p_expected_node_ids: input.expectedNodeIds ?? null,
  })
  if (error) {
    const message = error.message
    if (message.includes("wiki_tag_name_conflict") || error.code === "23505")
      return {
        ok: false,
        message:
          "A tag with this name already exists. Choose another name or merge the tags.",
      }
    if (message.includes("wiki_tag_out_of_scope"))
      return {
        ok: false,
        message:
          "Some pages are outside the target tag's section. Choose a global tag or a tag in their section.",
      }
    if (message.includes("wiki_tag_demote_blocked"))
      return {
        ok: false,
        message:
          "Some pages are outside this section. A section-only tag can only be used within its section.",
      }
    if (message.includes("wiki_tag_delete_used"))
      return {
        ok: false,
        message:
          "Some tags are now in use or no longer exist. Refresh and try again.",
      }
    if (message.includes("wiki_tag_preview_changed"))
      return {
        ok: false,
        message:
          "The pages using this tag changed. Refresh to see the latest count and try again.",
      }
    if (message.includes("wiki_tag_invalid"))
      return { ok: false, message: "Choose a valid tag, name, and section." }
    return {
      ok: false,
      message: "Could not update this tag. Refresh and try again.",
    }
  }
  if (input.action === "rename")
    await backfillWikiTagEmbeddings(
      supabase,
      input.name ? [input.name.trim().replace(/\s+/g, " ")] : []
    )
  revalidatePath("/wiki", "layout")
  return { ok: true, message: "Tag updated." }
}
