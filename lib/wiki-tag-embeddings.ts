import "server-only"

import { embedTexts } from "@/lib/wiki-ai"
import type { SupabaseWikiClient } from "@/lib/wiki"

// Bounded, opportunistic backfill after tag changes. A failed provider never
// affects the save; a later tag change retries rows still missing embeddings.
export async function backfillWikiTagEmbeddings(
  supabase: SupabaseWikiClient,
  preferredNames: string[] = []
) {
  if (!process.env.OPENAI_EMBEDDING_MODEL?.trim()) return
  try {
    const { data: preferred, error: preferredError } = preferredNames.length
      ? await supabase
          .from("wiki_tags")
          .select("id,name,scope,section_id")
          .is("embedding", null)
          .in("name", preferredNames)
      : { data: [], error: null }
    if (preferredError) return
    const { data: pending, error } = await supabase
      .from("wiki_tags")
      .select("id,name,scope,section_id")
      .is("embedding", null)
      .order("created_at")
      .limit(100)
    if (error) return
    const candidates = [...(preferred ?? []), ...(pending ?? [])].filter(
      (tag, index, all) =>
        all.findIndex((other) => other.id === tag.id) === index
    )
    const sectionIds = [
      ...new Set(
        candidates.flatMap((tag) => (tag.section_id ? [tag.section_id] : []))
      ),
    ]
    const { data: sections, error: sectionError } = sectionIds.length
      ? await supabase.from("milo_wiki_nodes").select("id").in("id", sectionIds)
      : { data: [], error: null }
    if (sectionError) return
    const visibleSections = new Set(
      (sections ?? []).map((section) => section.id)
    )
    const data = candidates
      .filter(
        (tag) =>
          tag.scope === "global" ||
          (tag.section_id && visibleSections.has(tag.section_id))
      )
      .slice(0, 20)
    if (!data.length) return
    const embeddings = await embedTexts(
      data.map((tag) => tag.name),
      AbortSignal.timeout(3000)
    )
    await Promise.all(
      data.map((tag, index) => {
        const embedding = embeddings[index]
        if (
          !embedding ||
          embedding.length !== 1536 ||
          !embedding.some((value) => value !== 0)
        )
          return
        return supabase
          .from("wiki_tags")
          .update({ embedding })
          .eq("id", tag.id)
          .eq("name", tag.name)
          .is("embedding", null)
      })
    )
  } catch {
    // Embeddings are advisory and can be retried on the next tag change.
  }
}
