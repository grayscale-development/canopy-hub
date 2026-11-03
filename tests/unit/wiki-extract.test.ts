import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  cleanWikiPdfPageText,
  extractWikiDocumentText,
  extractWikiPdfDocument,
} from "@/lib/wiki-extract"
import {
  createWikiImportDraft,
  structureWikiPdfImportFallback,
} from "@/lib/wiki-import"

function writeUint16(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer).setUint16(offset, value, true)
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer).setUint32(offset, value, true)
}

function crc32(value: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createStoredZip(entries: Record<string, string>) {
  const encoder = new TextEncoder()
  const files = Object.entries(entries).map(([name, text]) => ({
    name: encoder.encode(name),
    value: encoder.encode(text),
  }))
  const localFiles: Uint8Array[] = []
  const centralDirectory: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const checksum = crc32(file.value)
    const local = new Uint8Array(30 + file.name.length + file.value.length)
    writeUint32(local, 0, 0x04034b50)
    writeUint16(local, 4, 20)
    writeUint32(local, 14, checksum)
    writeUint32(local, 18, file.value.length)
    writeUint32(local, 22, file.value.length)
    writeUint16(local, 26, file.name.length)
    local.set(file.name, 30)
    local.set(file.value, 30 + file.name.length)
    localFiles.push(local)

    const central = new Uint8Array(46 + file.name.length)
    writeUint32(central, 0, 0x02014b50)
    writeUint16(central, 4, 20)
    writeUint16(central, 6, 20)
    writeUint32(central, 16, checksum)
    writeUint32(central, 20, file.value.length)
    writeUint32(central, 24, file.value.length)
    writeUint16(central, 28, file.name.length)
    writeUint32(central, 42, offset)
    central.set(file.name, 46)
    centralDirectory.push(central)
    offset += local.length
  }

  const directoryLength = centralDirectory.reduce(
    (length, entry) => length + entry.length,
    0
  )
  const end = new Uint8Array(22)
  writeUint32(end, 0, 0x06054b50)
  writeUint16(end, 8, files.length)
  writeUint16(end, 10, files.length)
  writeUint32(end, 12, directoryLength)
  writeUint32(end, 16, offset)

  return new Blob(
    [...localFiles, ...centralDirectory, end].map(
      (entry) => new Uint8Array(entry)
    )
  )
}

function createDocxFile() {
  return new File(
    [
      createStoredZip({
        "[Content_Types].xml":
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels":
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml":
          '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX extraction works</w:t></w:r></w:p></w:body></w:document>',
      }),
    ],
    "sample.docx",
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
  )
}

