import "server-only"

import { revalidatePath } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { archiveKnowledgeSource, indexWikiPage } from "@/lib/wiki-ai"
import {
  fetchCurrentRevision,
  fetchWikiNodes,
  isPublishedWikiBranch,
  type SupabaseWikiClient,
} from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

export async function miloPagePath(
  supabase: SupabaseWikiClient,
  nodeId: string
) {
  const nodes = await fetchWikiNodes(supabase)
  const node = nodes.find((item) => item.id === nodeId && item.type === "page")
  if (!node) throw new Error("Page is no longer available.")
  return { nodes, node, path: buildNumericWikiPath(nodes, node) }
}

export async function indexMiloPage(
  supabase: SupabaseWikiClient,
  nodeId: string
) {
  const { nodes, node, path } = await miloPagePath(supabase, nodeId)
  const admin = createSupabaseAdminClient()
  if (node.status === "draft" && node.import_content_hash) {
    await archiveKnowledgeSource({
      supabase: admin,
      sourceType: "wiki_page",
      sourceId: node.id,
    })
  } else {
    const revision = await fetchCurrentRevision(supabase, node)
    await indexWikiPage({
      supabase: admin,
      node,
      revision,
      path,
      isPublished: isPublishedWikiBranch(nodes, node),
    })
  }
  revalidatePath("/wiki")
  revalidatePath(`/wiki/${path}`)
}
