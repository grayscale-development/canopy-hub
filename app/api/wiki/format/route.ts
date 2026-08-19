import { NextResponse } from "next/server"

import {
  createAgentResponseWithOpenAI,
  getFormatModel,
} from "@/lib/ai/provider"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  type WikiFormatCalloutTone,
  type WikiFormatItem,
  type WikiFormatMediaPatch,
  type WikiFormatOutputItem,
  type WikiFormatResponse,
  type WikiFormatStats,
  WIKI_FORMAT_VERSION,
} from "@/lib/wiki-format"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"

export const runtime = "nodejs"
export const maxDuration = 45

interface FormatWikiRequestBody {
  formatVersion?: unknown
  nodeId?: unknown
  title?: unknown
  items?: unknown
  sections?: unknown
  mode?: unknown
  videoTranscript?: unknown
}

interface FormatSection {
  id: string
  markdown: string
}

interface LegacyFormatResponseBody {
  summary?: unknown
  sections?: unknown
}

interface LayoutFormatResponseBody {
  summary?: unknown
  items?: unknown
  rewriteSections?: unknown
}

type LayoutPlanItem =
  | {
      type: "markdown"
      sourceIds: string[]
      markdown?: string
    }
  | {
      type: "callout"
      tone: WikiFormatCalloutTone
      sourceIds: string[]
      markdown?: string
    }
  | {
      type: "ref"
      id: string
      mediaPatch?: WikiFormatMediaPatch
    }
  | {
      type: "divider"
    }
  | {
      type: "spacer"
    }

interface RewriteSection {
  id: string
  instructions: string
}

const MIN_PRESERVED_TEXT_RATIO = 0.35
const MAX_FORMATTED_TEXT_RATIO = 5
const FORMAT_TIMEOUT_MS = 30_000
const MAX_REWRITE_SECTIONS = 8
const MAX_INSERTED_CALLOUTS = 1
const MAX_INSERTED_DIVIDERS = 1
const MAX_INSERTED_SPACERS = 4
const MAX_CALLOUT_TEXT_LENGTH = 360
const VIDEO_TRANSCRIPT_SOURCE_ID = "video-transcript-source"
const GENERIC_OPENING_HEADINGS = new Set([
  "about this page",
  "document overview",
  "guide",
  "introduction",
  "intro",
  "overview",
  "page overview",
  "procedure",
  "process",
  "summary",
])
const TITLE_HEADING_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "for",
  "guide",
  "how",
  "instructions",
  "instruction",
  "intro",
  "introduction",
  "of",
  "overview",
  "page",
  "procedure",
  "process",
  "summary",
  "the",
  "this",
  "to",
  "wiki",
])
const RICH_ITEM_TYPES = new Set<WikiFormatItem["type"]>([
  "media",
  "table",
  "divider",
])
const CANOPY_WIKI_REWRITE_STANDARD = `Canopy Wiki Rewrite Standard:

Purpose:
- Rewrite internal operational documentation so it is clearer, more polished, easier to scan, and faithful to the original procedure.
- You may add concise connective wording, section introductions, missing headings, summary labels, and clarifying phrasing when it improves the page.
- You may remove duplicated text, pasted-document noise, filler, redundant headings, and low-value repetition.
- Do not invent facts, policy, contacts, links, requirements, system behavior, or procedural steps that are not supported by the source.

Structure:
- Use real Markdown headings, not bold text as headings.
- Never use # headings in the editor body. The Wiki page title is already the page H1.
- The Wiki UI already displays the page title above the editor. Treat the editor body as content that starts underneath that title.
- Do not start the body with a duplicate title, near-duplicate title, "Overview", "Introduction", "[Title] Guide", or other generic opener heading.
- Start with the first useful paragraph, note, list, or real subsection beneath the page title.
- Use ## for major sections and ### for subsections.
- Do not over-structure short advisory text. Most notes should be normal paragraphs or bullets, not headings, callouts, or standalone sections.
- Put a blank line before and after every heading.
- Keep sections short and scannable.
- Add dividers only between major unrelated sections or before/after rich media when it improves readability. Do not put dividers around every small note. Most documents need zero or one new divider.

Capitalization:
- Convert all-caps headings to title case.
- Preserve acronyms, system names, product names, loan terms, and proper nouns.
- Do not use title case for normal paragraphs or list items.

Paragraphs:
- Use concise paragraphs, usually 1-3 sentences.
- Remove PDF/Word paste artifacts such as broken line wraps, repeated spaces, OCR spacing, and duplicated blank lines.
- Rewrite awkward or unclear sentences into direct internal documentation.
- Do not make marketing-style rewrites.

Lists and steps:
- Use numbered lists for sequential actions.
- Use bullet lists for requirements, options, notes, or supporting details.
- Indent nested bullets under the relevant parent item.
- Put a blank line between an introductory sentence and a list.
- A "Next Steps" or similar phrase may be a section heading, but the individual steps beneath it should be a numbered list or lower-level content, not peer headings.

Procedures:
- Preserve exact system actions, labels, buttons, page names, fields, warnings, requirements, contacts, dates, numbers, and compliance language.
- Do not invent missing steps.
- Do not invent procedural sections such as "Before You Begin" unless the source supports that content.
- If the original text implies a section heading, create one.

Emphasis:
- Use bold sparingly for labels, warnings, or important terms.
- Do not use bold as a substitute for headings.
- Use callouts rarely. A typical document should have zero callouts, and a document should almost never have more than one.
- Use a callout only for a short, high-value operational note that would be easy to miss and where missing it could cause the user to take the wrong action.
- Do not use callouts for general context, ordinary instructions, repeated cautions, long paragraphs, lists, or anything that belongs in the normal document flow.
- Choose callout tone by meaning, not keywords: red for critical warnings or do-not-do guidance, yellow for caution or heads-up guidance, blue for informational context, green for positive confirmation or best practice, and gray for neutral notes.
- Avoid excessive italics, decorative formatting, emojis, or color.

Media:
- Preserve all images, files, videos, tables, and other rich blocks.
- Move media only when it clearly improves the document flow.
- Captions may be clarified, but URLs, filenames, and uploaded file metadata must not change.

Output:
- Return clean rewritten Markdown or layout items only.
- Prefer simple, stable page structure over clever formatting.`

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function extractJsonText(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  return trimmed
}

