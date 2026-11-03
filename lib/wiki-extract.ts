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

export interface WikiPdfLinePart {
  text: string
  x: number
  width: number
}

export interface WikiPdfLine {
  text: string
  parts: WikiPdfLinePart[]
  fontSize: number
}

export interface WikiExtractedPdfImage {
  contentType: string
  data: Buffer
  source: string
}

export interface WikiExtractedPdf {
  images: WikiExtractedPdfImage[]
  pages: WikiPdfLine[][]
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

function pdfLineText(parts: WikiPdfLinePart[]) {
  return parts
    .map((part) => part.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Preserve the coordinates that PDF text extraction otherwise throws away.
 * Those coordinates are enough to recognize real headings, bullets, and
 * spreadsheet-style rows without asking a model to reconstruct the layout.
 */
export async function extractWikiPdfDocument(
  file: File
): Promise<WikiExtractedPdf> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) })
  const images: WikiExtractedPdfImage[] = []

  try {
    const textResult = await parser.getText()
    const document = (
      parser as unknown as {
        doc?: {
          numPages: number
          getPage(pageNumber: number): Promise<{
            getTextContent(): Promise<{
              items: Array<{
                str?: string
                transform?: number[]
                width?: number
              }>
            }>
          }>
        }
      }
    ).doc
    const pages: WikiPdfLine[][] = []

    for (
      let pageNumber = 1;
      pageNumber <= (document?.numPages ?? 0);
      pageNumber += 1
    ) {
      const page = await document!.getPage(pageNumber)
      const content = await page.getTextContent()
      const rows: Array<{
        y: number
        parts: Array<WikiPdfLinePart & { fontSize: number }>
      }> = []

      for (const item of content.items) {
        const text = item.str ?? ""
        const transform = item.transform
        if (!text || !transform) continue
        const y = transform[5] ?? 0
        const fontSize = Math.max(
          Math.abs(transform[0] ?? 0),
          Math.abs(transform[3] ?? 0)
        )
        const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 3)
        const part = {
          text,
          x: transform[4] ?? 0,
          width: item.width ?? 0,
          fontSize,
        }
        if (row) {
          row.parts.push(part)
        } else {
          rows.push({ y, parts: [part] })
        }
      }

      pages.push(
        rows
          .sort((left, right) => right.y - left.y)
          .map((row) => {
            const parts = row.parts.sort((left, right) => left.x - right.x)
            return {
              text: pdfLineText(parts),
              parts: parts.map(({ text, x, width }) => ({ text, x, width })),
              fontSize: Math.max(...parts.map((part) => part.fontSize)),
            }
          })
          .filter((line) => line.text)
      )
    }

    // Image extraction is opportunistic: some PDFs have no compatible image
    // objects, which must never make an otherwise readable import fail.
    try {
      const result = await parser.getImage({
        imageBuffer: true,
        imageThreshold: 32,
      })
      for (const page of result.pages) {
        for (const image of page.images) {
          if (!image.data?.length) continue
          const source = `wiki-import-pdf-image://${images.length + 1}`
          images.push({
            contentType: "image/png",
            data: Buffer.from(image.data),
            source,
          })
        }
      }
    } catch (error) {
      // PDF image APIs vary by producer and runtime; text import remains safe.
      console.warn(
        "Wiki import PDF image extraction failed; continuing without images",
        {
          error,
          fileName: file.name,
        }
      )
    }

    return {
      images,
      pages,
      text: cleanWikiPdfPageText(textResult.pages).trim(),
    }
  } finally {
    await parser.destroy()
  }
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
    return (await extractWikiPdfDocument(file)).text
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
