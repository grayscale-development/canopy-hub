import "server-only"

import { z } from "zod"
import {
  getImportAiOutput,
  mergeWikiPageContent,
} from "@/lib/ai/wiki-import-pipeline"
import { isEditablePage } from "@/lib/milo/find-page"
import { extractionSchema } from "@/lib/milo/source-workflow"
import type { MiloCard } from "@/lib/milo/chat-cards"
import {
  blockNoteToPlainText,
  type SupabaseWikiClient,
  type WikiRevisionRow,
} from "@/lib/wiki"
import {
  createWikiImportDraft,
  isFaithfulWikiImportOutput,
  isFaithfulWikiUpdate,
} from "@/lib/wiki-import"
import { wikiNonTextChangeNotes } from "@/lib/wiki-diff"

export const MAX_MILO_TWEAKS = 3

// Model Markdown is converted to blocks by the import pipeline. Validate the
// resulting block shape before retaining it for a future apply operation.
const textInlineSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    styles: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
const inlineSchema = z.union([
  z.string(),
  z.array(
    z.union([
      textInlineSchema,
      z
        .object({
          type: z.literal("link"),
          href: z.string(),
          content: z.array(textInlineSchema),
        })
        .passthrough(),
    ])
  ),
])
const tableSchema = z
  .object({
    type: z.literal("tableContent"),
    rows: z.array(z.object({ cells: z.array(inlineSchema) }).passthrough()),
  })
  .passthrough()
const generatedBlockSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "paragraph",
        "heading",
        "bulletListItem",
        "numberedListItem",
        "table",
        "image",
      ]),
      content: z.union([inlineSchema, tableSchema]).optional(),
      props: z.record(z.string(), z.unknown()).optional(),
      children: z.array(generatedBlockSchema).optional(),
    })
    .passthrough()
    .superRefine((block, context) => {
      if (
        block.type === "table" &&
        !tableSchema.safeParse(block.content).success
      ) {
        context.addIssue({ code: "custom", message: "Invalid table content" })
      }
      if (block.type === "image" && typeof block.props?.url !== "string") {
        context.addIssue({ code: "custom", message: "Invalid image URL" })
      }
      if (
        !["table", "image"].includes(block.type) &&
        !inlineSchema.safeParse(block.content).success
      ) {
        context.addIssue({ code: "custom", message: "Invalid text content" })
      }
    })
)

export async function prepareMiloProposal({
  supabase,
  pageId,
  extraction: rawExtraction,
  baseRevisionId,
  feedback = [],
}: {
  supabase: SupabaseWikiClient
  pageId: string
  extraction: unknown
  baseRevisionId?: string | null
  feedback?: string[]
}) {
  const extraction = extractionSchema.parse(rawExtraction)
  if (!(await isEditablePage(supabase, pageId)))
    throw new Error("Page is no longer available.")
  const { data: page, error: pageError } = await supabase
    .from("wiki_nodes")
    .select("id,title,current_revision_id")
    .eq("id", pageId)
    .eq("type", "page")
    .maybeSingle()
  if (pageError || !page) throw new Error("Page is no longer available.")
  const revisionId =
    baseRevisionId === undefined ? page.current_revision_id : baseRevisionId
  let revision: WikiRevisionRow | null = null
  if (revisionId) {
    const result = await supabase
      .from("wiki_page_revisions")
      .select("*")
      .eq("id", revisionId)
      .eq("node_id", pageId)
      .maybeSingle()
    if (result.error || !result.data)
      throw new Error("Base revision is no longer available.")
    revision = result.data as WikiRevisionRow
  }
  const text = extraction.facts.join("\n\n")
  let aiOutput = null
  try {
    aiOutput = await getImportAiOutput(
      text,
      "Pasted text",
      "",
      revision?.plain_text ?? "",
      feedback.join("\n")
    )
  } catch {
    // Same lossless fallback as AI Update: keep the page and append the facts.
  }
  const aiSchema = z.object({
    title: z.string(),
    tags: z.array(z.string()),
    markdown: z.string().min(1),
  })
  let draft = createWikiImportDraft({
    text,
    fileName: "Pasted text",
    aiOutput: aiSchema.safeParse(aiOutput).success ? aiOutput : null,
  })
  if (!z.array(generatedBlockSchema).safeParse(draft.blocks).success) {
    draft = createWikiImportDraft({ text, fileName: "Pasted text" })
  }
  if (!draft.usedAi && !isFaithfulWikiImportOutput(text, draft.plainText)) {
    const blocks = extraction.facts.map((fact) => ({
      type: "paragraph",
      content: fact,
      children: [],
    }))
    draft = { ...draft, blocks, plainText: blockNoteToPlainText(blocks) }
  }
  const beforeBlocks = Array.isArray(revision?.blocks) ? revision.blocks : []
  const merged = Boolean(
    revision &&
    draft.usedAi &&
    isFaithfulWikiUpdate(revision.plain_text, draft.markdown, text, draft.title)
  )
  const candidate = mergeWikiPageContent({
    existingRevision: revision,
    draft,
    mode: merged ? "replace" : "update",
  })
  const notes = wikiNonTextChangeNotes(beforeBlocks, candidate.blocks)
  const unsafeNotes = notes.filter((note) =>
    /^A (?:picture|table|link)|^An attached file/.test(note)
  )
  const unsafe = unsafeNotes.length > 0
  // Keep complex existing content intact if text conversion would alter it.
  const content =
    unsafe && merged
      ? mergeWikiPageContent({
          existingRevision: revision,
          draft: {
            blocks: extraction.facts.map((fact) => ({
              type: "paragraph",
              content: fact,
              children: [],
            })),
            plainText: text,
          },
          mode: "update",
        })
      : candidate
  const after = blockNoteToPlainText(content.blocks)
  const notAdded = extraction.facts.filter(
    (fact) => !isFaithfulWikiImportOutput(fact, after)
  )
  const added = extraction.facts.filter((fact) => !notAdded.includes(fact))
  const attribution = [extraction.source.sender, extraction.source.date]
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
  const fellBack =
    !draft.usedAi || Boolean(revision && !merged) || (unsafe && merged)
  const fallbackSummary = `${feedback.length ? "I couldn't make that adjustment safely. " : ""}I kept the existing page${added.length ? " and added the confirmed facts" : ""}.${added.length && added.join("; ").length <= 240 ? ` ${added.join("; ")}` : ""}`
  const card: Extract<MiloCard, { type: "proposed-edit" }> = {
    type: "proposed-edit",
    id: "proposed-edit",
    pageId,
    pageTitle: page.title,
    baseRevisionId: revisionId,
    before: revision?.plain_text ?? "",
    after,
    beforeBlocks,
    blocks: content.blocks as Array<Record<string, unknown>>,
    plain_text: after,
    changeNote: `Updated from email thread${attribution ? ` from ${attribution}` : ""}`,
    summary: fellBack
      ? fallbackSummary
      : added.length
        ? added.join("; ").length <= 240
          ? `I incorporated: ${added.join("; ")}`
          : `I incorporated ${added.length} confirmed changes.`
        : "I couldn't place the confirmed facts in this page.",
    notAdded,
    nonTextNotes:
      unsafe && merged
        ? unsafeNotes.map(
            (note) =>
              `I kept the original content because the generated edit would change it. ${note}`
          )
        : [],
  }
  return { card, baseRevisionId: revisionId }
}
