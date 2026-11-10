import "server-only"

import { createHash } from "node:crypto"

import { embedTexts } from "@/lib/wiki-ai"
import {
  blockNoteToPlainText,
  type SupabaseWikiClient,
  type WikiNodeRow,
} from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

// A passage occurring on more than this many other pages is boilerplate.
export const COMMON_PAGE_LIMIT = 3
export const MIN_PASSAGE_LENGTH = 40
export const NEAR_EXACT_THRESHOLD = 0.72
export const EMBEDDING_THRESHOLD = 0.86
const MAX_PASSAGES = 80
const MAX_PASSAGE_CHARS = 5000
const MAX_VISIBLE_NODES = 5000
const MAX_COMPARISONS = 100_000
const MAX_CANDIDATE_CHARS = 2_000_000
const CACHE_TTL_MS = 30_000
const CACHE_SIZE = 50
const PAGE_SIZE = 1000

type Passage = { blockId: string; text: string; hashText?: string }
export type DuplicateHit = {
  pageId: string
  revisionId: string
  title: string
  path: string
  snippet: string
  text: string
  score: number
  type: "near-exact" | "paraphrase"
}
export type DuplicateResult = {
  revisionId: string
  passages: {
    blockId: string
    passageHash: string
    text: string
    common: boolean
    matches: DuplicateHit[]
  }[]
  dismissed?: {
    blockId: string
    passageHash: string
    text: string
    match: Pick<DuplicateHit, "pageId" | "title" | "path">
  }[]
}
const cache = new Map<string, { expires: number; result: DuplicateResult }>()

export class DuplicateInputError extends Error {}

export function normalizeDuplicateText(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function hashDuplicatePassage(text: string) {
  return createHash("sha256").update(normalizeDuplicateText(text)).digest("hex")
}

function prepareText(text: string) {
  const normalized = normalizeDuplicateText(text)
  const words = normalized.split(" ")
  const shingles = new Set<string>()
  for (let i = 0; i <= words.length - 3; i++)
    shingles.add(words.slice(i, i + 3).join(" "))
  return { normalized, shingles }
}

function preparedScore(
  left: ReturnType<typeof prepareText>,
  right: ReturnType<typeof prepareText>
) {
  if (left.normalized === right.normalized) return left.normalized ? 1 : 0
  const x = left.shingles
  const y = right.shingles
  const intersection = [...x].filter((item) => y.has(item)).length
  return x.size + y.size - intersection
    ? intersection / (x.size + y.size - intersection)
    : 0
}

export function nearExactScore(a: string, b: string) {
  return preparedScore(prepareText(a), prepareText(b))
}

// Visit each block once, preserving document order and block IDs.
function wikiBlocks(blocks: unknown): (Passage & { type: unknown })[] {
  if (!Array.isArray(blocks)) return []
  const passages: (Passage & { type: unknown })[] = []
  const visit = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const block = item as Record<string, unknown>
      const text = blockNoteToPlainText([{ ...block, children: [] }]).trim()
      if (typeof block.id === "string" && text)
        passages.push({ blockId: block.id, text, type: block.type })
      if (Array.isArray(block.children)) visit(block.children)
    }
  }
  visit(blocks)
  return passages
}

export function wikiPassages(blocks: unknown): Passage[] {
  return wikiBlocks(blocks)
    .filter(
      (block) =>
        block.type !== "heading" &&
        normalizeDuplicateText(block.text).length >= MIN_PASSAGE_LENGTH
    )
    .map(({ blockId, text }) => ({ blockId, text }))
}

function selectedPassages(blocks: unknown, selection: string): Passage[] {
  const normalized = normalizeDuplicateText(selection)
  if (normalized.length < MIN_PASSAGE_LENGTH)
    throw new DuplicateInputError("Selection is too short to check.")
  let document = ""
  const spans = wikiBlocks(blocks).map((block) => {
    const text = normalizeDuplicateText(block.text)
    if (document && text) document += " "
    const start = document.length
    document += text
    return { ...block, start, end: document.length }
  })
  const found = new Map<string, Passage>()
  let position = document.indexOf(normalized)
  while (position !== -1) {
    const end = position + normalized.length
    for (const span of spans) {
      if (span.type === "heading") continue
      const part = document
        .slice(Math.max(position, span.start), Math.min(end, span.end))
        .trim()
      if (
        part.length >= MIN_PASSAGE_LENGTH &&
        (!found.has(span.blockId) ||
          found.get(span.blockId)!.text.length < part.length)
      )
        found.set(span.blockId, {
          blockId: span.blockId,
          text: part,
          hashText: span.text,
        })
    }
    position = document.indexOf(normalized, position + 1)
  }
  if (!found.size)
    throw new DuplicateInputError(
      "Select text from the current page that includes a passage long enough to check."
    )
  return [...found.values()]
}

