import "server-only"

import crypto from "node:crypto"
// jsdom is a server dependency without bundled declarations.
// @ts-expect-error jsdom does not publish TypeScript declarations.
import { JSDOM } from "jsdom"

import type { WikiPdfLine } from "@/lib/wiki-extract"

import {
  blockNoteToPlainText,
  getWikiAssetKind,
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

type WikiImportBlock = Record<string, unknown>
type WikiImportStyles = Partial<Record<"bold" | "italic" | "underline", true>>
type WikiImportInline =
  | string
  | Array<{
      type: "text" | "link"
      text?: string
      href?: string
      content?: Array<{ type: "text"; text: string; styles: WikiImportStyles }>
      styles?: WikiImportStyles
    }>

const WIKI_IMPORT_SMALL_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
])

// Keep this deliberately small: these are common mortgage abbreviations whose
// capitalization is meaningful in page titles and section headings.
const WIKI_IMPORT_MORTGAGE_ACRONYMS = new Set([
  "APR",
  "ARM",
  "ATR",
  "AUS",
  "CD",
  "CLTV",
  "DTI",
  "DU",
  "FHA",
  "FHAC",
  "FICO",
  "GFE",
  "HELOC",
  "HOA",
  "HUD",
  "LE",
  "LO",
  "LOA",
  "LTV",
  "MI",
  "MIP",
  "MLO",
  "NMLS",
  "PITI",
  "PMI",
  "QM",
  "RESPA",
  "TILA",
  "TRID",
  "URLA",
  "USDA",
  "UW",
  "VA",
  "VOA",
  "VOE",
  "VOR",
  "W9",
])

function isAllCapsWikiImportText(value: string) {
  const casedLetters = (value.match(/\p{L}/gu) ?? []).filter(
    (letter) => letter.toLowerCase() !== letter.toUpperCase()
  )
  return (
    casedLetters.length > 0 &&
    casedLetters.every((letter) => letter === letter.toUpperCase())
  )
}

function isWikiImportDateToken(value: string) {
  return /^(?:M{1,4}|D{1,4}|Y{2,4})(?:\/(?:M{1,4}|D{1,4}|Y{2,4}))+$/.test(value)
}

