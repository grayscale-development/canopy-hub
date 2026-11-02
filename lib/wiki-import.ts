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

The import must be faithful: preserve every fact, instruction, number, name, URL, warning, and list item from the source. Do not add facts, infer missing details, summarize, or omit content. You may only clean broken line wraps, repeated whitespace, PDF page markers/headers/footers, and obvious pasted-document artifacts.

Return polished Markdown that a non-technical person could publish as-is:
- Start markdown with exactly one # H1 document title. It will become the Wiki page title and will be removed from the editor body, so never repeat that title later in the Markdown.
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
    content: {
      type: "tableContent",
      headerRows: 1,
      rows: [header, ...rows].map((row) => ({
        cells: Array.from({ length: width }, (_, index) =>
          markdownInlineContent(row[index] ?? "")
        ),
      })),
    },
  }
}

function isShortMarkdownStatLine(value: string) {
  const trimmed = value.trim()
  return trimmed.length <= 180 && /^\*\*[^*\n]+\*\*(?:\s+.+)?$/.test(trimmed)
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

    if (heading?.[2]) {
      flushParagraph()
      blocks.push({
        type: "heading",
        props: { level: Math.min(Math.max(2, heading[1].length), 3) },
        content: markdownInlineContent(heading[2].trim()),
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

function inferWikiImportTitle(text: string) {
  const lines = text.split("\n").filter((line) => line.trim())
  if (lines.length < 3) return ""

  const titleLines: string[] = []
  for (const line of lines.slice(0, 3)) {
    if (line.includes("\t")) break
    const normalized = normalizeImportLine(line)
    if (!normalized || /[.!?]$/.test(normalized)) break
    if (
      titleLines.length &&
      /[·|]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
        normalized
      )
    ) {
      break
    }
    titleLines.push(normalized)
    if (/[.!?]$/.test(normalized)) break
  }
  const title = titleLines.join(" ")
  return titleLines.length >= 1 && title.length >= 8 && title.length <= 180
    ? title
    : ""
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
    return (
      normalized.length > 0 &&
      normalized.length <= 90 &&
      !normalized.includes("\t") &&
      (/[:?]$/.test(normalized) ||
        next.includes("\t") ||
        /^(also in the mix|biggest chunks|what was left out|notes)/i.test(
          normalized
        ))
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
  const suggested =
    typeof aiOutput?.markdown === "string"
      ? normalizeWikiImportText(aiOutput.markdown)
      : ""
  const { title: markdownTitle, markdown: suggestedMarkdown } =
    splitMarkdownTitle(suggested)
  const structuredFallback = structureWikiImportFallback(plainText)
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
  const markdown = usedAi ? suggestedMarkdown : fallback.markdown
  const title =
    fallback.title || suggestedTitle || titleFromWikiImportFileName(fileName)
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
