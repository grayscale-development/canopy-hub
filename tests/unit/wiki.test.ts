import { describe, expect, it } from "vitest"

import {
  blockNoteToPlainText,
  buildWikiBreadcrumbs,
  buildWikiPath,
  buildWikiTree,
  chunkKnowledgeText,
  compareWikiNodes,
  estimateTokenCount,
  formatBytes,
  getWikiAssetKind,
  isPublishedWikiBranch,
  resolveWikiPath,
  sanitizeWikiFileName,
  slugifyWikiTitle,
  validateWikiUpload,
  type WikiNodeRow,
} from "@/lib/wiki"

const baseNode = {
  status: "published",
  sort_order: 0,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
} satisfies Partial<WikiNodeRow>

function node(overrides: Partial<WikiNodeRow> & Pick<WikiNodeRow, "id">) {
  return {
    ...baseNode,
    parent_id: null,
    type: "page",
    slug: overrides.id,
    title: overrides.id,
    ...overrides,
  } as WikiNodeRow
}

describe("wiki helpers", () => {
  it("slugifies human titles into safe wiki slugs", () => {
    expect(slugifyWikiTitle("  Borrower's Guide: Nano LOS!  ")).toBe(
      "borrowers-guide-nano-los"
    )
    expect(slugifyWikiTitle("***")).toBe("untitled")
  })

  it("sanitizes uploaded file names without preserving path separators", () => {
    expect(sanitizeWikiFileName(" ../Unsafe/File   Name?.pdf ")).toBe(
      "..-Unsafe-File Name.pdf"
    )
    expect(sanitizeWikiFileName("")).toBe("upload")
  })

  it("classifies allowed assets by MIME type and extension", () => {
    expect(
      getWikiAssetKind(new File(["x"], "photo.bin", { type: "image/png" }))
    ).toBe("image")
    expect(getWikiAssetKind(new File(["x"], "guide.pdf"))).toBe("document")
    expect(getWikiAssetKind(new File(["x"], "demo.webm"))).toBe("video")
    expect(getWikiAssetKind(new File(["x"], "script.exe"))).toBeNull()
  })

  it("validates upload size and type", () => {
    expect(validateWikiUpload(new File([], "empty.txt"))).toBe("File is empty.")
    expect(validateWikiUpload(new File(["hello"], "notes.txt"))).toBeNull()
    expect(validateWikiUpload(new File(["hello"], "notes.exe"))).toBe(
      "Only image, document, and video uploads are allowed."
    )
  })

  it("builds sorted tree paths with folders before pages", () => {
    const nodes = [
      node({ id: "page", title: "Overview", slug: "overview" }),
      node({
        id: "root",
        type: "folder",
        title: "Canopy",
        slug: "canopy",
        sort_order: 0,
      }),
      node({
        id: "section",
        parent_id: "root",
        type: "folder",
        title: "Operations",
        slug: "operations",
      }),
      node({
        id: "child",
        parent_id: "section",
        title: "Publishing",
        slug: "publishing",
      }),
    ]

    const tree = buildWikiTree(nodes)

    expect(tree.map((item) => item.id)).toEqual(["root", "page"])
    expect(tree[0]?.path).toBe("canopy")
    expect(tree[0]?.children[0]?.path).toBe("canopy/operations")
    expect(tree[0]?.children[0]?.children[0]?.path).toBe(
      "canopy/operations/publishing"
    )
  })

  it("resolves paths and breadcrumbs case-insensitively", () => {
    const nodes = [
      node({ id: "root", type: "folder", slug: "canopy", title: "Canopy" }),
      node({
        id: "page",
        parent_id: "root",
        slug: "getting-started",
        title: "Getting Started",
      }),
    ]

    const resolved = resolveWikiPath(nodes, ["CANOPY", "Getting-Started"])

    expect(resolved?.id).toBe("page")
    expect(buildWikiBreadcrumbs(nodes, resolved as WikiNodeRow)).toHaveLength(2)
    expect(buildWikiPath(nodes, resolved as WikiNodeRow)).toBe(
      "canopy/getting-started"
    )
  })

  it("only treats a node as viewer-visible when its full branch is published", () => {
    const root = node({
      id: "root",
      type: "folder",
      slug: "root",
      title: "Root",
    })
    const draftParent = node({
      id: "draft-parent",
      parent_id: "root",
      type: "folder",
      slug: "draft-parent",
      title: "Draft Parent",
      status: "draft",
    })
    const publishedChild = node({
      id: "published-child",
      parent_id: "draft-parent",
      slug: "published-child",
      title: "Published Child",
    })

    expect(
      isPublishedWikiBranch([root, draftParent, publishedChild], root)
    ).toBe(true)
    expect(
      isPublishedWikiBranch([root, draftParent, publishedChild], publishedChild)
    ).toBe(false)
    expect(isPublishedWikiBranch([publishedChild], publishedChild)).toBe(false)
  })

  it("compares folders, sort order, and title", () => {
    const folder = node({ id: "folder", type: "folder", title: "Z" })
    const page = node({ id: "page", type: "page", title: "A" })
    const alpha = node({ id: "alpha", title: "Alpha", sort_order: 1 })
    const beta = node({ id: "beta", title: "Beta", sort_order: 1 })

    expect(compareWikiNodes(folder, page)).toBeLessThan(0)
    expect(compareWikiNodes(alpha, beta)).toBeLessThan(0)
  })

  it("extracts plain text from nested BlockNote-like blocks", () => {
    const blocks = [
      {
        content: [{ text: "Heading" }],
        children: [{ content: "Nested item" }],
      },
      {
        content: [{ text: "Second" }, { text: "paragraph" }],
      },
    ]

    expect(blockNoteToPlainText(blocks)).toBe(
      "Heading\nNested item\n\nSecond paragraph"
    )
    expect(blockNoteToPlainText({})).toBe("")
  })

  it("chunks normalized knowledge text near sentence boundaries", () => {
    const chunks = chunkKnowledgeText("First sentence. Second sentence.", 20)

    expect(chunks).toEqual(["First sentence.", "Second sentence."])
    expect(chunkKnowledgeText("   ")).toEqual([])
  })

  it("formats approximate sizes and token counts", () => {
    expect(estimateTokenCount("12345678")).toBe(2)
    expect(formatBytes(900)).toBe("900 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB")
  })
})