function getResponseText(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text
  }

  return ""
}

function parseJsonResponse<T>(response: unknown): T {
  const text = getResponseText(response)
  if (!text) {
    throw new Error("AI did not return rewritten content.")
  }

  try {
    return JSON.parse(extractJsonText(text)) as T
  } catch {
    throw new Error("AI returned invalid JSON.")
  }
}

function markdownToComparableText(value: string) {
  return normalizeText(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^[\s>*-]*[-+*]\s+/gm, "")
      .replace(/^[\s>]*\d+\.\s+/gm, "")
      .replace(/[*_~#>|-]+/g, " ")
  )
}

function normalizeFormattedMarkdown(value: string) {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      const h1Heading = trimmed.match(/^#\s+(.+)$/)
      if (h1Heading?.[1]) {
        return `## ${h1Heading[1].trim()}`
      }

      const deepHeading = trimmed.match(/^#{4,6}\s+(.+)$/)
      if (deepHeading?.[1]) {
        return `### ${deepHeading[1].trim()}`
      }

      const boldHeading = trimmed.match(/^\*\*([^*\n]{2,120})\*\*:?$/)
      if (boldHeading?.[1]) {
        return `## ${boldHeading[1].trim()}`
      }
      return line.trimEnd()
    })

  const normalized: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const previous = normalized.at(-1) ?? ""
    const previousTrimmed = previous.trim()
    const isHeading = /^#{1,6}\s+/.test(trimmed)
    const isListItem = /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line)
    const previousIsHeading = /^#{1,6}\s+/.test(previousTrimmed)
    const previousIsParagraph =
      previousTrimmed &&
      !previousIsHeading &&
      !/^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(previous)

    if (
      trimmed &&
      previousTrimmed &&
      ((isHeading && previousTrimmed) ||
        (isListItem && previousIsParagraph) ||
        (!isListItem && previousIsHeading))
    ) {
      normalized.push("")
    }

    normalized.push(line)
  }

  return normalized
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function normalizeHeadingText(value: string) {
  return normalizeText(
    value
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~#>|:.-]+/g, " ")
  ).toLowerCase()
}

function getSignificantHeadingWords(value: string) {
  return normalizeHeadingText(value)
    .split(" ")
    .filter((word) => word && !TITLE_HEADING_STOP_WORDS.has(word))
}

function isGenericOpeningHeading(heading: string) {
  return GENERIC_OPENING_HEADINGS.has(normalizeHeadingText(heading))
}

function isDuplicateTitleHeading(heading: string, title: string) {
  const normalizedHeading = normalizeHeadingText(heading)
  const normalizedTitle = normalizeHeadingText(title)
  if (!normalizedTitle || !normalizedHeading) {
    return false
  }
  if (normalizedHeading === normalizedTitle) {
    return true
  }

  const headingWords = getSignificantHeadingWords(heading)
  const titleWords = getSignificantHeadingWords(title)
  if (!headingWords.length || !titleWords.length) {
    return false
  }

  const headingWordSet = new Set(headingWords)
  const titleWordSet = new Set(titleWords)
  const sharedTitleWords = titleWords.filter((word) => headingWordSet.has(word))
  const sharedHeadingWords = headingWords.filter((word) =>
    titleWordSet.has(word)
  )

  return (
    sharedTitleWords.length / titleWords.length >= 0.8 &&
    sharedHeadingWords.length / headingWords.length >= 0.6
  )
}

function removeDuplicatePageHeading(markdown: string, title: string) {
  if (!normalizeHeadingText(title)) {
    return markdown
  }

  const leadingHeading = markdown.match(/^##\s+(.+?)[ \t]*(?:\n+|$)/)
  if (
    !leadingHeading?.[1] ||
    !isDuplicateTitleHeading(leadingHeading[1], title)
  ) {
    return markdown
  }

  return markdown.slice(leadingHeading[0].length).replace(/^\n+/, "").trim()
}

function removeOpeningBodyHeading(markdown: string, title: string) {
  const leadingHeading = markdown.match(/^##\s+(.+?)[ \t]*(?:\n+|$)/)
  if (
    !leadingHeading?.[1] ||
    (!isDuplicateTitleHeading(leadingHeading[1], title) &&
      !isGenericOpeningHeading(leadingHeading[1]))
  ) {
    return markdown
  }

  return markdown.slice(leadingHeading[0].length).replace(/^\n+/, "").trim()
}

function normalizeRewrittenMarkdown(value: string, title: string) {
  return removeDuplicatePageHeading(normalizeFormattedMarkdown(value), title)
}

function removeOpeningBodyHeadingFromSections(
  sections: FormatSection[],
  title: string
) {
  const firstContentIndex = sections.findIndex((section) =>
    Boolean(section.markdown.trim())
  )
  if (firstContentIndex === -1) {
    return sections
  }

  return sections.map((section, index) =>
    index === firstContentIndex
      ? {
          ...section,
          markdown: removeOpeningBodyHeading(section.markdown, title),
        }
      : section
  )
}

function removeOpeningBodyHeadingFromItems(
  items: WikiFormatOutputItem[],
  title: string
) {
  const firstContentIndex = items.findIndex(
    (item) =>
      (item.type === "markdown" || item.type === "callout") &&
      Boolean(item.markdown?.trim())
  )
  if (firstContentIndex === -1) {
    return items
  }

  return items.map((item, index) =>
    index === firstContentIndex &&
    (item.type === "markdown" || item.type === "callout")
      ? {
          ...item,
          markdown: removeOpeningBodyHeading(item.markdown, title),
        }
      : item
  )
}

function parseRequestSections(value: unknown): FormatSection[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): FormatSection | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null
      }

      const section = item as Record<string, unknown>
      const id = getString(section.id)
      const markdown = getString(section.markdown)
      return id && markdown ? { id, markdown } : null
    })
    .filter((item): item is FormatSection => Boolean(item))
}

