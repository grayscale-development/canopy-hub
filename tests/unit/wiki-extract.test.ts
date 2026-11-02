import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { extractWikiDocumentText } from "@/lib/wiki-extract"

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
  it("extracts CID-encoded text from the real PDF fixture", async () => {
    const pdf = new File(
      [await readFile("tests/fixtures/wiki-import-cid-text.pdf")],
      "wiki-import-cid-text.pdf",
      { type: "application/pdf" }
    )

    await expect(extractWikiDocumentText(pdf)).resolves.toContain(
      "Training Wiki"
    )
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
