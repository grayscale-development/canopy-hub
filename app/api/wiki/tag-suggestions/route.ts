import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { WIKI_MANAGE_PERMISSION, type WikiTagRow } from "@/lib/wiki"
import { embedTexts } from "@/lib/wiki-ai"
import { findSimilarWikiTags } from "@/lib/wiki-tag-similarity"

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })
  const permissions = await Promise.all(
    [BETA_1_PERMISSION, WIKI_MANAGE_PERMISSION].map((code) =>
      userHasPermissionCode({ supabase, userId: user.id, code })
    )
  )
  if (permissions.some((allowed) => !allowed))
    return NextResponse.json({ results: [] }, { status: 403 })
  const input: unknown = await request.json().catch(() => null)
  if (!input || typeof input !== "object")
    return NextResponse.json({ results: [] }, { status: 400 })
  const body = input as Record<string, unknown>
  if (
    body.event === "shown" ||
    body.event === "accepted" ||
    body.event === "ignored"
  ) {
    await supabase.rpc("record_wiki_tag_suggestion", { p_event: body.event })
    return NextResponse.json({ ok: true })
  }
  const name =
    typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : ""
  if (
    !name ||
    name.length > 60 ||
    !(body.sectionId === null || typeof body.sectionId === "string")
  ) {
    return NextResponse.json({ results: [] }, { status: 400 })
  }
  const { data: permitted, error: rateError } = await supabase.rpc(
    "consume_wiki_tag_suggestion_rate"
  )
  if (rateError || !permitted) return NextResponse.json({ results: [] })

  // Only visible section names leave the server. The local matcher handles
  // global and current-section tags without waiting for this request.
  const { data: tags, error: tagError } = await supabase
    .from("wiki_tags")
    .select("id,name,scope,section_id")
  const others = ((tagError ? [] : (tags ?? [])) as WikiTagRow[]).filter(
    (tag) => tag.scope === "section" && tag.section_id !== body.sectionId
  )
  const matches = findSimilarWikiTags(name, others)
  const ids = [
    ...new Set(
      matches.flatMap(({ tag }) => (tag.section_id ? [tag.section_id] : []))
    ),
  ]
  const { data: sections, error: sectionError } = ids.length
    ? await supabase.from("milo_wiki_nodes").select("id,title").in("id", ids)
    : { data: [], error: null }
  const names = new Map(
    (sectionError ? [] : (sections ?? [])).map((section) => [
      section.id,
      section.title,
    ])
  )
  const lexical = matches.flatMap(({ tag, reason }) => {
    const sectionName = tag.section_id ? names.get(tag.section_id) : undefined
    return sectionName ? [{ ...tag, section_name: sectionName, reason }] : []
  })
  if (!process.env.OPENAI_EMBEDDING_MODEL?.trim())
    return NextResponse.json({ results: lexical.slice(0, 3) })
  try {
    const [embedding] = await embedTexts([name], AbortSignal.timeout(3000))
    if (
      !embedding ||
      embedding.length !== 1536 ||
      !embedding.some((value) => value !== 0)
    )
      return NextResponse.json({ results: lexical.slice(0, 3) })
    const configured = Number(
      process.env.WIKI_TAG_SIMILARITY_THRESHOLD ?? "0.80"
    )
    const threshold =
      Number.isFinite(configured) && configured >= 0 && configured <= 1
        ? configured
        : 0.8
    const { data, error } = await supabase.rpc("match_wiki_tags", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: 10,
    })
    const semantic = error
      ? []
      : (data ?? []).map(
          (tag: WikiTagRow & { section_name: string | null }) => ({
            ...tag,
            reason: "similar meaning",
          })
        )
    return NextResponse.json({
      results: [...lexical, ...semantic].slice(0, 10),
    })
  } catch {
    return NextResponse.json({ results: lexical.slice(0, 3) })
  }
}