function parseResponseSections(value: unknown): FormatSection[] {
  return parseRequestSections(value)
}

function parseFormatItems(value: unknown): WikiFormatItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): WikiFormatItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null
      }

      const record = item as Record<string, unknown>
      const type = getString(record.type) as WikiFormatItem["type"]
      const id = getString(record.id)
      if (
        !id ||
        !["text", "media", "table", "divider", "empty"].includes(type)
      ) {
        return null
      }

      const markdown = getString(record.markdown)
      if (type === "text" && !markdown) {
        return null
      }

      const parsed: WikiFormatItem = {
        type,
        id,
        markdown: markdown || undefined,
        blockType: getString(record.blockType) || undefined,
        name: getString(record.name) || undefined,
        caption: getString(record.caption) || undefined,
      }
      return parsed
    })
    .filter((item): item is WikiFormatItem => Boolean(item))
}

function parseMediaPatch(value: unknown): WikiFormatMediaPatch | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const allowedKeys = new Set(["caption", "showPreview"])
  const unsupportedKey = Object.keys(record).find(
    (key) => !allowedKeys.has(key)
  )
  if (unsupportedKey) {
    throw new Error(
      "AI rewrite attempted to change protected media details. No changes were applied."
    )
  }

  const patch: WikiFormatMediaPatch = {}
  if (typeof record.caption === "string") {
    patch.caption = record.caption.trim()
  }
  if (typeof record.showPreview === "boolean") {
    patch.showPreview = record.showPreview
  }

  return Object.keys(patch).length ? patch : undefined
}

function parseCalloutTone(value: unknown): WikiFormatCalloutTone {
  return value === "red" ||
    value === "yellow" ||
    value === "blue" ||
    value === "green" ||
    value === "gray"
    ? value
    : "gray"
}

function parseSourceIds(value: unknown) {
  return Array.isArray(value) ? value.map(getString).filter(Boolean) : []
}

function parseLayoutPlanItems(value: unknown): LayoutPlanItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): LayoutPlanItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null
      }

      const record = item as Record<string, unknown>
      const type = getString(record.type)
      if (type === "markdown") {
        const sourceIds = parseSourceIds(record.sourceIds)
        return sourceIds.length
          ? {
              type,
              sourceIds,
              markdown: getString(record.markdown) || undefined,
            }
          : null
      }

      if (type === "callout") {
        const sourceIds = parseSourceIds(record.sourceIds)
        return sourceIds.length
          ? {
              type,
              tone: parseCalloutTone(record.tone),
              sourceIds,
              markdown: getString(record.markdown) || undefined,
            }
          : null
      }

      if (type === "ref") {
        const id = getString(record.id)
        return id
          ? { type, id, mediaPatch: parseMediaPatch(record.mediaPatch) }
          : null
      }

      if (type === "divider" || type === "spacer") {
        return { type }
      }

      return null
    })
    .filter((item): item is LayoutPlanItem => Boolean(item))
}

function parseRewriteSections(value: unknown): RewriteSection[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null
      }

      const record = item as Record<string, unknown>
      const id = getString(record.id)
      return id ? { id, instructions: getString(record.instructions) } : null
    })
    .filter((item): item is RewriteSection => Boolean(item))
}

function validateTextRatio({
  originalText,
  formattedText,
  minRatio = MIN_PRESERVED_TEXT_RATIO,
  minimumLength = 0,
}: {
  originalText: string
  formattedText: string
  minRatio?: number
  minimumLength?: number
}) {
  if (originalText.length < 80) {
    return
  }

  const requiredMinimumLength = Math.max(
    minimumLength,
    Math.floor(originalText.length * minRatio)
  )
  if (formattedText.length < requiredMinimumLength) {
    throw new Error(
      "AI rewrite removed too much document text. No changes were applied."
    )
  }

  const maximumLength = Math.ceil(
    originalText.length * MAX_FORMATTED_TEXT_RATIO
  )
  if (formattedText.length > maximumLength) {
    throw new Error(
      "AI rewrite added too much new document text. No changes were applied."
    )
  }
}

function validateFormattedSections({
  originalSections,
  formattedSections,
}: {
  originalSections: FormatSection[]
  formattedSections: FormatSection[]
}) {
  if (!formattedSections.length) {
    throw new Error("AI returned empty rewritten content.")
  }

  const originalIds = new Set(originalSections.map((section) => section.id))
  const formattedIds = new Set(formattedSections.map((section) => section.id))
  if (
    originalIds.size !== formattedIds.size ||
    [...originalIds].some((id) => !formattedIds.has(id))
  ) {
    throw new Error(
      "AI rewrite changed the document section structure. No changes were applied."
    )
  }

  validateTextRatio({
    originalText: normalizeText(
      originalSections.map((section) => section.markdown).join("\n\n")
    ),
    formattedText: markdownToComparableText(
      formattedSections.map((section) => section.markdown).join("\n\n")
    ),
  })
}