function validPath(node: WikiNodeRow, byId: Map<string, WikiNodeRow>) {
  const seen = new Set<string>()
  let current: WikiNodeRow | undefined = node
  while (current) {
    if (
      seen.has(current.id) ||
      current.status === "archived" ||
      !Number.isSafeInteger(current.short_id) ||
      current.short_id <= 0
    )
      return false
    seen.add(current.id)
    if (!current.parent_id) return true
    current = byId.get(current.parent_id)
  }
  return false
}

async function visibleNodes(supabase: SupabaseWikiClient) {
  const nodes: WikiNodeRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("milo_wiki_nodes")
      .select("id")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const ids = (data ?? []).map((row) => row.id)
    if (offset + ids.length > MAX_VISIBLE_NODES)
      throw new DuplicateInputError("Wiki is too large to check at once.")
    for (let start = 0; start < ids.length; start += 100) {
      const details = await supabase
        .from("wiki_nodes")
        .select("id,short_id,parent_id,type,title,status,current_revision_id")
        .in("id", ids.slice(start, start + 100))
      if (details.error) throw new Error(details.error.message)
      nodes.push(...((details.data ?? []) as WikiNodeRow[]))
    }
    if (!data || data.length < PAGE_SIZE)
      return nodes.sort((a, b) => a.id.localeCompare(b.id))
  }
}

function cacheKey(
  userId: string,
  nodeId: string,
  text: string | undefined,
  nodes: WikiNodeRow[]
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        nodeId,
        text ?? null,
        NEAR_EXACT_THRESHOLD,
        EMBEDDING_THRESHOLD,
        COMMON_PAGE_LIMIT,
        nodes.map((node) => [
          node.id,
          node.parent_id,
          node.short_id,
          node.title,
          node.status,
          node.current_revision_id,
        ]),
      ])
    )
    .digest("hex")
}