describe("extractWikiDocumentText", () => {
  it("keeps page layout while removing repeated PDF furniture", () => {
    expect(
      cleanWikiPdfPageText([
        { text: "Canopy Wiki\nFirst page\n-- 1 of 2 --" },
        { text: "Canopy Wiki\nSecond page\n-- 2 of 2 --" },
      ])
    ).toBe("First page\n\nSecond page")
  })

  it("keeps the CID PDF structured when the AI response is unusable", async () => {
    const fileName = "wiki-import-cid-text.pdf"
    const pdf = new File(
      [await readFile("tests/fixtures/wiki-import-cid-text.pdf")],
      fileName,
      { type: "application/pdf" }
    )

    const extracted = await extractWikiPdfDocument(pdf)
    expect(extracted.text).toContain("Training Wiki")
    const draft = createWikiImportDraft({
      text: extracted.text,
      fileName,
      pdfPages: extracted.pages,
      aiOutput: {
        title: "Canopy Hub Migration Counts",
        tags: [],
        markdown: "# Canopy Hub Migration Counts\n\nPlain text only.",
      },
    })

    expect(draft.usedAi).toBe(false)
    expect(draft.title).toBe("Training Wiki → Canopy Hub: what needs to move")
    const h2Headings = draft.blocks.filter(
      (block) =>
        block.type === "heading" &&
        (block.props as { level?: number } | undefined)?.level === 2
    )
    expect(h2Headings.length).toBeGreaterThanOrEqual(3)
    expect(draft.blocks.filter((block) => block.type === "table")).toHaveLength(2)
    expect(JSON.stringify(draft.blocks)).toContain('"bold":true')
    expect(draft.markdown).not.toContain("-- 1 of 2 --")
  })

  it("imports the password-reset PDF with its table and image", async () => {
    const fileName = "it-password-reset-doc.pdf"
    const extracted = await extractWikiPdfDocument(
      new File(
        [await readFile(`tests/fixtures/wiki-samples/${fileName}`)],
        fileName,
        { type: "application/pdf" }
      )
    )
    const createDraft = () =>
      createWikiImportDraft({
        text: extracted.text,
        fileName,
        pdfPages: extracted.pages,
        imageUrls: extracted.images.map(
          (_, index) => `/api/wiki/assets/imported-image-${index + 1}`
        ),
      })

    expect(createDraft).not.toThrow()
    const draft = createDraft()
    expect(draft.blocks).toContainEqual(
      expect.objectContaining({
        type: "heading",
        props: { level: 2 },
        content: "Steps",
      })
    )
    expect(draft.blocks).toContainEqual(
      expect.objectContaining({
        type: "table",
        content: expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({ cells: expect.any(Array) }),
          ]),
        }),
      })
    )
    const table = draft.blocks.find((block) => block.type === "table")
    expect(
      (table?.content as { rows: Array<{ cells: unknown[] }> }).rows[0].cells
    ).toHaveLength(3)
    expect(draft.blocks).toContainEqual(
      expect.objectContaining({ type: "image" })
    )
  })

  it("keeps short PDF labels out of headings and bolds labels before lists", () => {
    const fallback = structureWikiPdfImportFallback({
      text: "Password reset\nSteps:\n• Reset your password\nQuestions?\nAsk IT.",
      pages: [
        [
          {
            text: "Password reset",
            parts: [{ text: "Password reset", x: 0, width: 80 }],
            fontSize: 18,
          },
          {
            text: "Steps:",
            parts: [{ text: "Steps:", x: 0, width: 30 }],
            fontSize: 14,
          },
          {
            text: "• Reset your password",
            parts: [{ text: "• Reset your password", x: 0, width: 90 }],
            fontSize: 10,
          },
          {
            text: "Questions?",
            parts: [{ text: "Questions?", x: 0, width: 50 }],
            fontSize: 14,
          },
          {
            text: "Ask IT.",
            parts: [{ text: "Ask IT.", x: 0, width: 35 }],
            fontSize: 10,
          },
        ],
      ],
    })

    expect(fallback.markdown).toContain("**Steps:**")
    expect(fallback.markdown).not.toContain("## Steps")
    expect(fallback.markdown).not.toContain("## Questions?")
  })

  it.each([
    ["chenoa-deck.pdf", "Chenoa Fund Overview", 2, 0],
    ["rate-sheet.pdf", "Rate Sheet", 0, 6],
    ["it-password-reset-doc.pdf", "IT Support: Password Reset Guide", 3, 3],
  ])(
    "uses PDF layout for %s",
    async (fileName, expectedTitle, headingCount, tableColumns) => {
      const extracted = await extractWikiPdfDocument(
        new File(
          [await readFile(`tests/fixtures/wiki-samples/${fileName}`)],
          fileName,
          { type: "application/pdf" }
        )
      )
      const draft = createWikiImportDraft({
        text: extracted.text,
        fileName,
        pdfPages: extracted.pages,
      })
      const tables = draft.blocks.filter((block) => block.type === "table")

      expect(draft.title).toBe(expectedTitle)
      expect(draft.title.length).toBeLessThanOrEqual(80)
      expect(
        draft.blocks.filter((block) => block.type === "heading")
      ).toHaveLength(headingCount)
      if (tableColumns) {
        expect(tables).toHaveLength(1)
        const rows = tables[0].content as { rows: Array<{ cells: unknown[] }> }
        expect(rows.rows[0].cells).toHaveLength(tableColumns)
      }
      if (fileName === "it-password-reset-doc.pdf") {
        expect(
          draft.blocks.filter((block) => block.type === "bulletListItem")
        ).toHaveLength(2)
        expect(extracted.images).toHaveLength(1)
      }
      if (fileName === "rate-sheet.pdf") {
        expect(tables[0]).toMatchObject({
          content: {
            rows: expect.arrayContaining([
              {
                cells: [
                  "Product",
                  "Rate",
                  "Points",
                  "Min FICO",
                  "Max LTV",
                  "Notes",
                ],
              },
            ]),
          },
        })
      }
    }
  )

  it("keeps the title slide as a title and subtitle, then makes each content slide a section", async () => {
    const file = new File(
      [await readFile("tests/fixtures/wiki-samples/chenoa-deck.pdf")],
      "chenoa-deck.pdf",
      { type: "application/pdf" }
    )
    const extracted = await extractWikiPdfDocument(file)
    const fallback = structureWikiPdfImportFallback({
      text: extracted.text,
      pages: extracted.pages,
    })
    expect(fallback.markdown).toContain("Processor Training")
    expect(fallback.markdown).toContain("## Eligibility")
    expect(fallback.markdown).toContain("## Down payment assistance")
  })

  it("extracts DOCX, plain text, and Markdown files", async () => {
    await expect(extractWikiDocumentText(createDocxFile())).resolves.toContain(
      "DOCX extraction works"
    )
    await expect(
      extractWikiDocumentText(new File([" Plain text "], "sample.txt"))
    ).resolves.toBe("Plain text")
    await expect(
      extractWikiDocumentText(new File([" # Markdown "], "sample.md"))
    ).resolves.toBe("# Markdown")
  })
})