function getOriginalText(items: WikiFormatItem[]) {
  return normalizeText(
    items
      .filter((item) => item.type === "text" || item.type === "table")
      .map((item) => item.markdown ?? "")
      .join("\n\n")
  )
}

function getFormattedText(items: WikiFormatOutputItem[]) {
  return markdownToComparableText(
    items
      .filter((item) => item.type === "markdown" || item.type === "callout")
      .map((item) => item.markdown)
      .join("\n\n")
  )
}

function getRequiredRefIds(items: WikiFormatItem[]) {
  return items
    .filter((item) => RICH_ITEM_TYPES.has(item.type))
    .map((item) => item.id)
}

function getStats({
  originalItems,
  outputItems,
}: {
  originalItems: WikiFormatItem[]
  outputItems: WikiFormatOutputItem[]
}): WikiFormatStats {
  const originalRichOrder = getRequiredRefIds(originalItems)
  const outputRichOrder = outputItems
    .filter((item): item is Extract<WikiFormatOutputItem, { type: "ref" }> => {
      return item.type === "ref" && originalRichOrder.includes(item.id)
    })
    .map((item) => item.id)
  const movedRichBlocks = outputRichOrder.filter(
    (id, index) => originalRichOrder[index] !== id
  ).length

  const originalTextById = new Map(
    originalItems
      .filter((item) => item.type === "text")
      .map((item) => [item.id, normalizeText(item.markdown ?? "")])
  )
  const changedTextGroups = outputItems.filter((item) => {
    if (
      (item.type !== "markdown" && item.type !== "callout") ||
      item.sourceIds?.length !== 1
    ) {
      return false
    }
    const originalText = originalTextById.get(item.sourceIds[0])
    return (
      originalText !== undefined &&
      originalText !== normalizeText(item.markdown)
    )
  }).length

  return {
    changedTextGroups,
    movedRichBlocks,
    insertedCallouts: outputItems.filter((item) => item.type === "callout")
      .length,
    insertedDividers: outputItems.filter((item) => item.type === "divider")
      .length,
    insertedSpacers: outputItems.filter((item) => item.type === "spacer")
      .length,
    captionChanges: outputItems.filter(
      (item) => item.type === "ref" && item.mediaPatch?.caption !== undefined
    ).length,
  }
}

function hasMarkdownStructure(value: string) {
  return /^#{1,6}\s+/m.test(value) || /^(\s*[-*+]\s+|\s*\d+\.\s+)/m.test(value)
}

function isConservativeCallout(item: WikiFormatOutputItem) {
  if (item.type !== "callout") {
    return false
  }

  const comparableText = markdownToComparableText(item.markdown)
  const lineCount = item.markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length

  return (
    comparableText.length > 0 &&
    comparableText.length <= MAX_CALLOUT_TEXT_LENGTH &&
    lineCount <= 3 &&
    !hasMarkdownStructure(item.markdown)
  )
}

function constrainLayoutComplexity(items: WikiFormatOutputItem[]) {
  const constrained: WikiFormatOutputItem[] = []
  let calloutCount = 0
  let dividerCount = 0
  let spacerCount = 0

  for (const item of items) {
    if (item.type === "callout") {
      if (
        calloutCount >= MAX_INSERTED_CALLOUTS ||
        !isConservativeCallout(item)
      ) {
        constrained.push({
          type: "markdown",
          sourceIds: item.sourceIds,
          markdown: item.markdown,
        })
        continue
      }

      calloutCount += 1
      constrained.push(item)
      continue
    }

    if (item.type === "divider") {
      if (
        dividerCount >= MAX_INSERTED_DIVIDERS ||
        constrained.at(-1)?.type === "divider" ||
        constrained.at(-1)?.type === "spacer"
      ) {
        continue
      }

      dividerCount += 1
      constrained.push(item)
      continue
    }

    if (item.type === "spacer") {
      if (
        spacerCount >= MAX_INSERTED_SPACERS ||
        isVisualBreakItem(constrained.at(-1) ?? item)
      ) {
        continue
      }

      spacerCount += 1
      constrained.push(item)
      continue
    }

    constrained.push(item)
  }

  while (constrained.length && isVisualBreakItem(constrained[0])) {
    constrained.shift()
  }
  while (
    constrained.length &&
    isVisualBreakItem(constrained.at(-1) as WikiFormatOutputItem)
  ) {
    constrained.pop()
  }

  return constrained
}

function validateLayoutOutput({
  originalItems,
  outputItems,
  instructionalVideo = false,
}: {
  originalItems: WikiFormatItem[]
  outputItems: WikiFormatOutputItem[]
  instructionalVideo?: boolean
}) {
  if (!outputItems.length) {
    throw new Error("AI returned empty rewritten content.")
  }

  const requiredRefIds = getRequiredRefIds(originalItems)
  const requiredRefIdSet = new Set(requiredRefIds)
  const returnedRefs = outputItems
    .filter((item): item is Extract<WikiFormatOutputItem, { type: "ref" }> => {
      return item.type === "ref"
    })
    .map((item) => item.id)
  const returnedRefSet = new Set(returnedRefs)

  if (
    requiredRefIds.some((id) => !returnedRefSet.has(id)) ||
    returnedRefs.some((id) => !requiredRefIdSet.has(id))
  ) {
    throw new Error(
      "AI rewrite changed protected document blocks. No changes were applied."
    )
  }

  if (returnedRefSet.size !== returnedRefs.length) {
    throw new Error(
      "AI rewrite duplicated protected document blocks. No changes were applied."
    )
  }

  validateTextRatio({
    originalText: getOriginalText(originalItems),
    formattedText: getFormattedText(outputItems),
    minRatio: instructionalVideo ? 0.05 : MIN_PRESERVED_TEXT_RATIO,
    minimumLength: instructionalVideo ? 80 : 0,
  })
}