export async function detectWikiDuplicates(
  supabase: SupabaseWikiClient,
  userId: string,
  nodeId: string,
  selection?: string,
  includeDismissed = false
): Promise<DuplicateResult | null> {
  const nodes = await visibleNodes(supabase)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const node = byId.get(nodeId)
  if (
    !node ||
    node.type !== "page" ||
    !validPath(node, byId) ||
    !node.current_revision_id
  )
    return null
  const key = cacheKey(userId, nodeId, selection, nodes)
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return applyDismissals(
      supabase,
      nodeId,
      cached.result,
      includeDismissed,
      nodes
    )
  }
  cache.delete(key)
  const pages = nodes.filter(
    (item) =>
      item.type === "page" && item.current_revision_id && validPath(item, byId)
  )
  const revisions = new Map<string, unknown>()
  const ids = pages.map((page) => page.current_revision_id!)
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await supabase
      .from("wiki_page_revisions")
      .select("id,node_id,blocks")
      .in("id", ids.slice(start, start + 100))
    if (error) throw new Error(error.message)
    for (const revision of data ?? []) {
      if (byId.get(revision.node_id)?.current_revision_id === revision.id)
        revisions.set(revision.node_id, revision.blocks)
    }
  }
  if (!revisions.has(nodeId)) return null
  const passages =
    selection === undefined
      ? wikiPassages(revisions.get(nodeId))
      : selectedPassages(revisions.get(nodeId), selection)
  if (
    passages.length > MAX_PASSAGES ||
    passages.some((passage) => passage.text.length > MAX_PASSAGE_CHARS)
  )
    throw new DuplicateInputError(
      "Page is too large to check at once. Select a shorter passage."
    )
  const others = pages
    .filter((page) => page.id !== nodeId && revisions.has(page.id))
    .map((page) => ({ page, passages: wikiPassages(revisions.get(page.id)) }))
  const candidateCount = others.reduce(
    (count, page) => count + page.passages.length,
    0
  )
  const candidateChars = others.reduce(
    (count, page) =>
      count +
      page.passages.reduce((sum, passage) => sum + passage.text.length, 0),
    0
  )
  if (candidateChars > MAX_CANDIDATE_CHARS)
    throw new DuplicateInputError("Wiki is too large to check at once.")
  if (candidateCount * passages.length > MAX_COMPARISONS)
    throw new DuplicateInputError(
      "Wiki is too large to check at once. Try a shorter selection."
    )
  const preparedOthers = others.map(({ page, passages }) => ({
    page,
    passages: passages.map((passage) => ({
      ...passage,
      prepared: prepareText(passage.text),
    })),
  }))
  const result: DuplicateResult = {
    revisionId: node.current_revision_id,
    passages: passages.map((passage) => {
      const prepared = prepareText(passage.text)
      const hits = preparedOthers.flatMap(
        ({ page, passages: candidates }): DuplicateHit[] => {
          let best: { text: string; score: number } | undefined
          for (const candidate of candidates) {
            const score = preparedScore(prepared, candidate.prepared)
            if (score >= NEAR_EXACT_THRESHOLD && (!best || score > best.score))
              best = { text: candidate.text, score }
          }
          return best
            ? [
                {
                  pageId: page.id,
                  revisionId: page.current_revision_id!,
                  title: page.title,
                  path: `/wiki/${buildNumericWikiPath(nodes, page)}`,
                  snippet: best.text.replace(/\s+/g, " ").slice(0, 260),
                  text: best.text,
                  score: best.score,
                  type: "near-exact",
                },
              ]
            : []
        }
      )
      return {
        blockId: passage.blockId,
        passageHash: hashDuplicatePassage(passage.hashText ?? passage.text),
        text: passage.hashText ?? passage.text,
        common: hits.length > COMMON_PAGE_LIMIT,
        matches: hits.length > COMMON_PAGE_LIMIT ? [] : hits,
      }
    }),
  }

  // A single bounded batch and four concurrent searches keep provider work limited.
  const eligible = passages
    .map((passage, index) => ({ passage, index }))
    .filter(({ index }) => !result.passages[index].common)
  if (
    eligible.length &&
    (process.env.OPENAI_EMBEDDING_MODEL === "fake-embedding" ||
      process.env.OPENAI_API_KEY)
  ) {
    try {
      const embeddings = await embedTexts(
        eligible.map(({ passage }) => passage.text),
        AbortSignal.timeout(3000)
      )
      let next = 0
      await Promise.allSettled(
        Array.from({ length: Math.min(4, eligible.length) }, async () => {
          while (next < eligible.length) {
            const i = next++
            if (!embeddings[i]?.length) continue
            const response = await supabase.rpc("match_knowledge_chunks", {
              query_embedding: embeddings[i],
              match_count: 30,
              source_types: ["wiki_page"],
            })
            if (response.error) continue
            const target = result.passages[eligible[i].index]
            for (const row of response.data ?? []) {
              const metadata = row.metadata as Record<string, unknown> | null
              const candidate =
                typeof metadata?.nodeId === "string"
                  ? byId.get(metadata.nodeId)
                  : undefined
              if (
                !candidate ||
                candidate.id === nodeId ||
                candidate.type !== "page" ||
                !validPath(candidate, byId) ||
                metadata?.revisionId !== candidate.current_revision_id ||
                !revisions.has(candidate.id) ||
                !Number.isFinite(row.similarity) ||
                row.similarity < EMBEDDING_THRESHOLD ||
                target.matches.some((hit) => hit.pageId === candidate.id)
              )
                continue
              target.matches.push({
                pageId: candidate.id,
                revisionId: candidate.current_revision_id!,
                title: candidate.title,
                path: `/wiki/${buildNumericWikiPath(nodes, candidate)}`,
                snippet: String(row.content)
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 260),
                text: String(row.content).trim(),
                score: row.similarity,
                type: "paraphrase",
              })
            }
          }
        })
      )
    } catch {
      // Exact matching remains available when the provider is unavailable.
    }
  }
  for (const passage of result.passages)
    passage.matches.sort((a, b) => b.score - a.score)
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result })
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  return applyDismissals(supabase, nodeId, result, includeDismissed, nodes)
}

async function applyDismissals(
  supabase: SupabaseWikiClient,
  nodeId: string,
  result: DuplicateResult,
  includeDismissed: boolean,
  nodes: WikiNodeRow[]
): Promise<DuplicateResult> {
  const keys = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("wiki_duplicate_dismissals")
      .select("other_node_id,passage_hash")
      .eq("node_id", nodeId)
      .order("other_node_id")
      .order("passage_hash")
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    for (const row of data ?? [])
      keys.add(`${row.other_node_id}:${row.passage_hash}`)
    if (!data || data.length < PAGE_SIZE) break
  }
  const dismissed: NonNullable<DuplicateResult["dismissed"]> = []
  if (includeDismissed) {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    for (const passage of result.passages) {
      for (const node of nodes) {
        if (
          node.type !== "page" ||
          !validPath(node, byId) ||
          !keys.has(`${node.id}:${passage.passageHash}`)
        )
          continue
        dismissed.push({
          blockId: passage.blockId,
          passageHash: passage.passageHash,
          text: passage.text,
          match: {
            pageId: node.id,
            title: node.title,
            path: `/wiki/${buildNumericWikiPath(nodes, node)}`,
          },
        })
      }
    }
  }
  const passages = result.passages.map((passage) => ({
    ...passage,
    matches: passage.matches.filter((match) => {
      if (!keys.has(`${match.pageId}:${passage.passageHash}`)) return true
      return false
    }),
  }))
  return {
    revisionId: result.revisionId,
    passages,
    ...(includeDismissed ? { dismissed } : {}),
  }
}