function titleCaseWikiImportWord(value: string, wordIndex: number): string {
  const upper = value.toUpperCase()
  if (WIKI_IMPORT_MORTGAGE_ACRONYMS.has(upper)) return upper
  if (isWikiImportDateToken(upper)) return upper

  const apostrophe = value.match(/^(.+?)(['’])([\p{L}]+)$/u)
  if (apostrophe && /^(?:S|D|M|LL|RE|VE)$/i.test(apostrophe[3])) {
    return `${titleCaseWikiImportWord(apostrophe[1], wordIndex)}${apostrophe[2]}${apostrophe[3].toLowerCase()}`
  }

  if (value.includes("/")) {
    const parts = value.split("/")
    if (parts.every((part) => WIKI_IMPORT_MORTGAGE_ACRONYMS.has(part))) {
      return upper
    }
    return parts
      .map((part, index) => titleCaseWikiImportWord(part, wordIndex + index))
      .join("/")
  }

  if (value.includes("-") || value.includes("–")) {
    return value
      .split(/([–-])/)
      .map((part, index) =>
        part === "-" || part === "–"
          ? part
          : titleCaseWikiImportWord(part, wordIndex + Math.floor(index / 2))
      )
      .join("")
  }

  const lower = value.toLowerCase()
  if (wordIndex > 0 && WIKI_IMPORT_SMALL_TITLE_WORDS.has(lower)) {
    return lower
  }
  return `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`
}

/**
 * Fix presentation-only ALL-CAPS titles without changing deliberate mixed
 * casing in source material.
 */
export function normalizeWikiImportTitleCase(value: string) {
  if (!isAllCapsWikiImportText(value)) return value

  let wordIndex = 0
  return value.replace(/[\p{L}\p{N}]+(?:[/'’–-][\p{L}\p{N}]+)*/gu, (word) => {
    const normalized = titleCaseWikiImportWord(word, wordIndex)
    wordIndex += word.split(/[/'’–-]/).filter(Boolean).length
    return normalized
  })
}

function wikiImportInlineText(
  value: unknown,
  seen = new Set<object>()
): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map((item) => wikiImportInlineText(item, seen)).join("")
  }
  if (!value || typeof value !== "object" || seen.has(value)) return ""

  seen.add(value)
  try {
    const content = value as {
      cells?: unknown
      content?: unknown
      rows?: unknown
      text?: unknown
    }
    if (typeof content.text === "string") return content.text
    if (Array.isArray(content.rows)) {
      return content.rows
        .map((row) => wikiImportInlineText(row, seen))
        .join("\n")
    }
    if (Array.isArray(content.cells)) {
      return content.cells
        .map((cell) => wikiImportInlineText(cell, seen))
        .join("\t")
    }
    return wikiImportInlineText(content.content, seen)
  } finally {
    seen.delete(value)
  }
}

function normalizeWikiImportHeadingContent(value: WikiImportInline) {
  const source = wikiImportInlineText(value)
  const normalized = normalizeWikiImportTitleCase(source)
  if (normalized === source) return value
  if (typeof value === "string") return normalized

  let offset = 0
  const replaceText = (text: string) => {
    const replacement = normalized.slice(offset, offset + text.length)
    offset += text.length
    return replacement
  }
  return value.map((item) => {
    if (item.text !== undefined) {
      return { ...item, text: replaceText(item.text) }
    }
    if (item.content) {
      return {
        ...item,
        content: item.content.map((child) => ({
          ...child,
          text: replaceText(child.text),
        })),
      }
    }
    return item
  })
}

const PDF_PAGE_MARKER = /^[-–—\s]*\d+\s+(?:of|\/)\s+\d+[-–—\s]*$/i

function normalizeImportLine(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * PDF text extraction commonly leaves a standalone "-- 1 of 2 --" line in
 * the document. It is presentation chrome, not document content.
 */
export function stripWikiImportPageMarkers(value: string) {
  return value
    .split("\n")
    .filter((line) => !PDF_PAGE_MARKER.test(line.trim()))
    .join("\n")
}

export function normalizeWikiImportText(value: string) {
  return stripWikiImportPageMarkers(value)
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
    isWikiImportVideoFile(file) ||
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    /\.(pdf|docx|txt|md)$/.test(name)
  )
}

export function isWikiImportVideoFile(file: File) {
  return getWikiAssetKind(file) === "video"
}

export function titleFromWikiImportFileName(fileName: string) {
  const source = sanitizeWikiFileName(fileName)
    .replace(/\.(pdf|docx|txt|md|mp4|mov|webm)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return source
    ? normalizeWikiImportTitleCase(source.toUpperCase())
    : "Imported Page"
}

export function buildWikiImportPrompt({
  text,
  fileName,
  structureHints = "",
  existingText = "",
}: {
  text: string
  fileName: string
  structureHints?: string
  existingText?: string
}) {
  const updateInstructions = existingText
    ? `
This is an update to an existing page. Return one complete, merged page:
- Keep the existing page material unless the incoming source explicitly supersedes it.
- Apply incoming additions and corrections in the relevant existing section when clear; otherwise add them under an appropriate section.
- Do not drop existing instructions, warnings, numbers, or other material simply because it was not repeated in the incoming source.

Existing page text:
${existingText}

`
    : ""

  return `Prepare an imported document for Canopy Wiki. Return JSON only.

The import must be faithful: preserve every fact, instruction, number, name, URL, warning, and list item from the source. Do not add facts, infer missing details, summarize, or omit content. You may only clean broken line wraps, repeated whitespace, PDF page markers/headers/footers, and obvious pasted-document artifacts.

Return polished Markdown that a non-technical person could publish as-is:
- Start markdown with exactly one # H1 document title. It will become the Wiki page title and will be removed from the editor body, so never repeat that title later in the Markdown. The title must be a concise, standalone document name (80 characters or fewer), never a run-on of body text.
- Use ## major sections and ### only when useful.
- Preserve source tables as pipe tables, including a header row and every row/cell. Tabs and aligned columns in the source are table signals, not spaces to flatten.
- Use bullets for non-sequential collections and numbered lists only for actual steps.
- Use **bold** for key headline statistics and labels, sparingly. Preserve Markdown links when a URL is present.
- Do not output a flat line-by-line transcription. Keep wrapped source lines together only when they are clearly one sentence, label, or table cell.

Tabs are layout, not prose. For example, this source:
  What was left out of these numbers
  Removed \tItems Why
  Executive Announcements \t353 Announcements, not reference material
must become a section heading followed by a three-column Markdown table:
  ## What was left out of these numbers
  | Removed | Items | Why |
  | --- | --- | --- |
  | Executive Announcements | 353 | Announcements, not reference material |
Likewise, make short section labels such as "Biggest chunks: start here" and
"Also in the mix" H2s, and preserve standalone headline numbers as bold key
figures (for example, **~918** items to move).

Suggest a short, specific title and up to 5 existing-style tags. Tags are optional. If you are uncertain, return an empty tag list.

Source filename: ${fileName}

${structureHints ? `Detected PDF layout hints (follow these only to format the same source words; do not add or remove words):\n${structureHints}\n` : ""}

${updateInstructions}

Source text:
${text}`
}

function comparableTokens(value: string) {
  // Fidelity is about retaining content, not preserving display casing. This
  // lets all-caps headings be title-cased without triggering the fallback.
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * The formatter is allowed to improve layout, but it may not lose a source
 * token. This intentionally sends uncertain AI output through the raw-text
 * fallback instead of risking an incomplete operational document.
 */
export function isFaithfulWikiImportOutput(
  source: string,
  markdown: string,
  title = ""
) {
  const available = new Map<string, number>()
  for (const token of comparableTokens(`${title}\n${markdown}`)) {
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

type WikiImportInlineContent = string | Array<Record<string, unknown>>

function markdownInlineContent(value: string): WikiImportInlineContent {
  const content: Array<Record<string, unknown>> = []
  const token = /(\*\*([\s\S]+?)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g
  let index = 0

  for (const match of value.matchAll(token)) {
    if (match.index === undefined) continue
    if (match.index > index) {
      content.push({
        type: "text",
        text: value.slice(index, match.index),
        styles: {},
      })
    }
    if (match[2] !== undefined) {
      content.push({ type: "text", text: match[2], styles: { bold: true } })
    } else if (match[4] !== undefined && match[5] !== undefined) {
      content.push({
        type: "link",
        href: match[5],
        content: [{ type: "text", text: match[4], styles: {} }],
      })
    }
    index = match.index + match[0].length
  }
  if (!content.length) {
    return value
  }
  if (index < value.length) {
    content.push({ type: "text", text: value.slice(index), styles: {} })
  }
  return content
}

function markdownTableCells(value: string) {
  const trimmed = value.trim().replace(/^\||\|$/g, "")
  const cells: string[] = []
  let cell = ""
  let escaped = false
  for (const character of trimmed) {
    if (escaped) {
      cell += character
      escaped = false
    } else if (character === "\\") {
      escaped = true
    } else if (character === "|") {
      cells.push(cell.trim())
      cell = ""
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function isMarkdownTableDivider(value: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value)
}

function markdownTableBlock(header: string[], rows: string[][]) {
  const width = header.length
  return {
    type: "table",
    props: { textColor: "default" },
    children: [],
    content: {
      type: "tableContent",
      columnWidths: Array.from({ length: width }, () => undefined),
      headerRows: 1,
      rows: [header, ...rows].map((row) => ({
        cells: Array.from({ length: width }, (_, index) =>
          markdownInlineContent(row[index] ?? "")
        ),
      })),
    },
  }
}

function markdownImageBlock(alt: string, url: string) {
  return {
    type: "image",
    props: {
      url,
      name: alt || "Image",
      caption: alt,
      showPreview: true,
      backgroundColor: "default",
      textAlignment: "left",
    },
    children: [],
  }
}

function isShortMarkdownStatLine(value: string) {
  const trimmed = value.trim()
  return trimmed.length <= 180 && /^\*\*[^*\n]+\*\*(?:\s+.+)?$/.test(trimmed)
}

function hasInlineContent(content: WikiImportInline) {
  return typeof content === "string"
    ? Boolean(content.trim())
    : content.length > 0
}

function safeWikiImportLink(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null
  } catch {
    return null
  }
}

function docxInlineContent(node: Node): WikiImportInline {
  const content: Array<{
    type: "text" | "link"
    text?: string
    href?: string
    content?: Array<{ type: "text"; text: string; styles: WikiImportStyles }>
    styles?: WikiImportStyles
  }> = []

  const appendText = (text: string, styles: WikiImportStyles) => {
    if (!text) return
    const previous = content.at(-1)
    if (
      previous?.type === "text" &&
      previous.text !== undefined &&
      JSON.stringify(previous.styles ?? {}) === JSON.stringify(styles)
    ) {
      previous.text += text
      return
    }
    content.push({ type: "text", text, styles })
  }

  const visit = (current: Node, styles: WikiImportStyles) => {
    if (current.nodeType === current.TEXT_NODE) {
      appendText(current.textContent ?? "", styles)
      return
    }
    if (current.nodeType !== current.ELEMENT_NODE) return

    const element = current as Element
    const tag = element.tagName.toLowerCase()
    if (tag === "img") return
    if (tag === "ol" || tag === "ul") return
    if (tag === "br") {
      appendText("\n", styles)
      return
    }
    const nextStyles = {
      ...styles,
      ...(tag === "strong" || tag === "b" ? { bold: true as const } : {}),
      ...(tag === "em" || tag === "i" ? { italic: true as const } : {}),
      ...(tag === "u" ? { underline: true as const } : {}),
    }
    if (tag === "a") {
      const href = safeWikiImportLink(element.getAttribute("href"))
      const linkContent: Array<{
        type: "text"
        text: string
        styles: WikiImportStyles
      }> = []
      const collect = (child: Node, childStyles: WikiImportStyles) => {
        if (child.nodeType === child.TEXT_NODE) {
          const text = child.textContent ?? ""
          if (text)
            linkContent.push({ type: "text", text, styles: childStyles })
          return
        }
        if (child.nodeType !== child.ELEMENT_NODE) return
        const childElement = child as Element
        const childTag = childElement.tagName.toLowerCase()
        if (childTag === "br") {
          linkContent.push({ type: "text", text: "\n", styles: childStyles })
          return
        }
        for (const grandchild of child.childNodes) {
          collect(grandchild, {
            ...childStyles,
            ...(childTag === "strong" || childTag === "b"
              ? { bold: true as const }
              : {}),
            ...(childTag === "em" || childTag === "i"
              ? { italic: true as const }
              : {}),
            ...(childTag === "u" ? { underline: true as const } : {}),
          })
        }
      }
      for (const child of current.childNodes) collect(child, nextStyles)
      if (href && linkContent.length) {
        content.push({ type: "link", href, content: linkContent })
      } else {
        for (const item of linkContent) appendText(item.text, item.styles)
      }
      return
    }
    for (const child of current.childNodes) visit(child, nextStyles)
  }

  for (const child of node.childNodes) visit(child, {})
  if (
    content.length === 1 &&
    content[0].type === "text" &&
    !Object.keys(content[0].styles ?? {}).length
  ) {
    return content[0].text ?? ""
  }
  return content.length ? content : ""
}

function docxImageBlock(element: Element, imageUrls: Map<string, string>) {
  const source = element.getAttribute("src") ?? ""
  const url = imageUrls.get(source)
  if (!url) return null
  const name = element.getAttribute("alt")?.trim() || "Imported image"
  return {
    type: "image",
    props: { url, name, caption: "" },
    children: [],
  }
}

function isAllCapsTitleLike(value: string) {
  const trimmed = value.trim().replace(/:$/, "")
  const letters = trimmed.match(/\p{L}/gu) ?? []
  return (
    trimmed.length > 2 &&
    trimmed.length <= 100 &&
    trimmed.split(/\s+/).length <= 10 &&
    letters.length >= 3 &&
    letters.every((letter) => letter === letter.toLocaleUpperCase())
  )
}

function docxListBlocks(
  list: Element,
  imageUrls: Map<string, string>
): WikiImportBlock[] {
  const type =
    list.tagName.toLowerCase() === "ol" ? "numberedListItem" : "bulletListItem"
  return [...list.children]
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((item) => {
      const directContent = docxInlineContent(item)
      const nestedLists = [...item.children].filter((child) =>
        ["ol", "ul"].includes(child.tagName.toLowerCase())
      )
      const images = [...item.querySelectorAll(":scope > img")]
        .map((image) => docxImageBlock(image, imageUrls))
        .filter(Boolean) as WikiImportBlock[]
      const children = [
        ...nestedLists.flatMap((nestedList) =>
          docxListBlocks(nestedList, imageUrls)
        ),
        ...images,
      ]
      return {
        type,
        content: hasInlineContent(directContent) ? directContent : "",
        children,
      }
    })
}

function docxTableBlock(table: Element): WikiImportBlock {
  const rows = [...table.querySelectorAll("tr")].map((row) => ({
    cells: [...row.children]
      .filter((cell) => ["th", "td"].includes(cell.tagName.toLowerCase()))
      .map((cell) => docxInlineContent(cell)),
  }))
  const headerRows = table.querySelector("th") ? 1 : 0
  return {
    type: "table",
    content: { type: "tableContent", headerRows, rows },
    children: [],
  }
}

/** Convert Mammoth's deterministic DOCX HTML into the app's BlockNote JSON. */
export function docxHtmlToWikiImportBlocks({
  html,
  imageUrls = new Map<string, string>(),
  title = "",
}: {
  html: string
  imageUrls?: Map<string, string>
  title?: string
}) {
  const document = new JSDOM(`<body>${html}</body>`).window.document
  const blocks: WikiImportBlock[] = []
  let sawTitle = false

  for (const element of [...document.body.children]) {
    const tag = element.tagName.toLowerCase()
    const text = element.textContent?.trim() ?? ""
    const heading = tag.match(/^h([1-6])$/)
    const inferredHeading = tag === "p" && isAllCapsTitleLike(text)

    if (!sawTitle && title && normalizeImportLine(text) === title) {
      sawTitle = true
      continue
    }

    if (heading || inferredHeading) {
      const level = heading ? Math.min(Math.max(2, Number(heading[1])), 3) : 2
      if (!sawTitle && (level === 1 || inferredHeading)) {
        sawTitle = true
        continue
      }
      blocks.push({
        type: "heading",
        props: { level },
        content: normalizeWikiImportHeadingContent(docxInlineContent(element)),
        children: [],
      })
      continue
    }
    if (tag === "ol" || tag === "ul") {
      blocks.push(...docxListBlocks(element, imageUrls))
      continue
    }
    if (tag === "table") {
      blocks.push(docxTableBlock(element))
      continue
    }
    if (tag === "img") {
      const image = docxImageBlock(element, imageUrls)
      if (image) blocks.push(image)
      continue
    }
    if (tag !== "p") continue

    const inline = docxInlineContent(element)
    if (hasInlineContent(inline)) {
      blocks.push({ type: "paragraph", content: inline, children: [] })
    }
    for (const image of [...element.querySelectorAll("img")]) {
      const block = docxImageBlock(image, imageUrls)
      if (block) blocks.push(block)
    }
  }

  return blocks.length
    ? blocks
    : [{ type: "paragraph", content: "", children: [] }]
}

function wikiImportBlocksText(blocks: WikiImportBlock[]) {
  const values: string[] = []
  const readInline = (content: unknown): string => {
    if (typeof content === "string") return content
    if (!Array.isArray(content)) return ""
    return content
      .map((item) => {
        if (!item || typeof item !== "object") return ""
        const value = item as Record<string, unknown>
        if (typeof value.text === "string") return value.text
        return readInline(value.content)
      })
      .join("")
  }
  const visit = (block: WikiImportBlock) => {
    if (
      block.type === "table" &&
      block.content &&
      typeof block.content === "object"
    ) {
      const rows = (block.content as { rows?: Array<{ cells?: unknown[] }> })
        .rows
      for (const row of rows ?? []) {
        values.push((row.cells ?? []).map(readInline).join("\n"))
      }
    } else {
      values.push(readInline(block.content))
    }
    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        if (child && typeof child === "object") visit(child as WikiImportBlock)
      }
    }
  }
  for (const block of blocks) visit(block)
  return values.filter(Boolean).join("\n")
}

export function createWikiDocxImportDraft({
  html,
  text,
  fileName,
  imageUrls,
}: {
  html: string
  text: string
  fileName: string
  imageUrls: Map<string, string>
}): WikiImportDraft {
  const document = new JSDOM(`<body>${html}</body>`).window.document
  const titleElement = [...document.body.children].find((element) => {
    const tag = element.tagName.toLowerCase()
    const value = normalizeImportLine(element.textContent ?? "")
    return (
      Boolean(value) &&
      (tag === "h1" || tag === "p" || isAllCapsTitleLike(value))
    )
  })
  const title = normalizeWikiImportTitleCase(
    titleElement?.textContent?.replace(/\s+/g, " ").trim() ||
      titleFromWikiImportFileName(fileName)
  )
  const blocks = docxHtmlToWikiImportBlocks({ html, imageUrls, title })
  const plainText = normalizeWikiImportText(text)
  const blockText = wikiImportBlocksText(blocks)
  const renderedText = `${title}\n${blockText}`

  // The source must be representable by the structured conversion. The
  // reverse check used to reject valid documents whenever a title was removed
  // from the body or table cells were not included in the comparison. If a
  // future Mammoth quirk does drop something, retain the original text as a
  // clean paragraph import instead of surfacing a user-visible failure.
  if (!isFaithfulWikiImportOutput(plainText, renderedText)) {
    return {
      title,
      tags: [],
      markdown: plainText,
      blocks: markdownToWikiImportBlocks(plainText),
      plainText,
      usedAi: false,
    }
  }

  return {
    title,
    tags: [],
    markdown: "",
    blocks,
    plainText,
    usedAi: false,
  }
}

export function markdownToWikiImportBlocks(markdown: string) {
  const blocks: Array<Record<string, unknown>> = []
  const paragraphs: string[] = []

  function flushParagraph() {
    const content = paragraphs.join("\n").trim()
    if (content) {
      blocks.push({
        type: "paragraph",
        content: markdownInlineContent(content),
      })
    }
    paragraphs.length = 0
  }

  const lines = markdown.split("\n")
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/)
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)

    if (
      line.includes("|") &&
      lineIndex + 1 < lines.length &&
      isMarkdownTableDivider(lines[lineIndex + 1])
    ) {
      flushParagraph()
      const header = markdownTableCells(line)
      const rows: string[][] = []
      lineIndex += 2
      while (lineIndex < lines.length && lines[lineIndex].includes("|")) {
        rows.push(markdownTableCells(lines[lineIndex]))
        lineIndex += 1
      }
      blocks.push(markdownTableBlock(header, rows))
      lineIndex -= 1
      continue
    }

    if (image) {
      flushParagraph()
      blocks.push(markdownImageBlock(image[1]?.trim() ?? "", image[2] ?? ""))
    } else if (heading?.[2]) {
      flushParagraph()
      blocks.push({
        type: "heading",
        props: { level: Math.min(Math.max(2, heading[1].length), 3) },
        content: normalizeWikiImportHeadingContent(
          markdownInlineContent(heading[2].trim()) as WikiImportInline
        ),
      })
    } else if (bullet?.[1]) {
      flushParagraph()
      blocks.push({
        type: "bulletListItem",
        content: markdownInlineContent(bullet[1].trim()),
      })
    } else if (numbered?.[1]) {
      flushParagraph()
      blocks.push({
        type: "numberedListItem",
        content: markdownInlineContent(numbered[1].trim()),
      })
    } else if (!line.trim()) {
      flushParagraph()
    } else if (isShortMarkdownStatLine(line)) {
      flushParagraph()
      blocks.push({
        type: "paragraph",
        content: markdownInlineContent(line.trim()),
      })
    } else {
      paragraphs.push(line.trimEnd())
    }
  }
  flushParagraph()

  return blocks.length ? blocks : [{ type: "paragraph", content: markdown }]
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim()
}

function isWikiImportTitleLike(value: string) {
  const normalized = normalizeImportLine(value)
  return (
    normalized.length >= 3 &&
    normalized.length <= 80 &&
    normalized.split(/\s+/).length <= 12 &&
    !/[.!?]$/.test(normalized) &&
    !/^[-*+•◦▪]|^\d+[.)]\s/.test(normalized) &&
    !normalized.includes("\t") &&
    !/\b(?:rate|points|min fico|max ltv|notes)\b.*\b(?:rate|points|min fico|max ltv|notes)\b/i.test(
      normalized
    )
  )
}

function capWikiImportTitle(value: string, fileName: string) {
  const normalized = normalizeImportLine(value)
  if (normalized && normalized.length <= 80) return normalized
  return titleFromWikiImportFileName(fileName).slice(0, 80)
}

function inferWikiImportTitle(text: string) {
  const lines = text.split("\n").filter((line) => line.trim())
  let title = normalizeImportLine(lines[0] ?? "")
  // A lower-case continuation is usually a wrapped title, unlike the next
  // capitalized line in a slide deck or ordinary document body.
  for (const line of lines.slice(1, 3)) {
    const continuation = normalizeImportLine(line)
    if (
      !continuation ||
      !/^[a-z]/.test(continuation) ||
      title.length + continuation.length + 1 > 80
    ) {
      break
    }
    title += ` ${continuation}`
  }
  return isWikiImportTitleLike(title) ? title : ""
}

function removeLeadingTitle(text: string, title: string) {
  if (!title) return text
  const titleTokens = comparableTokens(title)
  const lines = text.split("\n")
  let consumed = 0
  const seen: string[] = []
  while (consumed < lines.length && seen.length < titleTokens.length) {
    const line = lines[consumed].trim()
    if (!line) break
    seen.push(...comparableTokens(line))
    consumed += 1
    if (seen.join(" ") === titleTokens.join(" ")) {
      return lines.slice(consumed).join("\n").trim()
    }
  }
  return text
}

function toPipeTable(rows: string[][]) {
  return rows
    .map(
      (row) =>
        `| ${row.map((cell) => cell.replace(/\|/g, "\\|").trim()).join(" | ")} |`
    )
    .join("\n")
}

function normalizeTabularRow(line: string, columnCount: number) {
  const cells = line.split("\t").map((cell) => normalizeImportLine(cell))
  if (columnCount === 3 && cells.length === 2) {
    const firstCellSplit = cells[0].match(/^(.*?)\s+(\d+)$/)
    if (firstCellSplit) return [firstCellSplit[1], firstCellSplit[2], cells[1]]
    const split = cells[1].match(/^(\d+)\s+(.+)$/)
    if (split) return [cells[0], split[1], split[2]]
  }
  return cells
}

function normalizeTabularHeader(line: string) {
  const cells = line.split("\t").map((cell) => normalizeImportLine(cell))
  if (cells.length === 2) {
    const finalColumns = cells[1].match(
      /^(items?|count|total)\s+(why|reason|notes?|description)$/i
    )
    if (finalColumns) return [cells[0], finalColumns[1], finalColumns[2]]
  }
  return cells
}

function isTableSummary(line: string) {
  return /^(?:total\s+(?:left out|excluded)|without exclusions)\b/i.test(
    normalizeImportLine(line)
  )
}

function collectWrappedText(lines: string[], startIndex: number) {
  const values = [lines[startIndex].trim()]
  let index = startIndex + 1
  while (index < lines.length) {
    const candidate = lines[index].trim()
    if (
      !candidate ||
      candidate.includes("\t") ||
      /^(?:notes|links, not items):/i.test(candidate) ||
      /^[A-Z][^.!?]*:$/.test(candidate)
    ) {
      break
    }
    values.push(candidate)
    index += 1
  }
  return { text: values.join(" ").replace(/\s+/g, " "), nextIndex: index }
}

/** A lossless, readable fallback for a model timeout or malformed response. */
export function structureWikiImportFallback(text: string) {
  const sourceTitle = inferWikiImportTitle(text)
  const lines = removeLeadingTitle(text, sourceTitle).split("\n")
  const output: string[] = []
  let index = 0
  let section = ""

  const pushBlank = () => {
    if (output.length && output.at(-1) !== "") output.push("")
  }
  const isSectionHeading = (line: string, next: string) => {
    const normalized = normalizeImportLine(line)
    const isKnownSection =
      /^(also in the mix|biggest chunks|what was left out|notes)/i.test(
        normalized
      )
    return (
      normalized.length > 0 &&
      normalized.length <= 90 &&
      !normalized.includes("\t") &&
      (isKnownSection || next.includes("\t"))
    )
  }

  while (index < lines.length) {
    const line = lines[index].trim()
    const next = lines[index + 1]?.trim() ?? ""
    if (!line) {
      pushBlank()
      index += 1
      continue
    }
    const labeledCallout = line.match(/^(total left out)\s*\t\s*(.+)$/i)
    if (labeledCallout) {
      pushBlank()
      output.push(`**${labeledCallout[1]}: ${labeledCallout[2].trim()}**`)
      output.push("")
      index += 1
      continue
    }
    const withoutExclusions = line.match(/^(without exclusions):\s*(.+)$/i)
    if (withoutExclusions) {
      pushBlank()
      output.push(`**${withoutExclusions[1]}:** ${withoutExclusions[2]}`)
      output.push("")
      index += 1
      continue
    }
    if (line.includes("\t")) {
      const tableRows: string[] = [line]
      index += 1
      while (index < lines.length) {
        const candidate = lines[index].trim()
        if (!candidate) break
        if (isTableSummary(candidate)) break
        if (candidate.includes("\t")) {
          tableRows.push(candidate)
          index += 1
          continue
        }
        if (lines[index + 1]?.includes("\t")) {
          tableRows.push(`${candidate} ${lines[index + 1].trim()}`)
          index += 2
          continue
        }
        if (/^[a-z]/.test(candidate) && tableRows.length > 1) {
          tableRows[tableRows.length - 1] += ` ${candidate}`
          index += 1
          continue
        }
        break
      }
      const header = normalizeTabularHeader(tableRows[0])
      const rows = tableRows
        .slice(1)
        .map((row) => normalizeTabularRow(row, header.length))
      output.push(toPipeTable([header]))
      output.push(`| ${header.map(() => "---").join(" | ")} |`)
      output.push(toPipeTable(rows))
      output.push("")
      continue
    }
    const note = line.match(/^(links, not items|notes):\s*(.+)$/i)
    if (note) {
      if (section !== "notes") {
        pushBlank()
        output.push("## Notes")
        output.push("")
        section = "notes"
      }
      const wrapped = collectWrappedText(lines, index)
      const content = wrapped.text.replace(/^(links, not items|notes):\s*/i, "")
      output.push(`- **${note[1]}:** ${content}`)
      index = wrapped.nextIndex
      continue
    }
    if (
      line.length <= 60 &&
      /[:?]$/.test(line) &&
      /^(?:[-*+•◦▪]|\d+[.)])\s*/u.test(next)
    ) {
      pushBlank()
      output.push(`**${line}**`)
      output.push("")
      index += 1
      continue
    }
    if (isSectionHeading(line, next)) {
      pushBlank()
      output.push(`## ${line.replace(/:$/, "")}`)
      output.push("")
      section = line.toLocaleLowerCase()
      index += 1
      continue
    }
    if (/^~?\d[\d,]*$/.test(line) && next) {
      const descriptionLines = [next]
      let nextIndex = index + 2
      while (
        nextIndex < lines.length &&
        !lines[nextIndex].includes("\t") &&
        /^[a-z]/.test(lines[nextIndex].trim())
      ) {
        descriptionLines.push(lines[nextIndex].trim())
        nextIndex += 1
      }
      const description = descriptionLines.join(" ").replace(/\s+/g, " ")
      output.push(`**${line}** ${description}`)
      output.push("")
      index = nextIndex
      continue
    }
    const isCollection = /^(biggest chunks|also in the mix)/i.test(section)
    const joinsNext =
      next &&
      !next.includes("\t") &&
      (/^(items|current guides|emails\b)/i.test(next) || /^[a-z]/.test(next))
    const value = joinsNext ? `${line} ${next}` : line
    output.push(isCollection ? `- ${value}` : value)
    index += joinsNext ? 2 : 1
  }

  return {
    title: sourceTitle,
    markdown: output
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  }
}

function splitMarkdownTitle(markdown: string) {
  const lines = markdown.split("\n")
  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) return { title: "", markdown: "" }
  const match = lines[firstContentIndex].match(/^#\s+(.+)$/)
  if (!match) return { title: "", markdown }
  lines.splice(firstContentIndex, 1)
  while (lines[0]?.trim() === "") lines.shift()
  return {
    title: cleanMarkdownText(match[1]),
    markdown: lines.join("\n").trim(),
  }
}

function expectedTableCount(source: string) {
  let count = 0
  let inTable = false
  for (const line of source.split("\n")) {
    if (!line.trim()) {
      inTable = false
      continue
    }
    if (line.includes("\t")) {
      if (!inTable) count += 1
      inTable = true
    }
  }
  return count
}

function expectedHeadingCount(source: string) {
  return source.split("\n").filter((line) => {
    const normalized = normalizeImportLine(line)
    return /^(?:items to move, by section|biggest chunks|also in the mix|what was left out)/i.test(
      normalized
    )
  }).length
}

function expectedKeyFigures(source: string) {
  return source
    .split("\n")
    .map(normalizeImportLine)
    .filter((line) => /^~?\d[\d,]*$/.test(line))
}

function markdownTableCount(markdown: string) {
  return markdown.split("\n").reduce((count, line, index, lines) => {
    return isMarkdownTableDivider(lines[index + 1] ?? "") && line.includes("|")
      ? count + 1
      : count
  }, 0)
}

function hasRequiredImportStructure(source: string, markdown: string) {
  if (markdownTableCount(markdown) < expectedTableCount(source)) return false
  const requiredHeadings = expectedHeadingCount(source)
  const actualHeadings = markdown.match(/^#{2,3}\s+.+$/gm)?.length ?? 0
  if (actualHeadings < requiredHeadings) return false
  for (const keyFigure of expectedKeyFigures(source)) {
    const escaped = keyFigure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (!new RegExp(`\\*\\*${escaped}\\*\\*`).test(markdown)) return false
  }
  return true
}

function pdfTableCells(line: WikiPdfLine) {
  const cells: string[] = []
  let cell = ""
  let previous: WikiPdfLine["parts"][number] | null = null
  for (const part of line.parts) {
    if (!part.text.trim()) {
      if (cell.trim()) {
        cells.push(normalizeImportLine(cell))
        cell = ""
      } else {
        cell += part.text
      }
      previous = part
      continue
    }
    const hasColumnGap =
      previous && previous.text.trim() && part.x - previous.x >= 35
    if (hasColumnGap && cell.trim()) {
      cells.push(normalizeImportLine(cell))
      cell = ""
    }
    cell += part.text
    previous = part
  }
  if (cell.trim()) cells.push(normalizeImportLine(cell))
  return cells
}

function pdfLineToMarkdown(line: WikiPdfLine) {
  return line.text
    .replace(/^(?:[•◦▪]|,)[\s\u00a0]*/u, "- ")
    .replace(/^-[\s\u00a0]+/, "- ")
}

function pdfTableMarkdown(lines: WikiPdfLine[]) {
  const rows = lines.map((line) =>
    pdfTableCells(line).map((cell) => cell.replace(/\|/g, "\\|"))
  )
  const width = rows[0]?.length ?? 0
  if (width < 2 || rows.some((row) => row.length !== width)) return ""
  return [
    `| ${rows[0].join(" | ")} |`,
    `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

function pdfTitleLineCount(page: WikiPdfLine[], title: string) {
  const titleTokens = comparableTokens(title)
  const seen: string[] = []
  for (const [index, line] of page.entries()) {
    seen.push(...comparableTokens(line.text))
    if (seen.join(" ") === titleTokens.join(" ")) return index + 1
    if (seen.length >= titleTokens.length) break
  }
  return 0
}

/** Create a lossless Markdown fallback from PDF text coordinates. */
export function structureWikiPdfImportFallback({
  text,
  pages,
}: {
  text: string
  pages: WikiPdfLine[][]
}) {
  const firstLine = pages[0]?.[0]?.text ?? ""
  const title =
    inferWikiImportTitle(text) ||
    (isWikiImportTitleLike(firstLine) ? firstLine : "")
  const titleLineCount = pdfTitleLineCount(pages[0] ?? [], title)
  const output: string[] = []

  for (const [pageIndex, page] of pages.entries()) {
    const bodyFontSize = Math.min(
      ...page.map((line) => line.fontSize).filter((size) => size > 0)
    )
    let index = pageIndex === 0 ? titleLineCount : 0
    while (index < page.length) {
      const line = page[index]
      const cells = pdfTableCells(line)
      if (cells.length >= 3) {
        const tableLines: WikiPdfLine[] = [line]
        let next = index + 1
        while (
          next < page.length &&
          pdfTableCells(page[next]).length === cells.length
        ) {
          tableLines.push(page[next])
          next += 1
        }
        const table = tableLines.length >= 2 ? pdfTableMarkdown(tableLines) : ""
        if (table) {
          output.push(table, "")
          index = next
          continue
        }
      }

      const normalized = pdfLineToMarkdown(line)
      const isShortLabel = normalized.length <= 60 && /[:?]$/.test(normalized)
      const nextLine = page[index + 1]
      const nextHasTable = Boolean(
        nextLine && pdfTableCells(nextLine).length >= 3
      )
      const nextIsList = Boolean(
        nextLine && /^(?:[-*+•◦▪]|\d+[.)])\s*/u.test(nextLine.text)
      )
      const isHeading =
        line.fontSize >= bodyFontSize + 1.5 &&
        !/^(?:[•◦▪]|,|\d+[.)])\s*/u.test(line.text) &&
        normalized.length <= 100 &&
        (!isShortLabel || nextHasTable)
      output.push(
        isHeading
          ? `## ${normalized}`
          : nextIsList && isShortLabel
            ? `**${normalized}**`
            : normalized,
        ""
      )
      index += 1
    }
  }

  const markdown = output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const source = normalizeWikiImportText(text)
  if (isFaithfulWikiImportOutput(source, markdown, title)) {
    return { title, markdown }
  }

  // Coordinates are useful when they unambiguously describe the layout. Some
  // producers split an otherwise ordinary row into separate positioned runs;
  // in that case the text-only formatter is the more faithful deterministic
  // representation and preserves tabs, wrapped headings, and emphasis.
  const textFallback = structureWikiImportFallback(source)
  if (
    isFaithfulWikiImportOutput(
      source,
      textFallback.markdown,
      textFallback.title
    )
  ) {
    return textFallback
  }

  return { title: "", markdown: source }
}

export function buildWikiPdfStructureHints(pages: WikiPdfLine[][]) {
  const hints: string[] = []
  for (const [pageIndex, page] of pages.entries()) {
    const bodyFontSize = Math.min(
      ...page.map((line) => line.fontSize).filter((size) => size > 0)
    )
    const headings = page
      .filter((line) => line.fontSize >= bodyFontSize + 1.5)
      .map((line) => line.text)
    const hasTable = page.some((line) => pdfTableCells(line).length >= 3)
    if (headings.length || hasTable) {
      hints.push(
        `Page ${pageIndex + 1}: ${headings.length ? `headings: ${headings.join("; ")}` : ""}${headings.length && hasTable ? "; " : ""}${hasTable ? "aligned table rows" : ""}`
      )
    }
  }
  return hints.join("\n")
}

function addPdfImageBlocks(
  blocks: Array<Record<string, unknown>>,
  imageUrls: string[]
) {
  if (!imageUrls.length) return blocks
  const images = imageUrls.map((url, index) => ({
    type: "image",
    props: { url, name: `Imported image ${index + 1}`, caption: "" },
    children: [],
  }))
  const captionIndex = blocks.findIndex((block) =>
    /^(?:screenshot|figure|image):/i.test(
      wikiImportInlineText(block.content as WikiImportInline)
    )
  )
  const index = captionIndex < 0 ? blocks.length : captionIndex
  return [...blocks.slice(0, index), ...images, ...blocks.slice(index)]
}

export function createWikiImportDraft({
  text,
  fileName,
  aiOutput,
  pdfPages,
  imageUrls = [],
}: {
  text: string
  fileName: string
  aiOutput?: WikiImportAiOutput | null
  pdfPages?: WikiPdfLine[][]
  imageUrls?: string[]
}): WikiImportDraft {
  const plainText = normalizeWikiImportText(text)
  const suggested =
    typeof aiOutput?.markdown === "string"
      ? normalizeWikiImportText(aiOutput.markdown)
      : ""
  const { title: markdownTitle, markdown: suggestedMarkdown } =
    splitMarkdownTitle(suggested)
  const structuredFallback = pdfPages?.length
    ? structureWikiPdfImportFallback({
        text: plainText,
        pages: pdfPages,
      })
    : structureWikiImportFallback(plainText)
  // The deterministic formatter should be lossless too. Keep cleaned source
  // text rather than risk publishing a partial document if a new PDF layout
  // defeats one of its structural heuristics.
  const fallback = isFaithfulWikiImportOutput(
    plainText,
    structuredFallback.markdown,
    structuredFallback.title
  )
    ? structuredFallback
    : { title: "", markdown: plainText }
  const suggestedTitle =
    markdownTitle ||
    (typeof aiOutput?.title === "string"
      ? aiOutput.title.trim().replace(/\s+/g, " ").slice(0, 180)
      : "")
  const usedAi = Boolean(
    suggestedMarkdown &&
    isFaithfulWikiImportOutput(plainText, suggestedMarkdown, suggestedTitle) &&
    hasRequiredImportStructure(plainText, suggestedMarkdown)
  )
  // Positioned PDF extraction is already a faithful structural conversion;
  // retain it rather than letting a model flatten known headings or columns.
  const markdown =
    usedAi && !pdfPages?.length ? suggestedMarkdown : fallback.markdown
  const title = normalizeWikiImportTitleCase(
    capWikiImportTitle(
      fallback.title || suggestedTitle || titleFromWikiImportFileName(fileName),
      fileName
    )
  )
  const tags = normalizeWikiTags(
    Array.isArray(aiOutput?.tags)
      ? aiOutput.tags.filter((tag): tag is string => typeof tag === "string")
      : []
  ).slice(0, 5)

  const blocks = markdownToWikiImportBlocks(markdown)
  let savedBlocks = blocks
  try {
    savedBlocks = addPdfImageBlocks(blocks, imageUrls)
  } catch (error) {
    console.warn(
      "Wiki import PDF image placement failed; continuing without images",
      {
        error,
        fileName,
      }
    )
  }
  return {
    title,
    tags,
    markdown,
    blocks: savedBlocks,
    plainText: blockNoteToPlainText(savedBlocks),
    usedAi: usedAi && !pdfPages?.length,
  }
}

export function createWikiVideoImportDraft({
  assetId,
  fileName,
  transcript,
}: {
  assetId: string
  fileName: string
  transcript: string
}): WikiImportDraft {
  const transcriptDraft = createWikiImportDraft({
    text: transcript,
    fileName,
    aiOutput: null,
  })

  return {
    title: titleFromWikiImportFileName(fileName),
    tags: [],
    markdown: transcriptDraft.markdown,
    blocks: [
      {
        id: `imported-video-${assetId}`,
        type: "video",
        props: {
          url: `/api/wiki/assets/${assetId}`,
          name: fileName,
          caption: "",
          showPreview: true,
        },
        children: [],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: "Transcript",
        children: [],
      },
      ...transcriptDraft.blocks,
    ],
    plainText: transcriptDraft.plainText,
    usedAi: false,
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