function createJsonSchema(name: string, includeRewriteSections = false) {
  const properties: Record<string, unknown> = {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["markdown", "callout", "ref", "divider", "spacer"],
          },
          id: { type: ["string", "null"] },
          markdown: { type: ["string", "null"] },
          tone: {
            type: ["string", "null"],
            enum: ["red", "yellow", "gray", "blue", "green", null],
          },
          sourceIds: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          mediaPatch: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              caption: { type: ["string", "null"] },
              showPreview: { type: ["boolean", "null"] },
            },
            required: ["caption", "showPreview"],
          },
        },
        required: ["type", "id", "markdown", "tone", "sourceIds", "mediaPatch"],
      },
    },
  }
  const required = ["summary", "items"]

  if (includeRewriteSections) {
    properties.rewriteSections = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          instructions: { type: "string" },
        },
        required: ["id", "instructions"],
      },
    }
    required.push("rewriteSections")
  }

  return {
    type: "json_schema" as const,
    name,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties,
      required,
    },
  }
}

function createLegacyJsonSchema() {
  return {
    type: "json_schema" as const,
    name: "wiki_format_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              markdown: { type: "string" },
            },
            required: ["id", "markdown"],
          },
        },
      },
      required: ["summary", "sections"],
    },
  }
}

function buildFormatPrompt({
  title,
  sections,
}: {
  title: string
  sections: FormatSection[]
}) {
  return `Rewrite this Canopy Hub Wiki document into a clearer page.

The editor may contain images, documents, videos, tables, or other rich blocks between these text sections. Those blocks are intentionally not included here and will be preserved exactly in their original locations. Format only the text sections below.

${CANOPY_WIKI_REWRITE_STANDARD}

Additional rules:
- Return the same section IDs. Do not combine, split, remove, rename, or reorder sections in this legacy response.
- Rewrite the text in each section. You may add concise clarifying phrasing and remove repetition inside a section.
- The page title is "${title || "Untitled Wiki page"}"; do not return it, a near-duplicate, or a generic "Overview"/"Introduction" opener as the first body heading.
- Begin as if the visible page title is already directly above your returned body content.
- Return JSON only. Do not wrap the response in Markdown.

Output shape:
{
  "summary": "One short sentence describing the rewrite.",
  "sections": [
    { "id": "section-1", "markdown": "The complete rewritten Markdown for this section." }
  ]
}

Wiki page title:
${title || "Untitled Wiki page"}

Text sections:
${JSON.stringify(sections, null, 2)}`
}

function buildPlanPrompt({
  title,
  items,
}: {
  title: string
  items: WikiFormatItem[]
}) {
  return `Plan a full page rewrite for this Canopy Hub Wiki document.

You are receiving a compact representation of the whole editor document. Text items contain Markdown. Rich items are protected references to existing editor blocks. You may move protected refs to better positions, but every protected ref must appear exactly once in the output.

${CANOPY_WIKI_REWRITE_STANDARD}

Additional planning rules:
- Return a compact layout plan only. Do not rewrite full body text in this planning response.
- For text content, return markdown output items with sourceIds and an empty markdown string.
- Add rewriteSections for text items that should be rewritten. Prefer 3-8 high-impact text items. For short documents, include every meaningful text item.
- Use ref for every original media/table/divider item exactly once.
- Plan a real rewrite: clearer headings, cleaner order, tighter paragraphs, better lists, and removal of duplicated paste artifacts.
- The page title is "${title || "Untitled Wiki page"}"; do not plan a first body heading that repeats it, restates it, or adds a generic opener such as "Overview" or "Introduction."
- Begin the planned body as if the visible page title is already directly above it.
- You may insert divider/spacer items only where clearly useful around major sections or rich content.
- Use at most one callout unless the source has multiple unusually important short warnings.
- You may patch only media captions and showPreview. Do not change URLs, names, file metadata, uploads, links, people, or policies.
- Return JSON only. Do not wrap the response in Markdown.

Output item rules:
- markdown: use for text placement. Include sourceIds. Set markdown to "".
- callout: use rarely for one short operational warning/note that would otherwise be missed. Include sourceIds. Set markdown to "" unless only a very small wording cleanup is needed. Set tone to red, yellow, gray, blue, or green by context.
- ref: use for an original media/table/divider item by ID. Include mediaPatch only for caption/showPreview changes.
- divider: use for a newly inserted divider only between major unrelated sections.
- spacer: use for a newly inserted blank paragraph, mainly before or after rich content.
- For strict JSON, include every item property. Use null for fields that do not apply.

Output shape:
{
  "summary": "One short sentence describing the rewrite plan.",
  "items": [
    { "type": "markdown", "id": null, "markdown": "", "tone": null, "sourceIds": ["text-1"], "mediaPatch": null },
    { "type": "ref", "id": "media-1", "markdown": null, "tone": null, "sourceIds": null, "mediaPatch": { "caption": "Optional caption", "showPreview": true } },
    { "type": "divider", "id": null, "markdown": null, "tone": null, "sourceIds": null, "mediaPatch": null },
    { "type": "spacer", "id": null, "markdown": null, "tone": null, "sourceIds": null, "mediaPatch": null }
  ],
  "rewriteSections": [
    { "id": "text-1", "instructions": "Specific rewrite goals for this text group." }
  ]
}

Wiki page title:
${title || "Untitled Wiki page"}

Document items:
${JSON.stringify(items, null, 2)}`
}

