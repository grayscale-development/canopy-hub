import "server-only"

import { createTranscriptionWithOpenAI } from "@/lib/ai/provider"

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
      return result.text.trim()
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
