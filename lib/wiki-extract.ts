import "server-only"

import { createTranscriptionWithOpenAI } from "@/lib/ai/provider"

const PDF_PAGE_MARKER = /^[-–—\s]*\d+\s+(?:of|\/)\s+\d+[-–—\s]*$/i

function normalizedBoundaryLine(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Keep the PDF reader's page-level layout rather than its flattened `text`
 * field. Repeated top/bottom boundary strings are page furniture; only remove
 * those when they recur on more than one page so document content is safe.
 */
export function cleanWikiPdfPageText(pages: Array<{ text: string }>) {
  const boundaryCounts = new Map<string, number>()
  const pageLines = pages.map((page) =>
    page.text.split("\n").map((line) => line.trimEnd())
  )

  for (const lines of pageLines) {
    for (const line of [
      lines.find((value) => value.trim()),
      ...[...lines]
        .reverse()
        .filter((value) => value.trim())
        .slice(0, 1),
    ]) {
      const normalized = line ? normalizedBoundaryLine(line) : ""
      if (normalized && !PDF_PAGE_MARKER.test(normalized)) {
        boundaryCounts.set(
          normalized,
          (boundaryCounts.get(normalized) ?? 0) + 1
        )
      }
    }
  }

  return pageLines
    .map((lines) =>
      lines
        .filter((line, index) => {
          const normalized = normalizedBoundaryLine(line)
          if (PDF_PAGE_MARKER.test(normalized)) return false
          const isBoundary = index === 0 || index === lines.length - 1
          return !(isBoundary && (boundaryCounts.get(normalized) ?? 0) > 1)
        })
        .join("\n")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n")
}

export async function extractWikiDocumentText(file: File) {
  const lowerName = file.name.toLowerCase()

  if (
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    return (await file.text()).trim()
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return cleanWikiPdfPageText(result.pages).trim()
    } finally {
      await parser.destroy()
    }
  }

  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }

  return ""
}

export async function extractWikiVideoText(file: File) {
  return createTranscriptionWithOpenAI(file)
}