function buildVideoInstructionPrompt({
  title,
  items,
  videoTranscript,
}: {
  title: string
  items: WikiFormatItem[]
  videoTranscript: string
}) {
  const itemsWithTranscript = [
    ...items,
    {
      type: "text",
      id: VIDEO_TRANSCRIPT_SOURCE_ID,
      markdown: `Video transcript:\n\n${videoTranscript}`,
    },
  ]

  return `Write an instructional Canopy Hub Wiki page from an uploaded video transcript and the current editor contents.

The current editor contents may include existing text, images, documents, videos, tables, or other rich blocks. Rich items are protected references to existing editor blocks. Every protected ref must appear exactly once in the output. The uploaded video is one of those protected refs and should remain in the page.

Use the video transcript as the primary source for the instructional procedure. Use the current editor contents for additional context, existing terminology, warnings, labels, and page-specific details. If the transcript and current page conflict, preserve exact operational facts from the current page unless the transcript clearly clarifies them. Do not invent facts, policy, contacts, system behavior, or procedural steps.

${CANOPY_WIKI_REWRITE_STANDARD}

Additional video instruction rules:
- Produce a practical instructional page, not a verbatim transcript or meeting summary.
- Convert spoken walkthrough language into clear steps, requirements, notes, and section headings.
- Remove filler, false starts, greetings, repeated phrases, and off-topic commentary from the transcript.
- Keep only instructions supported by the transcript or current page contents.
- Preserve the uploaded video block as a reference. It may be placed near the top or near the most relevant section.
- The page title is "${title || "Untitled Wiki page"}"; do not return it, a near-duplicate, or a generic "Overview"/"Introduction" opener as the first body heading.
- Begin as if the visible page title is already directly above the returned body content.
- Return JSON only. Do not wrap the response in Markdown.

Output item rules:
- markdown: use for rewritten instructional content. Include sourceIds when content comes from an existing text item or the transcript source.
- callout: use rarely for one short operational warning/note. Include sourceIds. Set tone to red, yellow, gray, blue, or green by context.
- ref: use for an original media/table/divider item by ID. Include mediaPatch only for caption/showPreview changes.
- divider: use for a newly inserted divider only between major unrelated sections.
- spacer: use for a newly inserted blank paragraph, mainly before or after rich content.
- For strict JSON, include every item property. Use null for fields that do not apply.

Output shape:
{
  "summary": "One short sentence describing the generated instructional page.",
  "items": [
    { "type": "markdown", "id": null, "markdown": "## Clear section\\n\\n1. First supported step.", "tone": null, "sourceIds": ["${VIDEO_TRANSCRIPT_SOURCE_ID}"], "mediaPatch": null },
    { "type": "ref", "id": "media-1", "markdown": null, "tone": null, "sourceIds": null, "mediaPatch": { "caption": "Optional caption", "showPreview": true } }
  ]
}

Wiki page title:
${title || "Untitled Wiki page"}

Document items and transcript source:
${JSON.stringify(itemsWithTranscript, null, 2)}`
}

function buildRewritePrompt({
  title,
  outline,
  item,
  instructions,
}: {
  title: string
  outline: WikiFormatItem[]
  item: WikiFormatItem
  instructions: string
}) {
  return `Rewrite this one Wiki text group as clean Markdown.

Use the whole-document outline for context, but only return this text group's rewritten Markdown. Improve wording, structure, and flow. You may add concise clarifying language and remove repetition, but preserve all operational facts and do not add new requirements.

${CANOPY_WIKI_REWRITE_STANDARD}

Wiki page title:
${title || "Untitled Wiki page"}

Instructions:
${instructions || "Rewrite the text with clearer wording, headings, lists, and cleaned paste artifacts."}

The page title is "${title || "Untitled Wiki page"}"; do not return it, a near-duplicate, or a generic "Overview"/"Introduction" opener as the first body heading. Begin as if that visible title is already directly above this content.

Whole-document outline:
${JSON.stringify(
  outline.map((outlineItem) => ({
    type: outlineItem.type,
    id: outlineItem.id,
    blockType: outlineItem.blockType,
    name: outlineItem.name,
    caption: outlineItem.caption,
    preview:
      outlineItem.id === item.id
        ? outlineItem.markdown
        : outlineItem.markdown?.slice(0, 300),
  })),
  null,
  2
)}

Text group to rewrite:
${item.markdown ?? ""}`
}

function buildConservativeFallbackPrompt({
  title,
  items,
}: {
  title: string
  items: WikiFormatItem[]
}) {
  const sections = items
    .filter((item) => item.type === "text")
    .map((item) => ({ id: item.id, markdown: item.markdown ?? "" }))

  return buildFormatPrompt({ title, sections })
}

async function callFormatter({
  input,
  signal,
  schemaName,
  includeRewriteSections = false,
}: {
  input: string
  signal: AbortSignal
  schemaName: string
  includeRewriteSections?: boolean
}) {
  return createAgentResponseWithOpenAI(
    {
      model: getFormatModel(),
      input,
      max_output_tokens: includeRewriteSections ? 1_800 : 6_000,
      reasoning: { effort: "minimal" },
      store: false,
      text: {
        format: createJsonSchema(schemaName, includeRewriteSections),
        verbosity: "low",
      },
    },
    { signal }
  )
}

async function callLegacyFormatter({
  input,
  signal,
}: {
  input: string
  signal: AbortSignal
}) {
  return createAgentResponseWithOpenAI(
    {
      model: getFormatModel(),
      input,
      reasoning: { effort: "minimal" },
      store: false,
      text: {
        format: createLegacyJsonSchema(),
        verbosity: "low",
      },
    },
    { signal }
  )
}

