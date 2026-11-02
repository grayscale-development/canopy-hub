import "server-only"

import { createTranscriptionWithOpenAI } from "@/lib/ai/provider"

const PDF_PAGE_MARKER = /^[-–—\s]*\d+\s+(?:of|\/)\s+\d+[-–—\s]*$/i

export interface WikiExtractedDocxImage {
  contentType: string
  data: Buffer
  source: string
}

export interface WikiExtractedDocx {
  html: string
  images: WikiExtractedDocxImage[]
  text: string
}

export function isWikiDocxFile(file: Pick<File, "name" | "type">) {
  return (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  )
}

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

  if (isWikiDocxFile(file)) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }

  return ""
}

/**
 * DOCX needs its HTML as well as its text: raw text is useful for search and
 * fidelity checks, while Mammoth's HTML retains the document's actual layout.
 * Image sources are deliberately opaque placeholders so callers can replace
 * them with their own durable asset URLs before rendering the blocks.
 */
export async function extractWikiDocxDocument(
  file: File
): Promise<WikiExtractedDocx> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const mammoth = await import("mammoth")
  const images: WikiExtractedDocxImage[] = []

  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h3:fresh",
          "p[style-name='Heading 5'] => h3:fresh",
          "p[style-name='Heading 6'] => h3:fresh",
        ],
        convertImage: mammoth.images.imgElement(async (image) => {
          const index = images.length + 1
          const source = `wiki-import-image://${index}`
          images.push({
            contentType: image.contentType || "application/octet-stream",
            data: await image.readAsBuffer(),
            source,
          })
          return { src: source }
        }),
      }
    ),
    mammoth.extractRawText({ buffer }),
  ])

  return {
    html: htmlResult.value,
    images,
    text: textResult.value.trim(),
  }
}

export async function extractWikiVideoText(file: File) {
  return createTranscriptionWithOpenAI(file)
}
