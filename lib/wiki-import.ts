import "server-only"

import crypto from "node:crypto"

import {
  normalizeWikiTags,
  sanitizeWikiFileName,
  slugifyWikiTitle,
} from "@/lib/wiki"

export const WIKI_IMPORT_MAX_TEXT_LENGTH = 2 * 1024 * 1024

export interface WikiImportAiOutput {
  title?: unknown
  tags?: unknown
  markdown?: unknown
}

export interface WikiImportDraft {
  title: string
  tags: string[]
  markdown: string
  blocks: Array<Record<string, unknown>>
  plainText: string
  usedAi: boolean
}

export function normalizeWikiImportText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function createWikiImportContentHash(value: string) {
  return crypto
    .createHash("sha256")
    .update(normalizeWikiImportText(value), "utf8")
    .digest("hex")
}

export function isSupportedWikiImportFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    /\.(pdf|docx|txt|md)$/.test(name)
  )
}

export function titleFromWikiImportFileName(fileName: string) {
  const source = sanitizeWikiFileName(fileName)
    .replace(/\.(pdf|docx|txt|md)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return source || "Imported page"
}

export function buildWikiImportPrompt({
  text,
  fileName,
}: {
  text: string
  fileName: string
}) {
  return `Prepare an imported document for Canopy Wiki. Return JSON only.

The import must be faithful: preserve every fact, instruction, number, name, URL, warning, and list item from the source. Do not add facts, infer missing details, summarize, or omit content. You may only clean broken line wraps, repeated whitespace, and obvious pasted-document artifacts, then use Markdown headings and lists where the source clearly supports them. The page title is shown separately, so do not duplicate it as an H1 in markdown.

Suggest a short, specific title and up to 5 existing-style tags. Tags are optional. If you are uncertain, return an empty tag list.

Source filename: ${fileName}

Source text:
${text}`
}

function comparableTokens(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * The formatter is allowed to improve layout, but it may not lose a source
 * token. This intentionally sends uncertain AI output through the raw-text
 * fallback instead of risking an incomplete operational document.
 */
export function isFaithfulWikiImportOutput(source: string, markdown: string) {
  const available = new Map<string, number>()
  for (const token of comparableTokens(markdown)) {
    available.set(token, (available.get(token) ?? 0) + 1)
  }

  for (const token of comparableTokens(source)) {
    const count = available.get(token) ?? 0
    if (!count) {
      return false
    }
    available.set(token, count - 1)
  }

  return true
}

export function markdownToWikiImportBlocks(markdown: string) {
  const blocks: Array<Record<string, unknown>> = []
  const paragraphs: string[] = []

  function flushParagraph() {
    const content = paragraphs.join("\n").trim()
    if (content) {
      blocks.push({ type: "paragraph", content })
    }
    paragraphs.length = 0
  }

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)

    if (heading?.[2]) {
      flushParagraph()
      blocks.push({
        type: "heading",
        props: { level: Math.min(Math.max(2, heading[1].length), 3) },
        content: heading[2].trim(),
      })
    } else if (bullet?.[1]) {
      flushParagraph()
      blocks.push({ type: "bulletListItem", content: bullet[1].trim() })
    } else if (numbered?.[1]) {
      flushParagraph()
      blocks.push({ type: "numberedListItem", content: numbered[1].trim() })
    } else if (!line.trim()) {
      flushParagraph()
    } else {
      paragraphs.push(line.trimEnd())
    }
  }
  flushParagraph()

  return blocks.length ? blocks : [{ type: "paragraph", content: markdown }]
}

export function createWikiImportDraft({
  text,
  fileName,
  aiOutput,
}: {
  text: string
  fileName: string
  aiOutput?: WikiImportAiOutput | null
}): WikiImportDraft {
  const plainText = normalizeWikiImportText(text)
  const suggestedMarkdown =
    typeof aiOutput?.markdown === "string"
      ? normalizeWikiImportText(aiOutput.markdown)
      : ""
  const usedAi = Boolean(
    suggestedMarkdown &&
    isFaithfulWikiImportOutput(plainText, suggestedMarkdown)
  )
  const markdown = usedAi ? suggestedMarkdown : plainText
  const suggestedTitle =
    typeof aiOutput?.title === "string"
      ? aiOutput.title.trim().replace(/\s+/g, " ").slice(0, 180)
      : ""
  const title = suggestedTitle || titleFromWikiImportFileName(fileName)
  const tags = normalizeWikiTags(
    Array.isArray(aiOutput?.tags)
      ? aiOutput.tags.filter((tag): tag is string => typeof tag === "string")
      : []
  ).slice(0, 5)

  return {
    title,
    tags,
    markdown,
    blocks: markdownToWikiImportBlocks(markdown),
    plainText,
    usedAi,
  }
}

export function createUniqueWikiImportSlug(
  title: string,
  existingSlugs: string[]
) {
  const baseSlug = slugifyWikiTitle(title)
  const known = new Set(existingSlugs.map((slug) => slug.toLocaleLowerCase()))
  if (!known.has(baseSlug)) {
    return baseSlug
  }

  let suffix = 2
  while (known.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }
  return `${baseSlug}-${suffix}`
}