async function rewriteLargeDocumentSections({
  title,
  items,
  outputItems,
  rewriteSections,
  signal,
}: {
  title: string
  items: WikiFormatItem[]
  outputItems: WikiFormatOutputItem[]
  rewriteSections: RewriteSection[]
  signal: AbortSignal
}) {
  if (!rewriteSections.length) {
    return outputItems
  }

  const textById = new Map(
    items.filter((item) => item.type === "text").map((item) => [item.id, item])
  )
  const rewrites = await Promise.all(
    rewriteSections.map(async (rewrite) => {
      const item = textById.get(rewrite.id)
      if (!item) {
        return null
      }
      const response = await createAgentResponseWithOpenAI(
        {
          model: getFormatModel(),
          input: buildRewritePrompt({
            title,
            outline: items,
            item,
            instructions: rewrite.instructions,
          }),
          max_output_tokens: 2_500,
          reasoning: { effort: "minimal" },
          store: false,
          text: { verbosity: "low" },
        },
        { signal }
      )
      const markdown = normalizeRewrittenMarkdown(
        getResponseText(response),
        title
      )
      return markdown
        ? {
            id: rewrite.id,
            markdown: normalizeRewrittenMarkdown(
              extractJsonText(markdown),
              title
            ),
          }
        : null
    })
  )
  const rewriteById = new Map(
    rewrites
      .filter((rewrite): rewrite is { id: string; markdown: string } =>
        Boolean(rewrite)
      )
      .map((rewrite) => [rewrite.id, rewrite.markdown])
  )

  return outputItems.map((item) => {
    if (item.type !== "markdown" || item.sourceIds?.length !== 1) {
      return item
    }

    const markdown = rewriteById.get(item.sourceIds[0])
    return markdown ? { ...item, markdown } : item
  })
}

function buildConservativeOutput({
  title,
  originalItems,
  sections,
}: {
  title: string
  originalItems: WikiFormatItem[]
  sections: FormatSection[]
}): WikiFormatOutputItem[] {
  const formattedById = new Map(
    sections.map((section) => [section.id, section])
  )

  return originalItems
    .map((item): WikiFormatOutputItem | null => {
      if (item.type === "text") {
        const formatted = formattedById.get(item.id)
        return formatted
          ? {
              type: "markdown",
              sourceIds: [item.id],
              markdown: normalizeRewrittenMarkdown(formatted.markdown, title),
            }
          : null
      }

      if (RICH_ITEM_TYPES.has(item.type)) {
        return { type: "ref", id: item.id }
      }

      return null
    })
    .filter((item): item is WikiFormatOutputItem => Boolean(item))
}

function materializePlanOutput({
  title,
  originalItems,
  planItems,
}: {
  title: string
  originalItems: WikiFormatItem[]
  planItems: LayoutPlanItem[]
}): WikiFormatOutputItem[] {
  const markdownById = new Map(
    originalItems
      .filter((item) => item.type === "text" || item.type === "table")
      .map((item) => [item.id, item.markdown ?? ""])
  )

  return planItems
    .map((item): WikiFormatOutputItem | null => {
      if (item.type === "markdown") {
        const markdown =
          item.markdown ||
          item.sourceIds
            .map((sourceId) => markdownById.get(sourceId))
            .filter((value): value is string => Boolean(value))
            .join("\n\n")
        return markdown
          ? {
              type: "markdown",
              sourceIds: item.sourceIds,
              markdown: normalizeRewrittenMarkdown(markdown, title),
            }
          : null
      }

      if (item.type === "callout") {
        const markdown =
          item.markdown ||
          item.sourceIds
            .map((sourceId) => markdownById.get(sourceId))
            .filter((value): value is string => Boolean(value))
            .join("\n\n")
        return markdown
          ? {
              type: "callout",
              tone: item.tone,
              sourceIds: item.sourceIds,
              markdown: normalizeRewrittenMarkdown(markdown, title),
            }
          : null
      }

      return item
    })
    .filter((item): item is WikiFormatOutputItem => Boolean(item))
}

function isVisualBreakItem(item: WikiFormatOutputItem) {
  return item.type === "divider" || item.type === "spacer"
}

function isMajorLayoutItem(item: WikiFormatOutputItem) {
  return item.type === "ref"
}

function addLayoutSpacing(items: WikiFormatOutputItem[]) {
  const spaced: WikiFormatOutputItem[] = []

  for (const item of items) {
    const previous = spaced.at(-1)
    if (
      previous &&
      !isVisualBreakItem(previous) &&
      !isVisualBreakItem(item) &&
      (isMajorLayoutItem(previous) || isMajorLayoutItem(item))
    ) {
      spaced.push({ type: "spacer" })
    }

    spaced.push(item)
  }

  return spaced
}

async function formatLayout({
  title,
  items,
  signal,
}: {
  title: string
  items: WikiFormatItem[]
  signal: AbortSignal
}): Promise<WikiFormatResponse> {
  try {
    const response = await callFormatter({
      input: buildPlanPrompt({ title, items }),
      signal,
      schemaName: "wiki_format_plan_response",
      includeRewriteSections: true,
    })
    const formatted = parseJsonResponse<LayoutFormatResponseBody>(response)
    const rewriteSections = parseRewriteSections(
      formatted.rewriteSections
    ).slice(0, MAX_REWRITE_SECTIONS)
    const rewrittenItems = await rewriteLargeDocumentSections({
      title,
      items,
      outputItems: materializePlanOutput({
        title,
        originalItems: items,
        planItems: parseLayoutPlanItems(formatted.items),
      }),
      rewriteSections,
      signal,
    })
    const outputItems = removeOpeningBodyHeadingFromItems(
      constrainLayoutComplexity(addLayoutSpacing(rewrittenItems)),
      title
    )
    validateLayoutOutput({ originalItems: items, outputItems })

    return {
      summary: getString(formatted.summary) || "Rewritten document.",
      items: outputItems,
      stats: getStats({ originalItems: items, outputItems }),
    }
  } catch (layoutError) {
    try {
      const fallbackResponse = await callLegacyFormatter({
        input: buildConservativeFallbackPrompt({ title, items }),
        signal,
      })
      const fallback =
        parseJsonResponse<LegacyFormatResponseBody>(fallbackResponse)
      const fallbackSections = parseResponseSections(fallback.sections).map(
        (section) => ({
          ...section,
          markdown: normalizeRewrittenMarkdown(section.markdown, title),
        })
      )
      validateFormattedSections({
        originalSections: items
          .filter((item) => item.type === "text")
          .map((item) => ({ id: item.id, markdown: item.markdown ?? "" })),
        formattedSections: fallbackSections,
      })
      const outputItems = removeOpeningBodyHeadingFromItems(
        constrainLayoutComplexity(
          addLayoutSpacing(
            buildConservativeOutput({
              title,
              originalItems: items,
              sections: fallbackSections,
            })
          )
        ),
        title
      )
      validateLayoutOutput({ originalItems: items, outputItems })

      return {
        summary:
          getString(fallback.summary) ||
          "Rewritten document while preserving protected blocks.",
        items: outputItems,
        stats: getStats({ originalItems: items, outputItems }),
      }
    } catch {
      throw layoutError
    }
  }
}

async function formatVideoInstructionPage({
  title,
  items,
  videoTranscript,
  signal,
}: {
  title: string
  items: WikiFormatItem[]
  videoTranscript: string
  signal: AbortSignal
}): Promise<WikiFormatResponse> {
  const itemsWithTranscript: WikiFormatItem[] = [
    ...items,
    {
      type: "text",
      id: VIDEO_TRANSCRIPT_SOURCE_ID,
      markdown: videoTranscript,
    },
  ]
  const response = await callFormatter({
    input: buildVideoInstructionPrompt({ title, items, videoTranscript }),
    signal,
    schemaName: "wiki_video_instruction_response",
  })
  const formatted = parseJsonResponse<LayoutFormatResponseBody>(response)
  const outputItems = removeOpeningBodyHeadingFromItems(
    constrainLayoutComplexity(
      addLayoutSpacing(
        materializePlanOutput({
          title,
          originalItems: itemsWithTranscript,
          planItems: parseLayoutPlanItems(formatted.items),
        })
      )
    ),
    title
  )
  validateLayoutOutput({
    originalItems: itemsWithTranscript,
    outputItems,
    instructionalVideo: true,
  })

  return {
    summary:
      getString(formatted.summary) ||
      "Generated instructional page from video.",
    items: outputItems,
    stats: getStats({ originalItems: itemsWithTranscript, outputItems }),
  }
}

async function formatLegacySections({
  title,
  sections,
  signal,
}: {
  title: string
  sections: FormatSection[]
  signal: AbortSignal
}) {
  const response = await callLegacyFormatter({
    input: buildFormatPrompt({ title, sections }),
    signal,
  })
  const formatted = parseJsonResponse<LegacyFormatResponseBody>(response)
  const formattedSections = removeOpeningBodyHeadingFromSections(
    parseResponseSections(formatted.sections).map((section) => ({
      ...section,
      markdown: normalizeRewrittenMarkdown(section.markdown, title),
    })),
    title
  )
  validateFormattedSections({
    originalSections: sections,
    formattedSections,
  })

  return {
    sections: formattedSections,
    summary: getString(formatted.summary) || "Rewritten document.",
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canAccessBeta1, canManageWiki] = await Promise.all([
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

  if (!canAccessBeta1 || !canManageWiki) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload = (await request
    .json()
    .catch(() => null)) as FormatWikiRequestBody | null
  const nodeId = getString(payload?.nodeId)
  const title = getString(payload?.title)
  const isVersionTwo = payload?.formatVersion === WIKI_FORMAT_VERSION
  const mode = getString(payload?.mode)
  const videoTranscript = getString(payload?.videoTranscript)
  const isVideoInstructionMode =
    isVersionTwo && mode === "video_instruction" && Boolean(videoTranscript)
  const items = isVersionTwo ? parseFormatItems(payload?.items) : []
  const sections = parseRequestSections(payload?.sections)

  if (!nodeId) {
    return NextResponse.json({ error: "Page ID is required." }, { status: 400 })
  }

  if (isVersionTwo ? !items.length : !sections.length) {
    return NextResponse.json(
      { error: "Document content is required." },
      { status: 400 }
    )
  }

  if (
    isVersionTwo &&
    !isVideoInstructionMode &&
    !items.some((item) => item.type === "text")
  ) {
    return NextResponse.json(
      { error: "There is no editable text for AI to rewrite." },
      { status: 400 }
    )
  }

  const { data: node, error: nodeError } = await supabase
    .from("wiki_nodes")
    .select("id,type")
    .eq("id", nodeId)
    .eq("type", "page")
    .maybeSingle()

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 400 })
  }

  if (!node) {
    return NextResponse.json({ error: "Wiki page not found." }, { status: 404 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, FORMAT_TIMEOUT_MS)
    const formatted = await (
      isVersionTwo
        ? isVideoInstructionMode
          ? formatVideoInstructionPage({
              title,
              items,
              videoTranscript,
              signal: controller.signal,
            })
          : formatLayout({ title, items, signal: controller.signal })
        : formatLegacySections({ title, sections, signal: controller.signal })
    ).finally(() => clearTimeout(timeout))

    return NextResponse.json(formatted)
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "AI rewrite timed out after 30 seconds. No changes were applied."
        : error instanceof Error
          ? error.message
          : "Unable to rewrite Wiki page."

    return NextResponse.json({ error: message }, { status: 400 })
  }
}
